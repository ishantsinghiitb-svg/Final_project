import { useCallback, useEffect, useRef, useState } from "react";
import { createVoiceTransport } from "./index";
import { loadVoicePrefs, saveVoicePrefs, type VoicePrefs } from "./prefs";
import type { VoiceOption } from "./types";

// ── useInterviewVoice (Module 7C) ──
//
// The studio's only touchpoint with the voice transport. Owns the transport
// instance's lifecycle (created once per studio mount, disposed on unmount),
// mic/speaking state, and localStorage-persisted preferences. Never talks to
// SpeechSynthesis/SpeechRecognition directly — see voice/types.ts.

export function useInterviewVoice() {
  const transportRef = useRef(createVoiceTransport());
  const transport = transportRef.current;

  const [prefs, setPrefsState] = useState<VoicePrefs>(() => loadVoicePrefs());
  const [ready, setReady] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [micError, setMicError] = useState<string | null>(null);
  const [voices, setVoices] = useState<VoiceOption[]>([]);

  const setPrefs = useCallback((next: Partial<VoicePrefs>) => {
    setPrefsState((current) => {
      const merged = { ...current, ...next };
      saveVoicePrefs(merged);
      return merged;
    });
  }, []);

  useEffect(() => () => transport.dispose(), [transport]);

  /** Must be called from inside a user-gesture handler (e.g. the Start Interview click) — see BrowserVoiceTransport.init. */
  const init = useCallback(async () => {
    await transport.init();
    setVoices(await transport.listVoices());
    setReady(true);
  }, [transport]);

  /**
   * `force` speaks even when the interviewer voice is muted. Auto-speak never
   * forces (mute must mean mute), but an explicit Replay click does — the
   * candidate asked for it in that moment, and silently ignoring a button
   * press is worse than honouring it.
   */
  const speak = useCallback(
    async (text: string, opts?: { force?: boolean }) => {
      if (!transport.capabilities.synthesis) return;
      if (!prefs.voiceEnabled && !opts?.force) return;
      setSpeaking(true);
      try {
        await transport.speak(text, { voiceURI: prefs.voiceURI ?? undefined, rate: prefs.rate });
      } catch {
        // Best-effort only — a browser blocking synthesis (autoplay policy,
        // no prior user gesture, an unsupported voice) must never surface as
        // an app error. The interviewer's message is already on screen as
        // text regardless of whether it could be spoken aloud.
      } finally {
        setSpeaking(false);
      }
    },
    [transport, prefs.voiceEnabled, prefs.voiceURI, prefs.rate],
  );

  const cancelSpeak = useCallback(() => {
    transport.cancelSpeak();
    setSpeaking(false);
  }, [transport]);

  /**
   * `onFinalChunk` is called with each newly finalized piece of the answer.
   * The caller appends it to its own committed draft while `interimText` holds
   * the words still being spoken — rendering the two as one continuous string
   * is what makes dictation read as a single flowing answer instead of a
   * sequence of committed blocks (see AnswerComposer).
   *
   * `listening` deliberately tracks the DICTATION session, not the underlying
   * recognition instance. The transport churns instances constantly (silence
   * gaps, half-duplex pauses, tab switches) and only reports onEnd when
   * dictation is genuinely over, so the indicator no longer flickers off
   * mid-answer.
   */
  const startListening = useCallback(
    (onFinalChunk: (text: string) => void) => {
      if (!transport.capabilities.recognition) return;
      setMicError(null);
      transport.startListening({
        onTranscript: ({ final, interim }) => {
          // Applied together, in this order, from a single transport event.
          // React batches both into one render, so words move from provisional
          // to committed without ever leaving the screen — they simply stop
          // changing. Setting interim unconditionally (rather than blanking it
          // whenever a final arrives) is what keeps the tail alive when the
          // engine finalizes one phrase while the next is already in flight.
          if (final) {
            setMicError(null);
            onFinalChunk(final);
          }
          setInterimText(interim);
        },
        onError: setMicError,
        onEnd: () => setListening(false),
      });
      setListening(true);
    },
    [transport],
  );

  /**
   * Drop any in-flight interim words without stopping the mic — used when the
   * candidate edits the box by hand, since at that point they have absorbed
   * the provisional text into their own draft and re-appending it would
   * duplicate it.
   *
   * Must reach the transport too, not just this state: the engine has not
   * finished with those results and will finalize them a moment later, which
   * pasted a second copy of the words the candidate had just edited around.
   */
  const clearInterim = useCallback(() => {
    transport.discardPendingInterim();
    setInterimText("");
  }, [transport]);

  /**
   * `flush` keeps the words still in flight — the candidate pressed Stop and
   * expects to see everything they just said. Callers that have already
   * captured the visible text (Send, Skip, teardown) omit it so a trailing
   * result cannot repopulate a box they just cleared.
   */
  const stopListening = useCallback(
    (opts?: { flush?: boolean }) => {
      transport.stopListening(opts);
      setListening(false);
      setInterimText("");
    },
    [transport],
  );

  return {
    capabilities: transport.capabilities,
    ready,
    speaking,
    listening,
    interimText,
    micError,
    voices,
    prefs,
    setPrefs,
    init,
    speak,
    cancelSpeak,
    startListening,
    stopListening,
    clearInterim,
  };
}
