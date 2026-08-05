import type { z } from "zod";
import { aiConfig, resolveModel, type AIModelTier, type AIProviderId } from "@/config";
import {
  AI_CAPABILITIES,
  AI_CAPABILITY_LABELS,
  AI_CREDIT_COSTS,
  AI_ANALYSIS_VERSIONS,
  AI_PROMPT_VERSIONS,
  isShippedCapability,
  type AICapability,
} from "@/features/ai/constants";
import {
  ResumeMatchResultSchema,
  AtsScoreResultSchema,
  ResumeOptimizerResultSchema,
  CoverLetterResultSchema,
  InterviewPrepResultSchema,
  MockInterviewResultSchema,
} from "@/features/ai/schemas";
import { RecommendationsDraftSchema } from "@/features/recommendations/schema";
import { GmailClassificationSchema } from "@/features/gmail/schema";

// ── Capability Registry ──
//
// The single source of truth for every AI capability. Each entry declares:
//   provider · model · prompt · schema · cache policy · analysis version · cost
//
// Provider + model are resolved from config (aiConfig), so switching provider
// (OpenAI → Anthropic → Gemini) or model is a CONFIG change only — no capability
// code changes. Adding a new capability = add an id (constants), a prompt
// (prompts), a schema (schemas), and one entry here.

export type CachePolicy = {
  /** Honoured by all three orchestrations. Turning this off skips read + write. */
  enabled: boolean;
  /**
   * ⚠ INTENTIONALLY UNUSED — do not set this without reading all of the below
   * (documented at the Module 6 freeze).
   *
   * Every capability uses `null` (no expiry), and the three AI orchestrations
   * agree on that value only by coincidence, not by construction:
   *
   *   • `AIService.runCapability` READS this field and converts it to an
   *     `expires_at` timestamp.
   *   • `CoverLetterAIService` and `ResumeOptimizerService` are separate
   *     orchestrations (see the note at the top of each) and hardcode
   *     `expires_at: null` on their cache writes. They never read this field.
   *
   * So setting a non-null TTL today would take effect for Resume Match and ATS
   * only, and be silently ignored for Cover Letter and Resume Optimizer — the
   * registry would advertise an expiry policy that two of the four shipped
   * capabilities do not implement.
   *
   * It is left in place rather than deleted because the read side (the
   * `expires_at` check in all three `lookupCache` functions) is real and would
   * correctly honour an expiry on any row that has one.
   *
   * BEFORE RELYING ON IT: implement it in all three writers, then delete this
   * warning. `AIService.test.ts` guards the current state — it asserts every
   * registered capability leaves this `null`, so a change here fails loudly
   * instead of shipping a half-applied policy.
   */
  ttlSeconds: number | null;
};

export type CapabilityDefinition = {
  id: AICapability;
  label: string;
  provider: AIProviderId;
  model: string;
  tier: AIModelTier;
  promptId: string;
  promptVersion: string;
  analysisVersion: string;
  creditCost: number;
  outputSchema: z.ZodTypeAny;
  cachePolicy: CachePolicy;
  /**
   * True for a capability that is registered but NOT shipped — no server
   * function, no client method, no UI (Module 6 freeze). It exists so the
   * scaffolding stays warm, and must never be presented to a user. The
   * enforcement is in the types: user-facing code is written against
   * `ShippedAICapability`, so an experimental id cannot be passed to it.
   */
  experimental: boolean;
};

// Every capability uses this default — no entry overrides it. `ttlSeconds` is
// null on purpose; see the warning on CachePolicy before changing it.
const DEFAULT_CACHE: CachePolicy = { enabled: true, ttlSeconds: null };

// Module 7C is the first (and so far only) capability to turn caching off.
// A cached conversational turn would replay an identical question and break
// the "the interviewer remembers everything" premise, and a hash over an
// ever-growing transcript would essentially never hit anyway. Also keeps
// mock_interview entirely clear of the ttlSeconds trap documented above.
const NO_CACHE: CachePolicy = { enabled: false, ttlSeconds: null };

