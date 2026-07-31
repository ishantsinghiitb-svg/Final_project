// ── Voice transport abstraction (Module 7C) ──
//
// The studio talks ONLY to this interface via useInterviewVoice, never to
// SpeechSynthesis/SpeechRecognition directly. `BrowserVoiceTransport` (free,
// no keys, ships now) is the only implementation today, but a future paid
// realtime provider (OpenAI Realtime, ElevenLabs, Deepgram — explicitly out of
// scope for this module) plugs in as a second implementation of this same
// interface, selected by a factory — no component, hook, service or DB change
// needed. `fullDuplex` being a DECLARED capability rather than an assumption
// is what lets barge-in / interruption appear later without rewriting the
// turn-taking logic in useMockInterviewStudio.

export type VoiceCapabilities = {
  /** Can speak the interviewer's messages aloud. */
  synthesis: boolean;
  /** Can transcribe the candidate's speech. */
  recognition: boolean;
  /** Can listen WHILE speaking. False for the browser transport — see BrowserVoiceTransport. */
  fullDuplex: boolean;
  /** Emits interim (not-yet-final) transcription results as the candidate speaks. */
  streamingAsr: boolean;
  /** Audio leaves the device to a remote service. False for the browser transport. */
  serverSide: boolean;
};

export type VoiceOption = {
  voiceURI: string;
  name: string;
  lang: string;
};

export type SpeakOptions = {
  voiceURI?: string;
  rate?: number;
  pitch?: number;
};

/**
 * One atomic view of the dictation stream, emitted together so a consumer can
 * never observe a half-applied update.
 *
 * Splitting these into separate `onInterim` / `onFinal` callbacks was a real
 * bug: a single recognition event routinely finalizes one segment WHILE the
 * next is already provisional, and whichever callback ran second decided
 * whether those provisional words survived. Delivering both halves in one call
 * makes "commit these words and the tail now reads like this" a single
 * indivisible fact.
 */
export type TranscriptUpdate = {
  /**
   * Text finalized by this update and never emitted before. Empty when the
   * update only revised the provisional tail. Append it to the answer.
   */
  final: string;
  /**
   * The complete in-progress tail as of this update. REPLACES the previous
   * interim rather than appending to it.
   */
  interim: string;
};

export type ListenHandlers = {
  onTranscript: (update: TranscriptUpdate) => void;
  onError: (error: string) => void;
  onEnd: () => void;
};

export type StopListeningOptions = {
  /**
   * True when the candidate deliberately stopped the mic. Provisional words
   * are committed and the engine is allowed to drain the audio it has already
   * captured, so the last phrase spoken before the click is kept.
   *
   * False/omitted means the surrounding text has already been captured (Send,
   * Skip, teardown) and anything still in flight must be DISCARDED, or a late
   * result would repopulate a box the candidate has already emptied.
   */
  flush?: boolean;
};

export interface InterviewVoiceTransport {
  readonly id: string;
  readonly capabilities: VoiceCapabilities;
  /** Must be called from within a user-gesture handler (browser audio-unlock requirement — see BrowserVoiceTransport). */
  init(): Promise<void>;
  speak(text: string, opts?: SpeakOptions): Promise<void>;
  cancelSpeak(): void;
  startListening(handlers: ListenHandlers): void;
  stopListening(opts?: StopListeningOptions): void;
  /**
   * Marks the words currently in flight as already accounted for by the
   * caller, so the engine's later finalization of them is dropped instead of
   * appended a second time. Called when the candidate edits the box by hand
   * mid-dictation — at that point the provisional words are part of their own
   * text and re-appending them would duplicate them.
   */
  discardPendingInterim(): void;
  listVoices(): Promise<VoiceOption[]>;
  dispose(): void;
}
