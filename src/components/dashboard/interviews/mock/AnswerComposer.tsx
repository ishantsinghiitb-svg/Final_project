import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Mic, MicOff, Send, SkipForward, Square } from "lucide-react";
import { MOCK_INTERVIEW_MAX_ANSWER_CHARS } from "@/features/mock-interview/constants";
import { joinSpoken } from "@/features/mock-interview/dictation";
import type { useInterviewVoice } from "@/features/mock-interview/voice/useInterviewVoice";
import type { AnswerInputMode } from "@/features/mock-interview/types";
import { cn } from "@/lib/utils";
import { VoiceSettingsPopover } from "./VoiceSettingsPopover";

// ── AnswerComposer (Module 7C) ──
//
// Typing always works; the mic is additive.
//
// ── Why the text is assembled from two pieces ──
// Speech recognition hands back words in two states: provisional ("interim")
// words that are still being revised as you speak, and finalized ones. The
// obvious implementation — commit finals into the textarea and show interim
// in a separate line underneath — is what made dictation feel broken: the
// candidate watched their sentence sit in one box, vanish, and reappear in
// another every time the engine finalized a segment, which read as the answer
// being chopped into blocks.
//
// So the committed draft and the in-flight interim are rendered as ONE string
// (`displayText`). Finalization swaps words from the interim half to the
// committed half in the same tick, so nothing moves on screen — the text just
// stops changing. That is what "Google Docs voice typing" actually feels like,
// and it holds across silence gaps because the transport transparently
// restarts recognition (see BrowserVoiceTransport).
//
// The answer is only ever finalized by an explicit act: Send, Enter, or
// stopping the mic. A pause never submits.
//
// ── Why the box measures itself ──
// A fixed tall textarea pushed Send/Skip/mic below the fold on short viewports
// and laptops, so the candidate had to scroll (or zoom out) to submit. It now
// grows with content between a comfortable floor and a viewport-relative
// ceiling, then scrolls internally.

function draftKey(sessionId: string, turnIndex: number): string {
  return `nextoffer.mock-interview.draft.${sessionId}.${turnIndex}`;
}

