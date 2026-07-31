import { joinSpoken } from "../dictation";
import type {
  InterviewVoiceTransport,
  ListenHandlers,
  SpeakOptions,
  StopListeningOptions,
  VoiceCapabilities,
  VoiceOption,
} from "./types";

// ── Browser voice transport (Module 7C) ──
//
// Free, no API keys, no network: SpeechSynthesis for the interviewer's voice,
// SpeechRecognition (Web Speech API) for the candidate's. TypeScript's bundled
// DOM lib does not declare the (non-standard, Chrome-shipped) SpeechRecognition
// constructor/event types, so the minimal shapes actually used are declared
// locally below rather than globally — this file is the only place that reads
// them.
//
// Every quirk here is a real, previously-hit browser landmine, not
// speculative hardening:
//   • Firefox has no SpeechRecognition at all — capabilities.recognition is
//     false there, so the caller never renders a mic control.
//   • getVoices() is empty synchronously on first call in Chrome; voices load
//     asynchronously and fire `voiceschanged`.
//   • Chrome silently stops a long SpeechSynthesisUtterance after ~15s unless
//     kept alive — handled by a periodic pause()/resume() tick while speaking,
//     plus splitting text into sentence-sized utterances.
//   • Recognition and synthesis are never run concurrently (fullDuplex:
//     false) — the mic would otherwise transcribe the interviewer's own voice.
//   • Chrome's recognition ends on a silence gap even with continuous:true;
//     restarted automatically, but gated by an explicit "still wants the mic"
//     flag plus a consecutive-failure circuit breaker so a permission error
//     can't cause a restart storm.
//   • iOS Safari requires an utterance to be started from within a user
//     gesture the first time — init() primes this by speaking an empty string.
//
// ── The one invariant this file exists to hold ──
//
// A dictated answer is ONE continuous transcript from the moment the candidate
// presses Voice until they explicitly Send, Skip or Stop. Silence never ends
// it. The engine ending its session never ends it. The engine's session is an
// implementation detail that churns underneath a transcript that does not.
//
// Everything below follows from that: recognition instances are replaced, but
// no instance is ever allowed to take words with it when it dies (flushInterim
// on every teardown path), and no dead instance is ever allowed to speak for
// the live one (the `this.session !== session` identity guard on every
// handler, which is what stops two instances racing after a half-duplex pause
// or a tab-visibility change).

type SpeechRecognitionResultLike = { isFinal: boolean; 0: { transcript: string } };
type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};
type SpeechRecognitionErrorEventLike = { error: string };
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

