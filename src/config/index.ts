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

// ── Future AI Providers ──
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

// ── Future Integrations ──
export const integrationsConfig = {
  chromeExtension: { enabled: false },
  gmail: { enabled: false },
  googleCalendar: { enabled: false },
  slack: { enabled: false },
  notion: { enabled: false },
  linkedin: { enabled: false },
} as const;
