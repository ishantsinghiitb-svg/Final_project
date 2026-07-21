import type { AICapability } from "@/features/ai/constants";
import type { AIContext } from "@/features/ai/types";

export type PromptMessages = {
  /** Stable instruction block — becomes the cacheable prompt prefix. */
  system: string;
  /** Volatile, context-derived block. */
  user: string;
};

export type PromptTemplate = {
  id: string;
  capability: AICapability;
  version: string;
  build: (ctx: AIContext) => PromptMessages;
};
