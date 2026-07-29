// ── Cover Letter Studio constants (Module 6E) ──
//
// The single source of truth for the Studio's vocabulary: generation modes
// (tone), length, AI actions, document status and version provenance. The
// server prompt builder, the UI panels and the DB `check` constraints all read
// from here, so adding a tone or an action is one entry in one file.

// ── Tone (generation mode) ────────────────────────────────────────────────
//
// The spec's eight examples split cleanly into two orthogonal settings: six of
// them describe VOICE (professional / conversational / executive / confident /
// formal / friendly) and two describe SIZE (concise / detailed). Modelling them
// separately is what makes "Change Tone" and "Change Length" work as the two
// independent AI actions the spec also asks for — a single merged list would
// make "make it shorter but keep the executive voice" impossible to express.

export const COVER_LETTER_TONES = {
  PROFESSIONAL: "professional",
  CONVERSATIONAL: "conversational",
  EXECUTIVE: "executive",
  CONFIDENT: "confident",
  FORMAL: "formal",
  FRIENDLY: "friendly",
} as const;

export type CoverLetterTone = (typeof COVER_LETTER_TONES)[keyof typeof COVER_LETTER_TONES];

export type ToneOption = {
  id: CoverLetterTone;
  label: string;
  hint: string;
};

export const TONE_OPTIONS: readonly ToneOption[] = [
  {
    id: COVER_LETTER_TONES.PROFESSIONAL,
    label: "Professional",
    hint: "Polished and neutral. Works for most companies.",
  },
  {
    id: COVER_LETTER_TONES.CONVERSATIONAL,
    label: "Startup / Conversational",
    hint: "Direct and human. Good for startups and small teams.",
  },
  {
    id: COVER_LETTER_TONES.EXECUTIVE,
    label: "Executive",
    hint: "Senior, outcome-led, strategic framing.",
  },
  {
    id: COVER_LETTER_TONES.CONFIDENT,
    label: "Confident",
    hint: "Assertive about impact, without overclaiming.",
  },
  {
    id: COVER_LETTER_TONES.FORMAL,
    label: "Formal",
    hint: "Traditional structure. Banking, law, government, academia.",
  },
  {
    id: COVER_LETTER_TONES.FRIENDLY,
    label: "Friendly",
    hint: "Warm and approachable, still professional.",
  },
] as const;

export const DEFAULT_TONE: CoverLetterTone = COVER_LETTER_TONES.PROFESSIONAL;

export const TONE_LABELS: Record<CoverLetterTone, string> = TONE_OPTIONS.reduce(
  (acc, t) => ({ ...acc, [t.id]: t.label }),
  {} as Record<CoverLetterTone, string>,
);

// ── Length ────────────────────────────────────────────────────────────────

export const COVER_LETTER_LENGTHS = {
  CONCISE: "concise",
  STANDARD: "standard",
  DETAILED: "detailed",
} as const;

export type CoverLetterLength = (typeof COVER_LETTER_LENGTHS)[keyof typeof COVER_LETTER_LENGTHS];

export type LengthOption = {
  id: CoverLetterLength;
  label: string;
  hint: string;
  /** Target word band handed to the prompt builder. */
  words: { min: number; max: number };
};

export const LENGTH_OPTIONS: readonly LengthOption[] = [
  {
    id: COVER_LETTER_LENGTHS.CONCISE,
    label: "Concise",
    hint: "Around 200 words. Three short paragraphs.",
    words: { min: 160, max: 240 },
  },
  {
    id: COVER_LETTER_LENGTHS.STANDARD,
    label: "Standard",
    hint: "Around 300 words. The recruiter default.",
    words: { min: 260, max: 350 },
  },
  {
    id: COVER_LETTER_LENGTHS.DETAILED,
    label: "Detailed",
    hint: "Around 420 words. More evidence per claim.",
    words: { min: 360, max: 480 },
  },
] as const;

export const DEFAULT_LENGTH: CoverLetterLength = COVER_LETTER_LENGTHS.STANDARD;

export const LENGTH_LABELS: Record<CoverLetterLength, string> = LENGTH_OPTIONS.reduce(
  (acc, l) => ({ ...acc, [l.id]: l.label }),
  {} as Record<CoverLetterLength, string>,
);

export function lengthWordBand(length: CoverLetterLength): { min: number; max: number } {
  return (
    LENGTH_OPTIONS.find((l) => l.id === length)?.words ??
    LENGTH_OPTIONS.find((l) => l.id === DEFAULT_LENGTH)!.words
  );
}

// ── AI actions ────────────────────────────────────────────────────────────
//
// Every action is independent: it takes the CURRENT letter text (whatever the
// user has edited it into) plus the job/resume context, and returns a new full
// letter. Section actions rewrite only their section and keep the rest verbatim
// — the splice happens server-side so the client always receives whole text.

export const COVER_LETTER_AI_ACTIONS = {
  REGENERATE_ALL: "regenerate_all",
  REGENERATE_INTRO: "regenerate_intro",
  REGENERATE_BODY: "regenerate_body",
  REGENERATE_CLOSING: "regenerate_closing",
  CHANGE_TONE: "change_tone",
  CHANGE_LENGTH: "change_length",
  IMPROVE_GRAMMAR: "improve_grammar",
  MORE_PERSUASIVE: "more_persuasive",
  SIMPLIFY: "simplify",
  HIGHLIGHT_ACHIEVEMENTS: "highlight_achievements",
} as const;