function define(
  id: AICapability,
  tier: AIModelTier,
  outputSchema: z.ZodTypeAny,
  cachePolicy: CachePolicy = DEFAULT_CACHE,
): CapabilityDefinition {
  const provider = aiConfig.defaultProvider;
  return {
    id,
    label: AI_CAPABILITY_LABELS[id],
    provider,
    model: resolveModel(provider, tier),
    tier,
    promptId: id,
    promptVersion: AI_PROMPT_VERSIONS[id],
    analysisVersion: AI_ANALYSIS_VERSIONS[id],
    creditCost: AI_CREDIT_COSTS[id],
    outputSchema,
    cachePolicy,
    // Derived from the one list in constants rather than passed per entry, so
    // promoting a capability is a single edit and the two can never disagree.
    experimental: !isShippedCapability(id),
  };
}

export const CAPABILITY_REGISTRY: Record<AICapability, CapabilityDefinition> = {
  [AI_CAPABILITIES.RESUME_MATCH]: define(
    AI_CAPABILITIES.RESUME_MATCH,
    "reasoning",
    ResumeMatchResultSchema,
  ),
  [AI_CAPABILITIES.ATS_SCORE]: define(AI_CAPABILITIES.ATS_SCORE, "fast", AtsScoreResultSchema),
  [AI_CAPABILITIES.RESUME_OPTIMIZER]: define(
    AI_CAPABILITIES.RESUME_OPTIMIZER,
    "reasoning",
    ResumeOptimizerResultSchema,
  ),
  [AI_CAPABILITIES.COVER_LETTER]: define(
    AI_CAPABILITIES.COVER_LETTER,
    "reasoning",
    CoverLetterResultSchema,
  ),
  [AI_CAPABILITIES.INTERVIEW_PREP]: define(
    AI_CAPABILITIES.INTERVIEW_PREP,
    "reasoning",
    InterviewPrepResultSchema,
  ),
  // "reasoning" tier for all three phases (planning, live turns, report) —
  // a "fast" model noticeably degrades probing/cross-referencing depth,
  // which is this module's entire product. See MockInterviewAIService.ts.
  [AI_CAPABILITIES.MOCK_INTERVIEW]: define(
    AI_CAPABILITIES.MOCK_INTERVIEW,
    "reasoning",
    MockInterviewResultSchema,
    NO_CACHE,
  ),
  // "fast" tier — this capability only phrases pre-decided facts, not deep
  // reasoning (matches ATS Score's tier choice for a similarly bounded
  // task). NO_CACHE: per Module 8B's explicit "always fresh" requirement,
  // RecommendationsService never reads or writes ai_cache at all — this
  // cachePolicy value is present only for CapabilityDefinition shape
  // consistency and is not consulted by the recommendations orchestration.
  [AI_CAPABILITIES.RECOMMENDATIONS]: define(
    AI_CAPABILITIES.RECOMMENDATIONS,
    "fast",
    RecommendationsDraftSchema,
    NO_CACHE,
  ),
  // "fast" tier — a single-field classification of a short facts block, not
  // deep reasoning (same tier choice as ATS Score/Recommendations for a
  // similarly bounded task). NO_CACHE: gmail_messages' UNIQUE(user_id,
  // gmail_message_id) means a given email is only ever classified once,
  // ever — GmailSyncService's dedup precheck skips it entirely on any later
  // sync, so a cache would never hit anyway (see the Module 9A plan's Email
  // Classification Pipeline section).
  [AI_CAPABILITIES.GMAIL_CLASSIFIER]: define(
    AI_CAPABILITIES.GMAIL_CLASSIFIER,
    "fast",
    GmailClassificationSchema,
    NO_CACHE,
  ),
};

export function getCapability(id: AICapability): CapabilityDefinition {
  return CAPABILITY_REGISTRY[id];
}
