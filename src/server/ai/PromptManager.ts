import { getPrompt } from "@/features/ai/prompts";
import type { AICapability } from "@/features/ai/constants";
import type { AIContext } from "@/features/ai/types";

// ── PromptManager (Module 6A) ──
// Resolves the versioned prompt template for a capability and renders it
// against a built AIContext.

export function buildPrompt(capability: AICapability, ctx: AIContext) {
  const template = getPrompt(capability);
  const messages = template.build(ctx);
  return {
    promptId: template.id,
    promptVersion: template.version,
    system: messages.system,
    user: messages.user,
  };
}
