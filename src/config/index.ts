// ── Supabase ──
export const supabaseConfig = {
  url: import.meta.env.VITE_SUPABASE_URL,
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
} as const;

// ── Storage ──
export const storageConfig = {
  buckets: {
    avatars: "avatars",
    resumes: "resumes",
    documents: "documents",
  },
  avatarPath: (userId: string) => `${userId}/avatar`,
  resumePath: (userId: string, resumeId: string) => `${userId}/${resumeId}`,
  documentPath: (userId: string, docId: string) => `${userId}/${docId}`,
} as const;

// ── Routes ──
export const routeConfig = {
  oauthRedirectTo: "/dashboard",
  passwordResetRedirectTo: "/login",
  protectedPrefix: "/dashboard",
} as const;

// ── Feature Flags ──
export const featureFlags = {
  jobs: false,
  applications: false,
  resumes: false,
  interviews: false,
  notifications: false,
  analytics: false,
  community: false,
  extension: false,
  gmail: false,
  ai: false,
} as const;

// ── Future AI Providers (legacy scaffold — kept for backwards-compat; use aiConfig) ──
export const aiProviderConfig = {
  openai: {
    model: "gpt-4o",
    enabled: false,
  },
  anthropic: {
    model: "claude-3-5-sonnet",
    enabled: false,
  },
} as const;

// ── AI Providers (Module 6A) ──
// OpenAI is the default provider for the MVP. The AIProvider abstraction stays
// provider-agnostic — switching providers (Anthropic, Gemini, …) is a config
// change only, never a code change. Provider API *keys* are read exclusively
// from server-only env (see src/server/env.ts); nothing here is a secret.
export const AI_PROVIDERS = {
  OPENAI: "openai",
  ANTHROPIC: "anthropic",
  GEMINI: "gemini",
} as const;

export type AIProviderId = (typeof AI_PROVIDERS)[keyof typeof AI_PROVIDERS];

// A named model "tier" every provider exposes, so capabilities can request a
// tier ("reasoning" / "fast") and the concrete model is resolved from config.
export type AIModelTier = "reasoning" | "fast";

export const aiConfig = {
  // Default provider. Isomorphic (safe on client) — not a secret.
  defaultProvider: ((import.meta.env.VITE_AI_DEFAULT_PROVIDER as AIProviderId | undefined) ??
    AI_PROVIDERS.OPENAI) as AIProviderId,
  providers: {
    [AI_PROVIDERS.OPENAI]: {
      enabled: true,
      defaultModel: "gpt-4o-mini",
      models: { reasoning: "gpt-4o", fast: "gpt-4o-mini" },
    },
    [AI_PROVIDERS.ANTHROPIC]: {
      enabled: false,
      defaultModel: "claude-opus-4-8",
      models: { reasoning: "claude-opus-4-8", fast: "claude-haiku-4-5" },
    },
    [AI_PROVIDERS.GEMINI]: {
      enabled: false,
      defaultModel: "gemini-2.0-flash",
      models: { reasoning: "gemini-2.0-pro", fast: "gemini-2.0-flash" },
    },
  },
} as const satisfies {
  defaultProvider: AIProviderId;
  providers: Record<
    AIProviderId,
    { enabled: boolean; defaultModel: string; models: Record<AIModelTier, string> }
  >;
};

/** Resolve the concrete model string for a provider + tier from config. */
export function resolveModel(provider: AIProviderId, tier: AIModelTier): string {
  return aiConfig.providers[provider].models[tier];
}

// ── AI Credits (Module 6A · MVP, no subscriptions/payments) ──
// Every new user gets a small, configurable free allowance. Each AI generation
// consumes credits. When exhausted, capabilities return a structured
// "ai_limit_reached" response (never throw, never generate). Designed so a
// future subscription plan simply swaps the allowance source — the consume /
// check path stays identical.
export const aiCreditsConfig = {
  freeCredits: Number(import.meta.env.VITE_AI_FREE_CREDITS ?? 5),
} as const;

// ── Future Integrations ──
export const integrationsConfig = {
  chromeExtension: { enabled: false },
  gmail: { enabled: false },
  googleCalendar: { enabled: false },
  slack: { enabled: false },
  notion: { enabled: false },
  linkedin: { enabled: false },
} as const;
