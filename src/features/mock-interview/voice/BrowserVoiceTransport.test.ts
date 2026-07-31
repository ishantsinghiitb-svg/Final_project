import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { joinSpoken } from "../dictation";
import { BrowserVoiceTransport } from "./BrowserVoiceTransport";
import type { ListenHandlers } from "./types";

// ── Dictation pipeline (Module 7C) ──
//
// The contract these tests exist to defend, in one sentence: from the moment
// the candidate presses Voice until they explicitly Send, Skip or Stop, their
// answer is ONE continuous transcript — no word dropped, no word duplicated,
// nothing finalized by silence.
//
// That contract is hard to hold because the browser's recognition session is
// nothing like continuous. Chrome ends it on every silence gap, re-delivers
// results it has already delivered, finalizes one phrase while the next is
// still provisional, and keeps firing events on instances that are already
// dead. Every case below is one of those behaviours, replayed against a fake
// SpeechRecognition, asserted through the exact assembly the UI performs.

type ResultSpec = [transcript: string, isFinal: boolean];

class FakeRecognition {
  static instances: FakeRecognition[] = [];
  /** Number of upcoming start() calls that should throw, as Chrome's InvalidStateError does. */
  static failNextStarts = 0;

  continuous = false;
  interimResults = false;
  lang = "";
  onresult: ((ev: { resultIndex: number; results: unknown }) => void) | null = null;
  onerror: ((ev: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;

  started = false;
  stopped = false;
  aborted = false;

  constructor() {
    FakeRecognition.instances.push(this);
  }

  start(): void {
    if (FakeRecognition.failNextStarts > 0) {
      FakeRecognition.failNextStarts -= 1;
      throw new Error("InvalidStateError");
    }
    this.started = true;
  }
  stop(): void {
    this.stopped = true;
  }
  abort(): void {
    this.aborted = true;
  }

  /** Chrome delivers the WHOLE cumulative result list on every event, not just the new tail. */
  emit(results: ResultSpec[]): void {
    this.onresult?.({
      resultIndex: 0,
      results: results.map(([transcript, isFinal]) => ({ isFinal, 0: { transcript } })),
    });
  }
  fail(error: string): void {
    this.onerror?.({ error });
  }
  end(): void {
    this.onend?.();
  }
}

/**
 * Reassembles the transcript exactly as useInterviewVoice + AnswerComposer do:
 * finals fold into a committed draft, interim replaces wholesale, and what the
 * candidate SEES is the two rendered as one string. Asserting on `visible()`
 * rather than on callback counts is the point — a bug that loses a word only
 * matters because the word leaves the screen.
 */
function makeConsumer() {
  const state = { committed: "", interim: "", errors: [] as string[], ends: 0 };
  const handlers: ListenHandlers = {
    onTranscript: ({ final, interim }) => {
      if (final) state.committed = joinSpoken(state.committed, final);
      state.interim = interim;
    },
    onError: (error) => state.errors.push(error),
    onEnd: () => {
      state.ends += 1;
    },
  };
  const visible = () =>
    state.interim ? joinSpoken(state.committed, state.interim) : state.committed;
  return { state, handlers, visible };
}

let transport: BrowserVoiceTransport;
let documentHidden = false;
let visibilityListeners: Array<() => void> = [];

/** Drives the same `visibilitychange` the browser fires — including on window occlusion. */
function setTabHidden(hidden: boolean): void {
  documentHidden = hidden;
  for (const listener of [...visibilityListeners]) listener();
}

beforeEach(() => {
  FakeRecognition.instances = [];
  FakeRecognition.failNextStarts = 0;
  documentHidden = false;
  visibilityListeners = [];
  (globalThis as unknown as { window: unknown }).window = { SpeechRecognition: FakeRecognition };
  (globalThis as unknown as { document: unknown }).document = {
    get hidden() {
      return documentHidden;
    },
    addEventListener: (type: string, fn: () => void) => {
      if (type === "visibilitychange") visibilityListeners.push(fn);
    },
    removeEventListener: () => {},
  };
  transport = new BrowserVoiceTransport();
});

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
  delete (globalThis as unknown as { document?: unknown }).document;
});

const live = () => FakeRecognition.instances[FakeRecognition.instances.length - 1];

