import { AI_PROVIDERS, type AIProviderId } from "@/config";
import { AIConfigError } from "../errors";
import type { AICompletionRaw, AICompletionRequest, AIProvider } from "./types";

// ── Gemini provider (interface-conforming stub) ──
//
// Not used in the MVP. Exists so the architecture supports Gemini through the
// SAME AIProvider interface — enabling it is a config change plus a real
// implementation here.

export class GeminiProvider implements AIProvider {
  readonly id: AIProviderId = AI_PROVIDERS.GEMINI;

  constructor(private readonly apiKey: string) {
    void this.apiKey;
  }

  async complete(_req: AICompletionRequest): Promise<AICompletionRaw> {
    throw new AIConfigError(
      "Gemini provider is not implemented in the MVP. Set aiConfig.defaultProvider and implement GeminiProvider to enable it.",
    );
  }
}
