import { describe, expect, it } from "vitest";
import { CAPABILITY_REGISTRY, getCapability } from "./capabilities";
import {
  EXPERIMENTAL_AI_CAPABILITIES,
  SHIPPED_AI_CAPABILITIES,
  isShippedCapability,
  type AICapability,
} from "./constants";

// ── Capability registry invariants (Module 6 freeze) ──
//
// Two facts about the registry are load-bearing but invisible at the call
// site, so they are pinned here rather than left to a code reviewer noticing.

const ALL_CAPABILITIES = Object.keys(CAPABILITY_REGISTRY) as AICapability[];

describe("cache policy", () => {
  it("leaves ttlSeconds null for every capability", () => {
    // ttlSeconds is documented as intentionally unused: AIService.writeCache
    // reads it, but the Cover Letter and Resume Optimizer orchestrations
    // hardcode `expires_at: null`. Setting a TTL would therefore apply to
    // Resume Match and ATS only — a policy silently half-applied across the
    // platform. This test is the tripwire on that: if it fails, implement the
    // TTL in all three writers before changing the registry.
    for (const id of ALL_CAPABILITIES) {
      expect(
        getCapability(id).cachePolicy.ttlSeconds,
        `${id} sets a cache TTL, but two of the three cache writers ignore it — see CachePolicy.ttlSeconds`,
      ).toBeNull();
    }
  });

  it("keeps caching enabled for every capability except mock_interview, recommendations, and gmail_classifier", () => {
    // mock_interview (Module 7C) is one deliberate exception: caching a
    // conversational turn would replay an identical question back to the
    // candidate, and a hash over an ever-growing transcript would essentially
    // never hit anyway. recommendations (Module 8B) is another: per its
    // explicit "always reflect current data" requirement, a cached AI
    // response could describe data that has since changed — see the
    // RecommendationsService.ts header comment. gmail_classifier (Module 9A)
    // is the third: gmail_messages' UNIQUE(user_id, gmail_message_id) means a
    // given email is only ever classified once, ever, so a cache would never
    // hit anyway. See the NO_CACHE comment in capabilities.ts.
    const NO_CACHE_CAPABILITIES = new Set([
      "mock_interview",
      "recommendations",
      "gmail_classifier",
    ]);
    for (const id of ALL_CAPABILITIES) {
      const expected = !NO_CACHE_CAPABILITIES.has(id);
      expect(getCapability(id).cachePolicy.enabled).toBe(expected);
    }
  });
});

describe("shipped vs experimental capabilities", () => {
  it("marks exactly the non-shipped capabilities as experimental", () => {
    for (const id of ALL_CAPABILITIES) {
      expect(getCapability(id).experimental).toBe(!isShippedCapability(id));
    }
  });

  it("covers every registered capability as either shipped or experimental", () => {
    const accounted = [...SHIPPED_AI_CAPABILITIES, ...EXPERIMENTAL_AI_CAPABILITIES];
    expect([...accounted].sort()).toEqual([...ALL_CAPABILITIES].sort());
  });
});
