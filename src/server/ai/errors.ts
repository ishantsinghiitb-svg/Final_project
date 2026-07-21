import { AI_RESULT_CODES, type AIResultCode } from "@/features/ai/constants";

// ── AI error hierarchy (Module 6A) ──
// Every AI error carries a structured code so the AI Service can map it into a
// typed response envelope (never a raw throw to the client).

export class AIError extends Error {
  readonly code: AIResultCode;
  readonly retryable: boolean;

  constructor(code: AIResultCode, message: string, retryable = false) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.retryable = retryable;
  }
}

export class AIConfigError extends AIError {
  constructor(message: string) {
    super(AI_RESULT_CODES.CONFIG_ERROR, message, false);
  }
}

export class AIProviderError extends AIError {
  constructor(message: string, retryable = true) {
    super(AI_RESULT_CODES.PROVIDER_ERROR, message, retryable);
  }
}

export class AIValidationError extends AIError {
  constructor(message: string) {
    super(AI_RESULT_CODES.VALIDATION_ERROR, message, false);
  }
}

export function toResultCode(err: unknown): AIResultCode {
  if (err instanceof AIError) return err.code;
  return AI_RESULT_CODES.UNKNOWN_ERROR;
}
