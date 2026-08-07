import type { Json } from "@/types/database";
import type { Suggestion } from "@/features/gmail/types";

// ── Suggestion summary reading (Module 9A) ──
//
// The sync pipeline writes a structured `summary` block into every
// suggestion's `suggested_payload` (see src/server/gmail/SuggestionBuilder).
// It lives in the jsonb payload rather than its own columns deliberately —
// it's presentation-shaped data derived from the message, and putting it
// there avoided a schema change for what is fundamentally a display concern.
//
// Everything here tolerates its absence: suggestions synced before the
// summary block existed have no `summary` key at all, and those rows must
// still render (falling back to the flat `explanation` string) rather than
// crash the Inbox.

export type SuggestionSummary = {
  headline: string;
  company: string | null;
  role: string | null;
  recruiter: string | null;
  receivedAtIso: string | null;
  reason: string;
  /** What the user must DO, or null when the email is purely informational. */
  action: string | null;
  confidenceReasons: string[];
  subject: string | null;
};

function str(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === "string" && value.trim() ? value : null;
}

/** Reads the structured summary block, or null for rows that predate it. */
export function readSuggestionSummary(
  suggestion: Pick<Suggestion, "suggested_payload">,
): SuggestionSummary | null {
  const payload = suggestion.suggested_payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;

  const raw = (payload as Record<string, Json>).summary;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;

  const headline = str(source, "headline");
  const reason = str(source, "reason");
  if (!headline || !reason) return null;

  const rawReasons = source.confidenceReasons;
  const confidenceReasons = Array.isArray(rawReasons)
    ? rawReasons.filter((r): r is string => typeof r === "string")
    : [];

  return {
    headline,
    company: str(source, "company"),
    role: str(source, "role"),
    recruiter: str(source, "recruiter"),
    receivedAtIso: str(source, "receivedAtIso"),
    reason,
    // Absent on suggestions synced before the action line existed — those
    // simply render without one rather than breaking.
    action: str(source, "action"),
    confidenceReasons,
    subject: str(source, "subject"),
  };
}

export type ConfidenceTier = {
  label: "High" | "Medium" | "Low";
  tone: "green" | "amber" | "default";
  /** Whole-number percent, e.g. 83 — shown alongside the tier. */
  percent: number;
  /** "Medium confidence (83%)" — the full display string. */
  display: string;
};

/**
 * Three tiers rather than the previous two. "Low" is reachable because a
 * confident classification can still be paired with a weak/ambiguous
 * application match (SuggestionBuilder multiplies the two), and calling that
 * "Medium" overstated it.
 *
 * The percentage is shown next to the tier because a bare word invites the
 * question "how sure is that?" — pairing it with the number, and with the
 * per-suggestion "Detected because" checklist, is what makes the score
 * auditable instead of an opaque verdict.
 */
export function confidenceTier(confidence: number): ConfidenceTier {
  const percent = Math.round(Math.max(0, Math.min(1, confidence)) * 100);
  const label = confidence >= 0.75 ? "High" : confidence >= 0.5 ? "Medium" : "Low";
  const tone = label === "High" ? "green" : label === "Medium" ? "amber" : "default";
  return { label, tone, percent, display: `${label} confidence (${percent}%)` };
}

/** "Today" / "Yesterday" / "3 days ago" / an absolute date past a week. */
export function relativeDay(iso: string): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(then)) / 86_400_000);

  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return then.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
