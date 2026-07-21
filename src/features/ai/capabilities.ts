import type { z } from "zod";
import { aiConfig, resolveModel, type AIModelTier, type AIProviderId } from "@/config";
import {
  AI_CAPABILITIES,
  AI_CAPABILITY_LABELS,
  AI_CREDIT_COSTS,
  AI_ANALYSIS_VERSIONS,
  AI_PROMPT_VERSIONS,
  type AICapability,
} from "@/features/ai/constants";
import {
  ResumeMatchResultSchema,
  AtsScoreResultSchema,
  ResumeOptimizerResultSchema,
  CoverLetterResultSchema,
  InterviewPrepResultSchema,
} from "@/features/ai/schemas";

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
  enabled: boolean;
  ttlSeconds: number | null; // null = no expiry
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
};

const DEFAULT_CACHE: CachePolicy = { enabled: true, ttlSeconds: null };

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
};

export function getCapability(id: AICapability): CapabilityDefinition {
  return CAPABILITY_REGISTRY[id];
}