describe("BrowserVoiceTransport recognition", () => {
  it("configures continuous, interim-capable recognition", () => {
    const { handlers } = makeConsumer();
    transport.startListening(handlers);

    expect(transport.capabilities.recognition).toBe(true);
    expect(live().continuous).toBe(true);
    expect(live().interimResults).toBe(true);
    expect(live().started).toBe(true);
  });

  it("keeps the provisional tail alive when an earlier phrase finalizes in the same event", () => {
    // The single most common shape of a fast-speech event: Chrome commits the
    // phrase behind while the phrase in front is still being revised. Clearing
    // interim on every final made those in-front words blink out.
    const { state, handlers, visible } = makeConsumer();
    transport.startListening(handlers);

    live().emit([
      ["I led the referral redesign", true],
      ["and it grew signups", false],
    ]);

    expect(state.committed).toBe("I led the referral redesign");
    expect(state.interim).toBe("and it grew signups");
    expect(visible()).toBe("I led the referral redesign and it grew signups");
  });

  it("never appends a re-delivered final twice", () => {
    const { state, handlers } = makeConsumer();
    transport.startListening(handlers);

    live().emit([["I led the referral redesign", true]]);
    live().emit([["I led the referral redesign", true]]);
    live().emit([
      ["I led the referral redesign", true],
      ["and it grew signups", true],
    ]);

    expect(state.committed).toBe("I led the referral redesign and it grew signups");
  });

  it("spaces two results that finalize in the same event", () => {
    // Raw concatenation produced "redesignand" — Chrome does not guarantee a
    // leading space on a result's transcript.
    const { state, handlers } = makeConsumer();
    transport.startListening(handlers);

    live().emit([
      ["I led the referral redesign", true],
      ["and it grew signups", true],
    ]);

    expect(state.committed).toBe("I led the referral redesign and it grew signups");
  });

  it("carries provisional words across a silence gap instead of dropping them", () => {
    // The engine ends the session on silence and takes its provisional results
    // with it — it never re-delivers them. Anything still in flight has to be
    // committed on the way out or the candidate simply loses those words.
    const { state, handlers, visible } = makeConsumer();
    transport.startListening(handlers);

    live().emit([
      ["I led the referral redesign", true],
      ["and it grew signups", false],
    ]);
    live().end();

    expect(state.committed).toBe("I led the referral redesign and it grew signups");
    expect(state.interim).toBe("");
    expect(FakeRecognition.instances).toHaveLength(2);
    expect(live().started).toBe(true);
    // Silence is not the end of the answer.
    expect(state.ends).toBe(0);

    live().emit([["then I moved to platform", true]]);
    expect(visible()).toBe(
      "I led the referral redesign and it grew signups then I moved to platform",
    );
  });

  it("survives many silence gaps as one transcript", () => {
    const { state, handlers } = makeConsumer();
    transport.startListening(handlers);

    for (const phrase of ["First", "Second", "Third", "Fourth"]) {
      live().emit([[phrase, false]]);
      live().end();
    }

    expect(state.committed).toBe("First Second Third Fourth");
    expect(state.ends).toBe(0);
  });

  it("keeps the in-flight phrase when the candidate stops the mic", () => {
    // Pressing Stop used to delete the last thing said: abort() discards the
    // engine's pending results and the provisional tail went with them.
    const { state, handlers } = makeConsumer();
    transport.startListening(handlers);
    const instance = live();

    instance.emit([
      ["I led the referral redesign", true],
      ["and it grew signups", false],
    ]);
    transport.stopListening({ flush: true });

    expect(state.committed).toBe("I led the referral redesign and it grew signups");
    // stop(), not abort(): the engine still owes us audio it has already captured.
    expect(instance.stopped).toBe(true);
    expect(instance.aborted).toBe(false);

    // Trailing results from the drain are still accepted.
    instance.emit([
      ["I led the referral redesign", true],
      ["and it grew signups", true],
      ["by twenty two percent", true],
    ]);
    expect(state.committed).toBe(
      "I led the referral redesign and it grew signups by twenty two percent",
    );

    instance.end();
    expect(state.ends).toBe(1);
    expect(FakeRecognition.instances).toHaveLength(1);
  });

  it("discards in-flight words on a non-flush stop and ignores the dead instance", () => {
    // Send/Skip have already captured the visible text. A trailing result must
    // not repopulate a box the candidate just emptied.
    const { state, handlers } = makeConsumer();
    transport.startListening(handlers);
    const instance = live();

    instance.emit([["and it grew signups", false]]);
    transport.stopListening();

    expect(instance.aborted).toBe(true);
    instance.emit([["and it grew signups", true]]);
    instance.end();

    expect(state.committed).toBe("");
    expect(FakeRecognition.instances).toHaveLength(1);
  });

  it("does not let a dead instance restart the microphone", () => {
    const { handlers } = makeConsumer();
    transport.startListening(handlers);
    const first = live();

    // Simulate the half-duplex pause: the mic is taken down but the candidate
    // still wants to dictate, so `wantsListening` stays true.
    transport.stopListening({ keepWantsListening: true });
    first.end();

    expect(FakeRecognition.instances).toHaveLength(1);
  });

  it("suppresses the engine's later finalization of words the candidate has edited", () => {
    // The candidate types over the provisional text. Those exact words are
    // still queued inside the engine and would arrive again as a final,
    // pasting a second copy into the answer.
    const { state, handlers } = makeConsumer();
    transport.startListening(handlers);

    live().emit([["and it grew signups", false]]);
    transport.discardPendingInterim();
    live().emit([["and it grew signups", true]]);

    expect(state.committed).toBe("");

    live().emit([
      ["and it grew signups", true],
      ["by twenty two percent", true],
    ]);
    expect(state.committed).toBe("by twenty two percent");
  });

  it("treats no-speech as normal interview silence, not a failure", () => {
    const { state, handlers } = makeConsumer();
    transport.startListening(handlers);

    for (let i = 0; i < 10; i++) {
      live().fail("no-speech");
      live().end();
    }

    expect(state.errors).toEqual([]);
    expect(state.ends).toBe(0);
    expect(FakeRecognition.instances).toHaveLength(11);
  });

  it("stops retrying after repeated hard failures", () => {
    const { state, handlers } = makeConsumer();
    transport.startListening(handlers);

    for (let i = 0; i < 4; i++) {
      live().fail("audio-capture");
      live().end();
    }

    expect(state.ends).toBe(1);
    expect(state.errors.at(-1)).toContain("keeps failing");
    // 1 original + 3 restarts; the 4th failure trips the breaker.
    expect(FakeRecognition.instances).toHaveLength(4);
  });

  it("clears accumulated failures once recognition works again", () => {
    const { state, handlers } = makeConsumer();
    transport.startListening(handlers);

    for (let i = 0; i < 3; i++) {
      live().fail("audio-capture");
      live().end();
    }
    live().end(); // a clean end proves the engine is healthy again

    for (let i = 0; i < 3; i++) {
      live().fail("audio-capture");
      live().end();
    }

    expect(state.ends).toBe(0);
    expect(state.errors).not.toContain("keeps failing");
  });

  it("gives up the microphone when permission is refused", () => {
    const { state, handlers } = makeConsumer();
    transport.startListening(handlers);

    live().fail("not-allowed");
    live().end();

    expect(state.errors).toContain("not-allowed");
    expect(state.ends).toBe(1);
    expect(FakeRecognition.instances).toHaveLength(1);
  });

  it("keeps dictating when the tab is reported hidden", () => {
    // `document.hidden` is much broader than "the user walked away" — Chrome's
    // window occlusion tracking reports it whenever another opaque window
    // fully covers the browser. Tearing the microphone down here was measured
    // costing 6885ms and 2353ms of open mic in one instrumented session.
    const { state, handlers } = makeConsumer();
    transport.startListening(handlers);
    const instance = live();

    instance.emit([["I led the referral redesign", false]]);
    setTabHidden(true);

    expect(instance.aborted).toBe(false);
    expect(instance.stopped).toBe(false);
    expect(FakeRecognition.instances).toHaveLength(1);

    instance.emit([["I led the referral redesign and it grew signups", true]]);
    expect(state.committed).toBe("I led the referral redesign and it grew signups");
    expect(state.ends).toBe(0);
  });

  it("waits for the tab before restarting, and loses nothing if the browser ends the session", () => {
    const { state, handlers } = makeConsumer();
    transport.startListening(handlers);

    live().emit([["and it grew signups", false]]);
    setTabHidden(true);
    // If the browser does suspend a background tab's recognition, it ends the
    // session itself — the tail is flushed exactly as for a silence gap.
    live().end();

    expect(state.committed).toBe("and it grew signups");
    // No respawn into a hidden tab: that is the restart loop the gate exists for.
    expect(FakeRecognition.instances).toHaveLength(1);
    expect(state.ends).toBe(0);

    setTabHidden(false);
    expect(FakeRecognition.instances).toHaveLength(2);
    expect(live().started).toBe(true);

    live().emit([["by twenty two percent", true]]);
    expect(state.committed).toBe("and it grew signups by twenty two percent");
  });

  it("does not open a second recognizer when the tab returns with one still live", () => {
    const { handlers } = makeConsumer();
    transport.startListening(handlers);

    setTabHidden(true);
    setTabHidden(false);

    expect(FakeRecognition.instances).toHaveLength(1);
  });

  it("recovers from a start() that throws while the previous session releases the mic", async () => {
    const { state, handlers } = makeConsumer();
    FakeRecognition.failNextStarts = 1;
    transport.startListening(handlers);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(FakeRecognition.instances).toHaveLength(2);
    expect(live().started).toBe(true);
    expect(state.ends).toBe(0);

    live().emit([["I led the referral redesign", true]]);
    expect(state.committed).toBe("I led the referral redesign");
  });

  it("falls back to typing when the microphone will not start at all", async () => {
    const { state, handlers } = makeConsumer();
    FakeRecognition.failNextStarts = 2;
    transport.startListening(handlers);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(state.ends).toBe(1);
    expect(state.errors.at(-1)).toContain("Could not start the microphone");
  });
});
