import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import type { z } from "zod";
import { AI_PROVIDERS, type AIProviderId } from "@/config";
import { AIConfigError, AIProviderError } from "../errors";
import type { AICompletionRaw, AICompletionRequest, AIProvider } from "./types";

// ── OpenAI provider (default, MVP) ──
//
// Uses Structured Outputs (json_schema response format built from the
// capability's Zod schema) so responses are schema-shaped. Returns the raw
// parsed object; the AI Service does the authoritative Zod validation.

export class OpenAIProvider implements AIProvider {
  readonly id: AIProviderId = AI_PROVIDERS.OPENAI;
  private client: OpenAI | null = null;

  constructor(private readonly apiKey: string) {}

  private getClient(): OpenAI {
    if (!this.apiKey) {
      throw new AIConfigError("OPENAI_API_KEY is not configured on the server.");
    }
    if (!this.client) {
      this.client = new OpenAI({ apiKey: this.apiKey });
    }
    return this.client;
  }

  async complete(req: AICompletionRequest): Promise<AICompletionRaw> {
    const client = this.getClient();

    let completion;
    try {
      completion = await client.chat.completions.create({
        model: req.model,
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.user },
        ],
        response_format: zodResponseFormat(req.schema as z.ZodType, req.schemaName),
        ...(req.maxOutputTokens ? { max_completion_tokens: req.maxOutputTokens } : {}),
      });
    } catch (err) {
      throw new AIProviderError(
        `OpenAI request failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const message = completion.choices[0]?.message;
    if (message?.refusal) {
      throw new AIProviderError(`OpenAI refused the request: ${message.refusal}`, false);
    }

    const content = message?.content ?? "";
    let raw: unknown;
    try {
      raw = JSON.parse(content);
    } catch {
      throw new AIProviderError("OpenAI returned non-JSON content.", false);
    }

    return {
      raw,
      model: completion.model ?? req.model,
      usage: {
        inputTokens: completion.usage?.prompt_tokens ?? null,
        outputTokens: completion.usage?.completion_tokens ?? null,
      },
    };
  }
}
