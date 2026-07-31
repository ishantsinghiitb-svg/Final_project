import { describe, expect, it } from "vitest";
import {
  MAX_FOLLOW_UPS_PER_QUESTION,
  countConsecutiveFollowUps,
  isFollowUpAction,
  remainingFollowUpBudget,
} from "./followUps";

const t = (action: string | null) => ({ action });

describe("isFollowUpAction", () => {
  it("treats digging actions as follow-ups", () => {
    for (const a of [
      "probe",
      "challenge",
      "clarify",
      "example",
      "cross_reference",
      "follow_up",
    ] as const) {
      expect(isFollowUpAction(a)).toBe(true);
    }
  });

  it("treats thread-starting and terminal actions as not follow-ups", () => {
    for (const a of ["open", "new_competency", "answer_candidate_question", "close"] as const) {
      expect(isFollowUpAction(a)).toBe(false);
    }
  });
});

describe("countConsecutiveFollowUps", () => {
  it("is zero for an empty transcript", () => {
    expect(countConsecutiveFollowUps([])).toBe(0);
  });

  it("is zero right after the opening question", () => {
    expect(countConsecutiveFollowUps([t("open")])).toBe(0);
  });

  it("is zero right after moving to a new competency", () => {
    expect(countConsecutiveFollowUps([t("open"), t("probe"), t("new_competency")])).toBe(0);
  });

  it("counts a single follow-up on the current thread", () => {
    expect(countConsecutiveFollowUps([t("open"), t("probe")])).toBe(1);
  });

  it("counts consecutive follow-ups of mixed kinds", () => {
    expect(countConsecutiveFollowUps([t("open"), t("probe"), t("challenge")])).toBe(2);
  });

  it("stops counting at the thread boundary, ignoring older follow-ups", () => {
    const turns = [
      t("open"),
      t("probe"),
      t("challenge"),
      t("new_competency"), // boundary — everything before is a different thread
      t("clarify"),
    ];
    expect(countConsecutiveFollowUps(turns)).toBe(1);
  });

  it("treats answering the candidate's own question as a boundary, not a follow-up", () => {
    const turns = [t("open"), t("probe"), t("answer_candidate_question")];
    expect(countConsecutiveFollowUps(turns)).toBe(0);
  });

  it("treats a missing action as a boundary rather than guessing follow-up", () => {
    // Conservative direction on purpose: guessing "follow-up" would shrink the
    // budget and cut a legitimate probe short.
    expect(countConsecutiveFollowUps([t("open"), t("probe"), t(null)])).toBe(0);
  });
});

describe("remainingFollowUpBudget", () => {
  it("is the full budget on a fresh thread", () => {
    expect(remainingFollowUpBudget([t("open")])).toBe(MAX_FOLLOW_UPS_PER_QUESTION);
  });

  it("decrements as follow-ups are spent", () => {
    expect(remainingFollowUpBudget([t("open"), t("probe")])).toBe(MAX_FOLLOW_UPS_PER_QUESTION - 1);
  });

  it("hits zero once the cap is reached", () => {
    expect(remainingFollowUpBudget([t("open"), t("probe"), t("challenge")])).toBe(0);
  });

  it("never goes negative if the cap was somehow exceeded", () => {
    const turns = [t("open"), t("probe"), t("challenge"), t("clarify"), t("example")];
    expect(remainingFollowUpBudget(turns)).toBe(0);
  });
});