export function AnswerComposer({
  sessionId,
  turnIndex,
  voice,
  onSubmit,
  onSkip,
  isSubmitting,
  disabled,
}: {
  sessionId: string;
  turnIndex: number;
  voice: ReturnType<typeof useInterviewVoice>;
  onSubmit: (answer: string, inputMode: AnswerInputMode) => void;
  onSkip: () => void;
  isSubmitting: boolean;
  disabled: boolean;
}) {
  const [committed, setCommitted] = useState("");
  const usedVoiceRef = useRef(false);
  const usedTypingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // What the candidate actually sees and submits: everything finalized so far,
  // plus whatever is still being spoken right now.
  const interim = voice.listening ? voice.interimText : "";
  const displayText = interim ? joinSpoken(committed, interim) : committed;

  // Restore/reset the draft whenever the question changes.
  useEffect(() => {
    const saved =
      typeof window === "undefined"
        ? null
        : window.sessionStorage.getItem(draftKey(sessionId, turnIndex));
    setCommitted(saved ?? "");
    usedVoiceRef.current = false;
    usedTypingRef.current = false;
  }, [sessionId, turnIndex]);

  // Only the committed half is persisted — interim words are provisional by
  // definition and would resurrect as duplicates on a refresh.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(draftKey(sessionId, turnIndex), committed);
  }, [committed, sessionId, turnIndex]);

  // Grow to fit, then scroll. Measured against the real rendered content
  // rather than a row count, so wrapped long answers size correctly too.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const maxPx = Math.max(120, Math.round(window.innerHeight * 0.28));
    el.style.height = `${Math.min(el.scrollHeight, maxPx)}px`;
    // Keep the newest dictated words in view while speaking.
    if (voice.listening) el.scrollTop = el.scrollHeight;
  }, [displayText, voice.listening]);

  function clearDraft() {
    if (typeof window === "undefined") return;
    window.sessionStorage.removeItem(draftKey(sessionId, turnIndex));
  }

  function handleMicToggle() {
    if (voice.listening) {
      // Stopping must KEEP what was just said. Without the flush the last
      // phrase — still provisional at the instant of the click, and visible on
      // screen — was thrown away by the mic teardown, so pressing Stop deleted
      // the end of the answer.
      voice.stopListening({ flush: true });
      return;
    }
    usedVoiceRef.current = true;
    voice.startListening((chunk) => setCommitted((current) => joinSpoken(current, chunk)));
  }

  function inputMode(): AnswerInputMode {
    if (usedVoiceRef.current && usedTypingRef.current) return "mixed";
    if (usedVoiceRef.current) return "voice";
    return "text";
  }

  const handleSubmit = useCallback(() => {
    // Read through `displayText` so words still in flight when Send is pressed
    // are part of the answer rather than discarded.
    const answer = displayText.trim();
    if (!answer || isSubmitting || disabled) return;
    voice.stopListening();
    clearDraft();
    onSubmit(answer.slice(0, MOCK_INTERVIEW_MAX_ANSWER_CHARS), inputMode());
    setCommitted("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayText, isSubmitting, disabled, voice, onSubmit]);

  function handleSkip() {
    voice.stopListening();
    clearDraft();
    setCommitted("");
    onSkip();
  }

  // Opt-in auto-send: the timer resets on every new final chunk or interim
  // update while listening, so it only fires after SUSTAINED silence — a pause
  // to think keeps resetting it and never submits. Off by default.
  const autoSendSeconds = voice.prefs.autoSendAfterSilenceSeconds;
  useEffect(() => {
    if (!voice.listening || autoSendSeconds == null || !displayText.trim()) return;
    const id = setTimeout(() => handleSubmit(), autoSendSeconds * 1000);
    return () => clearTimeout(id);
  }, [voice.listening, voice.interimText, displayText, autoSendSeconds, handleSubmit]);

  const overLimit = displayText.length > MOCK_INTERVIEW_MAX_ANSWER_CHARS;
  const canSend = Boolean(displayText.trim()) && !isSubmitting && !disabled;

  return (
    <div className="shrink-0 border-t border-white/10 bg-[oklch(0.12_0.02_265)] px-3 py-3 md:px-6 md:py-4">
      <div className="mx-auto max-w-4xl">
        <div
          className={cn(
            "rounded-xl border bg-white/[0.04] px-1 py-1 transition-colors",
            voice.listening ? "border-[#2563EB]/50" : "border-white/10",
          )}
        >
          <textarea
            ref={textareaRef}
            value={displayText}
            onChange={(e) => {
              usedTypingRef.current = true;
              // The candidate is editing the combined string, so it becomes
              // the new committed draft wholesale and any in-flight interim is
              // dropped — otherwise those same words would arrive again on the
              // next final and duplicate.
              setCommitted(e.target.value);
              voice.clearInterim();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            disabled={disabled}
            rows={2}
            placeholder="Type your answer, or use the microphone…"
            aria-label="Your answer"
            className="block max-h-[28vh] min-h-[76px] w-full resize-none bg-transparent px-2.5 py-2 text-[15px] leading-relaxed text-white placeholder:text-white/30 focus:outline-none"
          />

          {(voice.listening || voice.micError || overLimit) && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2.5 pb-1.5 text-xs">
              {voice.listening && (
                <span className="inline-flex items-center gap-1.5 text-[#7C9CFF]">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#7C9CFF] opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#7C9CFF]" />
                  </span>
                  Listening — pause as long as you like, then press Send when you're done
                </span>
              )}
              {voice.micError && <span className="text-[#FDA4AF]">{voice.micError}</span>}
              {overLimit && (
                <span className="text-[#FDA4AF]">
                  Only the first {MOCK_INTERVIEW_MAX_ANSWER_CHARS.toLocaleString()} characters will
                  be used.
                </span>
              )}
            </div>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {voice.capabilities.recognition ? (
              <button
                onClick={handleMicToggle}
                disabled={disabled}
                aria-pressed={voice.listening}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50",
                  voice.listening
                    ? "border-[#2563EB]/50 bg-[#2563EB]/25 text-white"
                    : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10",
                )}
              >
                {voice.listening ? (
                  <>
                    <Square className="h-3 w-3 fill-current" /> Stop
                  </>
                ) : (
                  <>
                    <Mic className="h-3.5 w-3.5" /> Voice
                  </>
                )}
              </button>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs text-white/40">
                <MicOff className="h-3.5 w-3.5" /> Voice input isn't supported in this browser
              </span>
            )}

            <VoiceSettingsPopover voice={voice} />

            <button
              onClick={handleSkip}
              disabled={disabled}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-white/50 transition-colors hover:bg-white/5 hover:text-white/80 disabled:opacity-50"
            >
              <SkipForward className="h-3.5 w-3.5" /> Skip
            </button>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!canSend}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-[#2563EB] to-[#7C3AED] px-4 py-1.5 text-sm font-semibold text-white shadow-[0_4px_14px_-4px_rgba(37,99,235,0.6)] transition-all hover:-translate-y-px disabled:pointer-events-none disabled:opacity-40"
          >
            <Send className="h-3.5 w-3.5" /> Send answer
          </button>
        </div>
      </div>
    </div>
  );
}
