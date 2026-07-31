import { Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ── InterviewerStage (Module 7C) ──
//
// The one thing on screen that matters: the interviewer's current message.
// Deliberately not a chat log — one question at a time, full attention.
// Thinking is a quiet breathing avatar, not the phase-narration used
// elsewhere in the product (AIThinkingPanel) — that narration describes a
// PIPELINE ("reading your resume…"), which reads as a machine mid-
// conversation here. A pause should read like a person composing a
// follow-up, not a progress bar.

export function InterviewerStage({
  interviewerLabel,
  message,
  isSpeaking,
  isThinking,
  onReplay,
  canReplay,
}: {
  interviewerLabel: string;
  message: string;
  isSpeaking: boolean;
  isThinking: boolean;
  onReplay: () => void;
  canReplay: boolean;
}) {
  return (
    <div className="flex flex-col items-center px-5 py-8 text-center md:px-6 md:py-12">
      <div className="relative grid h-14 w-14 place-items-center">
        <span
          className={cn(
            "absolute inset-0 rounded-full bg-gradient-to-br from-[#2563EB]/30 to-[#7C3AED]/40",
            (isSpeaking || isThinking) && "animate-ai-breathe",
          )}
        />
        <span className="relative font-display text-lg font-semibold text-white">
          {interviewerLabel.charAt(0)}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-white/60">
        {interviewerLabel}
        {isSpeaking && <span className="text-[#7C9CFF]">· speaking</span>}
        {isThinking && <span className="text-white/40">· thinking</span>}
      </div>

      {isThinking ? (
        <div className="mt-6 flex items-center gap-1.5">
          <span className="h-2 w-2 animate-bounce rounded-full bg-white/40 [animation-delay:-0.3s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-white/40 [animation-delay:-0.15s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-white/40" />
        </div>
      ) : (
        <>
          <p className="mt-5 max-w-2xl text-balance font-display text-lg font-medium leading-snug text-white sm:text-xl md:mt-6 md:text-2xl">
            {message}
          </p>
          {canReplay && (
            <button
              onClick={onReplay}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-white/50 transition-colors hover:bg-white/5 hover:text-white/80"
            >
              <Volume2 className="h-3.5 w-3.5" /> Replay
            </button>
          )}
        </>
      )}
    </div>
  );
}
