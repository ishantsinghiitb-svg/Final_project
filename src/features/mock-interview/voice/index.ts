import { BrowserVoiceTransport } from "./BrowserVoiceTransport";
import type { InterviewVoiceTransport } from "./types";

export type {
  InterviewVoiceTransport,
  VoiceCapabilities,
  VoiceOption,
  SpeakOptions,
  ListenHandlers,
  TranscriptUpdate,
  StopListeningOptions,
} from "./types";
export type { VoicePrefs } from "./prefs";
export { loadVoicePrefs, saveVoicePrefs } from "./prefs";

// ── Transport factory (Module 7C) ──
//
// The ONE place that decides which InterviewVoiceTransport implementation
// backs the studio. Today there is only `BrowserVoiceTransport`. Adding a paid
// realtime provider later is a second branch here (e.g. selected by a feature
// flag or plan tier) — no caller of `useInterviewVoice` changes.
export function createVoiceTransport(): InterviewVoiceTransport {
  return new BrowserVoiceTransport();
}
