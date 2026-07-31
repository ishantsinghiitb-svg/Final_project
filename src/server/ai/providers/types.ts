import type { z } from "zod";
import type { AIProviderId } from "@/config";

// ── Provider abstraction (Module 6A) ──
//
// Provider-agnostic contract. OpenAI is the default concrete implementation
// for the MVP; Anthropic and Gemini conform to the same interface so switching
// is configuration-only. Providers return the RAW parsed object; the AI Service
// performs final Zod validation — keeping providers thin and interchangeable.

export type AICompletionRequest = {
  system: string;
  user: string;
  model: string;
  schema: z.ZodTypeAny;
  schemaName: string;
  maxOutputTokens?: number;
  /**
   * Cancellation signal. Callers never set this by hand — the provider
   * registry wraps every provider in a deadline (see withTimeout.ts) and
   * supplies it. A provider MUST forward it to its underlying HTTP client so
   * an abort actually cancels the in-flight request rather than merely
   * abandoning the promise and leaking the connection.
   */
  signal?: AbortSignal;
};

export type AICompletionRaw = {
  raw: unknown;
  model: string;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
  };
};

export interface AIProvider {
  readonly id: AIProviderId;
  complete(req: AICompletionRequest): Promise<AICompletionRaw>;
}
