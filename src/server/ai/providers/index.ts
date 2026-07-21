import { AI_PROVIDERS, type AIProviderId } from "@/config";
import { serverEnv } from "@/server/env";
import { AIConfigError } from "../errors";
import { OpenAIProvider } from "./OpenAIProvider";
import { AnthropicProvider } from "./AnthropicProvider";
import { GeminiProvider } from "./GeminiProvider";
import type { AIProvider } from "./types";

export type { AIProvider, AICompletionRequest, AICompletionRaw } from "./types";

// ── Provider registry / selection (Module 6A) ──
// Instantiates the concrete provider for a given id, injecting its server-only
// key. Instances are cached per id. Switching the active provider is done in
// config (aiConfig.defaultProvider / capability registry), not here.

const cache = new Map<AIProviderId, AIProvider>();

export function getProvider(id: AIProviderId): AIProvider {
  const existing = cache.get(id);
  if (existing) return existing;

  let provider: AIProvider;
  switch (id) {
    case AI_PROVIDERS.OPENAI:
      provider = new OpenAIProvider(serverEnv.openaiApiKey);
      break;
    case AI_PROVIDERS.ANTHROPIC:
      provider = new AnthropicProvider(serverEnv.anthropicApiKey);
      break;
    case AI_PROVIDERS.GEMINI:
      provider = new GeminiProvider(serverEnv.geminiApiKey);
      break;
    default:
      throw new AIConfigError(`Unknown AI provider: ${id}`);
  }

  cache.set(id, provider);
  return provider;
}
