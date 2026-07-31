import { describe, expect, it } from "vitest";
import { splitTranscriptForPrompt, truncateAnswerForPrompt } from "./transcript";

function turn(index: number) {
  return { turn_index: index, interviewer_message: `Q${index}`, candidate_answer: `A${index}` };
}

describe("splitTranscriptForPrompt", () => {
  it("keeps everything verbatim when under the tail size", () => {
    const turns = [turn(0), turn(1), turn(2)];
    const { compressed, verbatim } = splitTranscriptForPrompt(turns, 12);
    expect(compressed).toEqual([]);
    expect(verbatim).toEqual(turns);
  });

  it("keeps exactly the tail size verbatim when equal to the total", () => {
    const turns = [turn(0), turn(1)];
    const { compressed, verbatim } = splitTranscriptForPrompt(turns, 2);
    expect(compressed).toEqual([]);
    expect(verbatim).toEqual(turns);
  });

  it("compresses everything before the most recent N turns", () => {
    const turns = Array.from({ length: 20 }, (_, i) => turn(i));
    const { compressed, verbatim } = splitTranscriptForPrompt(turns, 12);
    expect(compressed).toHaveLength(8);
    expect(verbatim).toHaveLength(12);
    expect(compressed[0].turn_index).toBe(0);
    expect(compressed[compressed.length - 1].turn_index).toBe(7);
    expect(verbatim[0].turn_index).toBe(8);
    expect(verbatim[verbatim.length - 1].turn_index).toBe(19);
  });

  it("uses the default tail size when none is given", () => {
    const turns = Array.from({ length: 15 }, (_, i) => turn(i));
    const { verbatim } = splitTranscriptForPrompt(turns);
    expect(verbatim).toHaveLength(12);
  });
});

describe("truncateAnswerForPrompt", () => {
  it("returns short answers unchanged", () => {
    expect(truncateAnswerForPrompt("a short answer", 2000)).toBe("a short answer");
  });

  it("truncates and marks long answers", () => {
    const long = "x".repeat(3000);
    const result = truncateAnswerForPrompt(long, 2000);
    expect(result.startsWith("x".repeat(2000))).toBe(true);
    expect(result.endsWith("(truncated)")).toBe(true);
    expect(result.length).toBeLessThan(long.length);
  });

  it("treats an answer exactly at the limit as not needing truncation", () => {
    const exact = "y".repeat(2000);
    expect(truncateAnswerForPrompt(exact, 2000)).toBe(exact);
  });
});
