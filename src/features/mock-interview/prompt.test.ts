import { describe, expect, it } from "vitest";
import { openingStyleForSeed } from "./prompt";

// The opening is the most-primed part of the whole generation, so without a
// per-session directive every interview greets the candidate with the same
// sentence. These pin the two properties that make the variation real rather
// than decorative: it must be stable per session, and it must actually differ
// across sessions.

describe("openingStyleForSeed", () => {
  it("is deterministic for the same seed", () => {
    const seed = "0a2f6f10-bf27-4b3e-9af6-d28921a4213e";
    expect(openingStyleForSeed(seed)).toBe(openingStyleForSeed(seed));
  });

  it("always returns a non-empty directive", () => {
    for (let i = 0; i < 50; i++) {
      expect(openingStyleForSeed(`seed-${i}`).length).toBeGreaterThan(0);
    }
  });

  it("spreads across several distinct styles, not one dominant default", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(openingStyleForSeed(crypto.randomUUID()));
    // The catalogue is small on purpose; anything less than a few distinct
    // styles across 200 sessions would mean the hash is effectively constant.
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });

  it("does not collapse for similar-looking seeds", () => {
    // Sequential UUID-ish seeds differing in one character must not all hash
    // to the same bucket — that would silently defeat the whole mechanism.
    const styles = new Set(
      ["aaaaaaa1", "aaaaaaa2", "aaaaaaa3", "aaaaaaa4", "aaaaaaa5", "aaaaaaa6"].map(
        openingStyleForSeed,
      ),
    );
    expect(styles.size).toBeGreaterThan(1);
  });
});