export type CoverLetterAIAction =
  (typeof COVER_LETTER_AI_ACTIONS)[keyof typeof COVER_LETTER_AI_ACTIONS];

export type AIActionOption = {
  id: CoverLetterAIAction;
  label: string;
  hint: string;
  group: "regenerate" | "adjust" | "refine";
  /** Actions that need an extra argument before they can run. */
  needs?: "tone" | "length";
  /**
   * Whether this action starts a fresh editing session and charges a credit.
   * Every other action reuses the current session's already-paid-for credit —
   * see the "editing session" model in CoverLetterAIService. Only Regenerate
   * Entire Letter is a genuinely new generation; everything else is a
   * refinement of the letter that credit already paid for.
   */
  chargesCredit?: boolean;
};

export const AI_ACTION_OPTIONS: readonly AIActionOption[] = [
  {
    id: COVER_LETTER_AI_ACTIONS.REGENERATE_ALL,
    label: "Regenerate entire letter",
    hint: "A completely fresh letter. Starts a new editing session — uses 1 AI credit.",
    group: "regenerate",
    chargesCredit: true,
  },
  {
    id: COVER_LETTER_AI_ACTIONS.REGENERATE_INTRO,
    label: "Regenerate introduction",
    hint: "New opening. Body and closing stay exactly as they are.",
    group: "regenerate",
  },
  {
    id: COVER_LETTER_AI_ACTIONS.REGENERATE_BODY,
    label: "Regenerate body",
    hint: "New middle paragraphs. Opening and closing untouched.",
    group: "regenerate",
  },
  {
    id: COVER_LETTER_AI_ACTIONS.REGENERATE_CLOSING,
    label: "Regenerate closing",
    hint: "New sign-off paragraph. Everything above untouched.",
    group: "regenerate",
  },
  {
    id: COVER_LETTER_AI_ACTIONS.CHANGE_TONE,
    label: "Change tone",
    hint: "Same content and facts, different voice.",
    group: "adjust",
    needs: "tone",
  },
  {
    id: COVER_LETTER_AI_ACTIONS.CHANGE_LENGTH,
    label: "Change length",
    hint: "Shorten or expand without losing the strongest points.",
    group: "adjust",
    needs: "length",
  },
  {
    id: COVER_LETTER_AI_ACTIONS.IMPROVE_GRAMMAR,
    label: "Improve grammar",
    hint: "Fix grammar, punctuation and flow. Wording preserved.",
    group: "refine",
  },
  {
    id: COVER_LETTER_AI_ACTIONS.MORE_PERSUASIVE,
    label: "Make more persuasive",
    hint: "Stronger case for why you fit this role.",
    group: "refine",
  },
  {
    id: COVER_LETTER_AI_ACTIONS.SIMPLIFY,
    label: "Simplify writing",
    hint: "Plainer language. Cuts jargon and long sentences.",
    group: "refine",
  },
  {
    id: COVER_LETTER_AI_ACTIONS.HIGHLIGHT_ACHIEVEMENTS,
    label: "Highlight achievements",
    hint: "Surface measurable results already in your resume.",
    group: "refine",
  },
] as const;

export const AI_ACTION_LABELS: Record<CoverLetterAIAction, string> = AI_ACTION_OPTIONS.reduce(
  (acc, a) => ({ ...acc, [a.id]: a.label }),
  {} as Record<CoverLetterAIAction, string>,
);

export const AI_ACTION_GROUP_LABELS: Record<AIActionOption["group"], string> = {
  regenerate: "Regenerate",
  adjust: "Adjust",
  refine: "Refine",
};

// ── Document status ───────────────────────────────────────────────────────

export const COVER_LETTER_STATUSES = {
  DRAFT: "draft",
  FINAL: "final",
  DOWNLOADED: "downloaded",
} as const;

export type CoverLetterStatus = (typeof COVER_LETTER_STATUSES)[keyof typeof COVER_LETTER_STATUSES];

export const STATUS_LABELS: Record<CoverLetterStatus, string> = {
  draft: "Draft",
  final: "Final",
  downloaded: "Downloaded",
};

/** Chip tone per status — matches the dashboard's Chip palette. */
export const STATUS_TONES: Record<CoverLetterStatus, "default" | "blue" | "green"> = {
  draft: "default",
  final: "blue",
  downloaded: "green",
};

// ── Version provenance ────────────────────────────────────────────────────

export const VERSION_SOURCES = {
  GENERATE: "generate",
  AI_ACTION: "ai_action",
  MANUAL: "manual",
  DUPLICATE: "duplicate",
  RESTORE: "restore",
} as const;

export type VersionSource = (typeof VERSION_SOURCES)[keyof typeof VERSION_SOURCES];

export const VERSION_SOURCE_LABELS: Record<VersionSource, string> = {
  generate: "Generated",
  ai_action: "AI edit",
  manual: "Manual edit",
  duplicate: "Duplicated",
  restore: "Restored",
};

// ── Limits ────────────────────────────────────────────────────────────────

/** Custom instructions are optional; empty means "AI picks the best version". */
export const MAX_CUSTOM_INSTRUCTIONS = 500;
export const MAX_LETTER_NAME = 80;
export const MAX_VERSION_LABEL = 60;

/** Hard ceiling on stored letter text — well above the longest Detailed letter. */
export const MAX_LETTER_CHARS = 20_000;

export function sanitizeCustomInstructions(value: string | null | undefined): string | undefined {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, MAX_CUSTOM_INSTRUCTIONS);
}
