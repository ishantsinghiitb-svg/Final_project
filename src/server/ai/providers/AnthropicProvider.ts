import { AI_PROVIDERS, type AIProviderId } from "@/config";
import { AIConfigError } from "../errors";
import type { AICompletionRaw, AICompletionRequest, AIProvider } from "./types";

// ── Anthropic provider (interface-conforming stub) ──
//
// Not used in the MVP (OpenAI is the default provider). It exists so the
// architecture supports Anthropic through the SAME AIProvider interface —
// enabling it is a config change (aiConfig.defaultProvider) plus a real
// implementation here, with no capability code changes.

export class AnthropicProvider implements AIProvider {
  readonly id: AIProviderId = AI_PROVIDERS.ANTHROPIC;

  constructor(private readonly apiKey: string) {
    void this.apiKey;
  }

  async complete(_req: AICompletionRequest): Promise<AICompletionRaw> {
    throw new AIConfigError(
      "Anthropic provider is not implemented in the MVP. Set aiConfig.defaultProvider and implement AnthropicProvider to enable it.",
    );
  }
}