function hasSpeechSynthesis(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

const SENTENCE_SPLIT = /(?<=[.!?])\s+/;
const SYNTHESIS_KEEPALIVE_MS = 10_000;
const MAX_CONSECUTIVE_RESTART_FAILURES = 3;

/**
 * One recognition instance and the bookkeeping that belongs to it.
 *
 * Per-instance rather than per-transport on purpose: result indices are only
 * meaningful within a single SpeechRecognition session, and an error on a
 * dying instance must not be attributed to its replacement. Keeping these
 * fields on the transport is what previously let two overlapping instances
 * corrupt each other's de-duplication state.
 */
type RecognitionSession = {
  recognition: SpeechRecognitionLike;
  /** The handlers this instance reports to — carried on the session so a flush never has to guess. */
  handlers: ListenHandlers;
  /**
   * Highest result index already emitted as final on THIS instance. Chrome can
   * re-deliver an already-final result in a later onresult event (and
   * `resultIndex` is not a reliable guard against it), which would append the
   * same sentence to the answer twice. Indices are stable within a session, so
   * a high-water mark is exact.
   */
  lastEmittedFinalIndex: number;
  /** results.length as of the latest event — the cutoff used to consume everything still provisional. */
  seenResultCount: number;
  /** The provisional tail as of the latest event. Committed, never dropped, when this instance ends. */
  interim: string;
  /** Set by onerror for anything that isn't a routine silence gap — gates the restart circuit breaker. */
  hardError: boolean;
};

export class BrowserVoiceTransport implements InterviewVoiceTransport {
  readonly id = "browser";
  readonly capabilities: VoiceCapabilities;

  private recognitionCtor: SpeechRecognitionConstructor | undefined;
  private session: RecognitionSession | null = null;
  private wantsListening = false;
  private consecutiveRestartFailures = 0;
  /**
   * True while a hidden tab has forced the mic down. Distinct from
   * `wantsListening` (the candidate still wants to dictate) so the restart
   * decision can refuse to spawn instances into a backgrounded tab — which the
   * browser kills immediately, producing a restart storm.
   */
  private suspended = false;
  /**
   * Incremented by every cancelSpeak() and every new speak(). The chunk loop
   * in speak() checks it between utterances so a cancellation actually stops
   * the whole message instead of just the sentence currently being spoken.
   */
  private speakGeneration = 0;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private speaking = false;
  private visibilityHandler: (() => void) | null = null;
  private cachedVoices: VoiceOption[] = [];

  constructor() {
    this.recognitionCtor = getSpeechRecognitionCtor();
    this.capabilities = {
      synthesis: hasSpeechSynthesis(),
      recognition: Boolean(this.recognitionCtor),
      fullDuplex: false,
      streamingAsr: Boolean(this.recognitionCtor),
      serverSide: false,
    };
  }

  async init(): Promise<void> {
    if (!this.capabilities.synthesis) return;
    // Primes iOS Safari's audio unlock — must run inside the same user-gesture
    // call stack as the Start Interview click. A zero-length utterance is
    // enough; nothing is actually spoken.
    const utter = new SpeechSynthesisUtterance("");
    window.speechSynthesis.speak(utter);
    await this.listVoices();
  }

  async listVoices(): Promise<VoiceOption[]> {
    if (!this.capabilities.synthesis) return [];
    const synth = window.speechSynthesis;

    const toOptions = (): VoiceOption[] =>
      synth.getVoices().map((v) => ({ voiceURI: v.voiceURI, name: v.name, lang: v.lang }));

    const existing = toOptions();
    if (existing.length > 0) {
      this.cachedVoices = existing;
      return existing;
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.cachedVoices = toOptions();
        resolve(this.cachedVoices);
      }, 1000);
      synth.onvoiceschanged = () => {
        clearTimeout(timeout);
        this.cachedVoices = toOptions();
        resolve(this.cachedVoices);
      };
    });
  }

  async speak(text: string, opts?: SpeakOptions): Promise<void> {
    if (!this.capabilities.synthesis || !text.trim()) return;
    const synth = window.speechSynthesis;

    // Half-duplex by contract: never let the mic hear the interviewer.
    //
    // `speaking` is raised BEFORE the mic is taken down, not after. The dying
    // instance's onend fires asynchronously and asks "should I restart?"; if it
    // won that race against the old ordering it would reopen the mic directly
    // into the interviewer's voice and transcribe the question into the
    // candidate's answer.
    const wasListening = this.wantsListening;
    this.speaking = true;
    if (wasListening) this.stopListening({ keepWantsListening: true, flush: true });

    const voice = opts?.voiceURI
      ? synth.getVoices().find((v) => v.voiceURI === opts.voiceURI)
      : undefined;
    const sentences = text.split(SENTENCE_SPLIT).filter((s) => s.trim().length > 0);
    const chunks = sentences.length > 0 ? sentences : [text];

    // Claim this generation. Anything that cancels (or starts a newer
    // utterance) bumps the counter, which this loop treats as a stop signal.
    const generation = ++this.speakGeneration;
    this.startKeepalive();
    try {
      for (const chunk of chunks) {
        // The load-bearing check. Long messages are split into sentences, and
        // cancel() only kills the utterance currently being spoken — without
        // this guard the loop would happily queue the NEXT sentence, so
        // ending the interview left the interviewer still talking.
        if (generation !== this.speakGeneration) return;

        await new Promise<void>((resolve, reject) => {
          const utter = new SpeechSynthesisUtterance(chunk);
          if (voice) utter.voice = voice;
          if (opts?.rate) utter.rate = opts.rate;
          if (opts?.pitch) utter.pitch = opts.pitch;
          utter.onend = () => resolve();
          utter.onerror = (e) => {
            // "interrupted"/"canceled" happen on a deliberate cancelSpeak() — not a real failure.
            if (e.error === "interrupted" || e.error === "canceled") resolve();
            else reject(new Error(`Speech synthesis failed: ${e.error}`));
          };
          synth.speak(utter);
        });
      }
    } finally {
      // Only the newest speak() owns the shared state — an older, superseded
      // call must not clear `speaking` or resume the mic out from under it.
      if (generation === this.speakGeneration) {
        this.speaking = false;
        this.stopKeepalive();
        // If the half-duplex pause left a session still draining, its own onend
        // will restart it now that `speaking` is false; startListening sees the
        // live session and no-ops rather than opening a second mic.
        if (wasListening) this.startListening(this.lastHandlers ?? undefined);
      }
    }
  }

  cancelSpeak(): void {
    if (!this.capabilities.synthesis) return;
    // Bump first: any in-flight speak() loop sees the new generation and stops
    // between sentences rather than continuing through the rest of the message.
    this.speakGeneration += 1;
    window.speechSynthesis.cancel();
    this.speaking = false;
    this.stopKeepalive();
  }

  private lastHandlers: ListenHandlers | undefined;

  startListening(handlers?: ListenHandlers): void {
    if (!this.recognitionCtor || !handlers) return;
    this.lastHandlers = handlers;
    this.wantsListening = true;
    this.consecutiveRestartFailures = 0;
    this.registerVisibilityHandler();

    // Never listen while the interviewer is speaking — see the half-duplex
    // note. speak()'s teardown resumes dictation when it finishes.
    if (this.speaking || this.suspended) return;

    // A session that is still draining (graceful stop) counts as live: its own
    // onend restarts it. Opening a second one here would run two recognizers
    // against the same mic and double every word.
    if (this.session) return;

    this.startRecognitionInstance(handlers);
  }

  /**
   * Emits everything still provisional on `session` as finalized text.
   *
   * Called on EVERY teardown path that the candidate did not initiate as a
   * discard. A recognition instance that ends takes its provisional results
   * with it — the engine never re-delivers them — so without this, every
   * silence gap, every half-duplex pause and every tab switch quietly deleted
   * the words spoken just before it. That was the single largest source of
   * "some spoken words disappear completely".
   *
   * Cannot double-emit: when the engine promotes those words to final itself
   * it does so in an onresult that moves them out of `interim`, so by the time
   * onend runs there is nothing left here to flush.
   */
  private flushInterim(session: RecognitionSession): void {
    const tail = session.interim.trim();
    session.interim = "";
    // Everything provisional is now spoken for. Advancing the high-water mark
    // past it means a late finalization of the same words is recognised as a
    // duplicate and dropped.
    session.lastEmittedFinalIndex = Math.max(
      session.lastEmittedFinalIndex,
      session.seenResultCount - 1,
    );
    if (tail) session.handlers.onTranscript({ final: tail, interim: "" });
  }

  private startRecognitionInstance(handlers: ListenHandlers, isRetry = false): void {
    if (!this.recognitionCtor) return;
    const recognition = new this.recognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = typeof navigator !== "undefined" ? navigator.language : "en-US";

    const session: RecognitionSession = {
      recognition,
      handlers,
      lastEmittedFinalIndex: -1,
      seenResultCount: 0,
      interim: "",
      hardError: false,
    };

    // Identity guard, repeated on every handler. A stopped/aborted instance
    // still fires its events, and without this a dead instance could restart
    // the mic, clobber its successor's de-duplication state, or report an
    // error that already has a replacement running.
    const isCurrent = () => this.session === session;

    recognition.onresult = (event) => {
      if (!isCurrent()) return;
      session.seenResultCount = event.results.length;

      let interim = "";
      let final = "";
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) {
          if (i > session.lastEmittedFinalIndex) {
            // joinSpoken, not `+=`: a single event can finalize two results at
            // once and Chrome does not guarantee a leading space on either, so
            // raw concatenation produced "the redesignand it grew signups".
            final = joinSpoken(final, text);
            session.lastEmittedFinalIndex = i;
          }
        } else {
          interim = joinSpoken(interim, text);
        }
      }

      session.interim = interim;
      // ONE atomic update. Emitting the newly-final words and the revised tail
      // separately meant whichever landed second decided the visible text, and
      // a final arriving while the next phrase was already provisional blanked
      // words the candidate could still see themselves saying.
      handlers.onTranscript({ final, interim });
    };

    recognition.onerror = (event) => {
      if (!isCurrent()) return;
      // "no-speech" and "aborted" are routine (a silence gap, or our own
      // stop()) — not user-facing errors, and explicitly NOT breaker-worthy:
      // a candidate thinking quietly for a few seconds is normal interview
      // behaviour, not a malfunction.
      if (event.error === "no-speech" || event.error === "aborted") return;

      handlers.onError(event.error);
      session.hardError = true;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        // Permission denied/revoked — stop trying, fall back to typing.
        this.wantsListening = false;
      }
    };

    recognition.onend = () => {
      if (!isCurrent()) return;

      // Rescue the provisional tail BEFORE anything else can decide this
      // instance is finished with.
      this.flushInterim(session);
      this.session = null;

      // onEnd means "dictation is over", not "this recognition instance is
      // over". Silence gaps, the interviewer speaking and a backgrounded tab
      // all end instances while the candidate is still mid-answer; surfacing
      // them made the UI flip out of its listening state and made dictation
      // feel like it kept cutting out.
      if (!this.wantsListening) {
        handlers.onEnd();
        return;
      }
      // Paused rather than ended — speak()'s teardown and the visibility
      // handler each own their own resume.
      if (this.speaking || this.suspended) return;

      if (session.hardError) {
        this.consecutiveRestartFailures += 1;
        if (this.consecutiveRestartFailures > MAX_CONSECUTIVE_RESTART_FAILURES) {
          this.wantsListening = false;
          handlers.onEnd();
          handlers.onError("Speech recognition keeps failing. Please type your answer instead.");
          return;
        }
      } else {
        // A clean end after a silence gap is the normal case — it proves the
        // engine is healthy, so it clears any earlier failures rather than
        // accumulating toward the breaker.
        this.consecutiveRestartFailures = 0;
      }

      // Chrome ends recognition on a silence gap even in continuous mode —
      // restart transparently, synchronously, so a pause mid-thought never
      // ends dictation and the gap in coverage is as short as the engine will
      // allow.
      this.startRecognitionInstance(handlers);
    };

    this.session = session;
    try {
      recognition.start();
    } catch {
      // Chrome throws InvalidStateError when the previous session has not
      // finished releasing the mic. This is error recovery, not pacing: yield
      // one macrotask so the engine can finish tearing down, then try exactly
      // once more before falling back to typing. Nothing is delayed in the
      // success path.
      this.session = null;
      if (isRetry) {
        this.wantsListening = false;
        handlers.onEnd();
        handlers.onError("Could not start the microphone. Please type your answer instead.");
        return;
      }
      setTimeout(() => {
        if (this.wantsListening && !this.speaking && !this.suspended && !this.session) {
          this.startRecognitionInstance(handlers, true);
        }
      }, 0);
    }
  }

  stopListening(opts?: StopListeningOptions & { keepWantsListening?: boolean }): void {
    if (!opts?.keepWantsListening) this.wantsListening = false;
    const session = this.session;
    if (!session) return;

    if (opts?.flush) {
      // The candidate stopped deliberately (or the interviewer is about to
      // speak). Commit what we have, then stop() rather than abort(): stop()
      // finishes transcribing audio already captured and delivers it, where
      // abort() throws that last phrase away. The session stays current so
      // those trailing results are still accepted.
      this.flushInterim(session);
      session.recognition.stop();
      return;
    }

    // Discard: the caller already captured the visible text (Send/Skip) or the
    // studio is tearing down. Detaching the session first makes the abort's
    // trailing events fail the identity guard, so nothing can repopulate a box
    // the candidate has just emptied.
    this.session = null;
    session.recognition.abort();
  }

  discardPendingInterim(): void {
    const session = this.session;
    if (!session) return;
    session.interim = "";
    session.lastEmittedFinalIndex = Math.max(
      session.lastEmittedFinalIndex,
      session.seenResultCount - 1,
    );
  }

  private startKeepalive(): void {
    if (!this.capabilities.synthesis) return;
    // A second speak() overlapping the first used to overwrite this handle and
    // leak the previous interval, leaving an orphaned pause()/resume() tick
    // running against the synthesizer for the rest of the session.
    this.stopKeepalive();
    this.keepaliveTimer = setInterval(() => {
      if (!this.speaking) return;
      // The documented Chrome workaround for the ~15s synthesis cutoff.
      window.speechSynthesis.pause();
      window.speechSynthesis.resume();
    }, SYNTHESIS_KEEPALIVE_MS);
  }

  private stopKeepalive(): void {
    if (this.keepaliveTimer) clearInterval(this.keepaliveTimer);
    this.keepaliveTimer = null;
  }

  private registerVisibilityHandler(): void {
    if (this.visibilityHandler || typeof document === "undefined") return;
    this.visibilityHandler = () => {
      if (document.hidden) {
        // `suspended` is a RESTART GATE ONLY. It stops us spawning a new
        // recognition instance into a hidden tab (the browser kills those
        // immediately — a restart loop that burned the failure breaker and
        // left dictation dead on return). It deliberately does NOT tear down a
        // live session.
        //
        // Tearing down here was measured causing real harm: one instrumented
        // 87-second dictation lost 6885ms and 2353ms of open microphone to two
        // hidden/visible transitions, and `document.hidden` is far broader than
        // "the user walked away" — on Windows and macOS, Chrome's native window
        // occlusion tracking reports hidden when ANY opaque window fully covers
        // the browser. A notification, a screen-recorder panel or a glance at
        // another app should not be able to delete part of an answer.
        //
        // If the browser does suspend recognition in a background tab, we lose
        // nothing by waiting to find out: it ends the session itself, onend
        // flushes the tail exactly as it does for a silence gap, and the gate
        // below holds the restart until the tab is visible again. If it does
        // not suspend, dictation simply continues uninterrupted. Strictly
        // better than pre-emptively closing the microphone in both cases.
        if (this.suspended) return;
        this.suspended = true;
        return;
      }

      if (!this.suspended) return;
      this.suspended = false;
      if (this.wantsListening && !this.speaking && !this.session && this.lastHandlers) {
        this.startRecognitionInstance(this.lastHandlers);
      }
    };
    document.addEventListener("visibilitychange", this.visibilityHandler);
  }

  dispose(): void {
    this.stopListening();
    this.cancelSpeak();
    if (this.visibilityHandler && typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.visibilityHandler);
    }
    this.visibilityHandler = null;
  }
}
