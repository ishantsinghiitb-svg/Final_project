// ── Voice preferences (Module 7C) ──
//
// Stored in localStorage, deliberately NOT in the database: SpeechSynthesis
// voices are per-device and per-browser (a `voiceURI` saved from a laptop's
// Chrome would be meaningless — or silently ignored — on the user's phone).
// Falls back to sane defaults on any read failure (private browsing, SSR).

export type VoicePrefs = {
  voiceEnabled: boolean;
  voiceURI: string | null;
  rate: number;
  /** Seconds of silence before auto-submitting a dictated answer. Null = off (default — see the studio's turn-taking policy note). */
  autoSendAfterSilenceSeconds: number | null;
};

const STORAGE_KEY = "nextoffer.mock-interview.voice-prefs";

const DEFAULT_PREFS: VoicePrefs = {
  voiceEnabled: true,
  voiceURI: null,
  rate: 1,
  autoSendAfterSilenceSeconds: null,
};

export function loadVoicePrefs(): VoicePrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<VoicePrefs>;
    return { ...DEFAULT_PREFS, ...parsed };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function saveVoicePrefs(prefs: VoicePrefs): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* best-effort — private browsing / storage full */
  }
}
