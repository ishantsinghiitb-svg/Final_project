import { stripRichTextMarkup } from "./richText";
import type { LetterStats } from "./types";

// ── Letter statistics (Module 6E) ──
//
// Fully deterministic and client-side: typing in the editor recomputes these on
// every keystroke, so they must never touch the network or cost a credit.
//
// Computed on the STRIPPED text (markup syntax removed) so `**bold**` counts
// as one word ("bold"), not three tokens inflated by asterisks — the numbers
// should describe what a reader actually sees, not the raw storage syntax.

/** Average adult reading speed for prose. */
const WORDS_PER_MINUTE = 200;

/** Word count on the DISPLAY text — markup syntax stripped first. */
export function countWords(text: string): number {
  const trimmed = stripRichTextMarkup(text).trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function computeStats(text: string): LetterStats {
  const display = stripRichTextMarkup(text);
  const wordCount = countWords(text);
  const paragraphCount = display
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean).length;

  return {
    wordCount,
    charCount: display.length,
    charCountNoSpaces: display.replace(/\s/g, "").length,
    paragraphCount,
    readingSeconds: Math.round((wordCount / WORDS_PER_MINUTE) * 60),
  };
}

/** "1 credit used · 3.2s" / "Free · 1.8s" — the toast subtitle for every AI call. */
export function formatGenerationMeta(gen: {
  creditsCharged: number;
  generationMs: number;
}): string {
  const seconds = (gen.generationMs / 1000).toFixed(1);
  const creditPart = gen.creditsCharged > 0 ? `${gen.creditsCharged} credit used` : "Free";
  return `${creditPart} · ${seconds}s`;
}

/** "48 sec" / "1 min 20 sec" — short enough for a stat row. */
export function formatReadingTime(seconds: number): string {
  if (seconds < 60) return `${seconds} sec`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} sec`;
}

/** "just now" / "12 min ago" / "3 days ago" — used by stats + history rows. */
export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";

  const diffSeconds = Math.round((Date.now() - then) / 1000);
  if (diffSeconds < 45) return "just now";
  if (diffSeconds < 3600) return `${Math.round(diffSeconds / 60)} min ago`;
  if (diffSeconds < 86400) {
    const hours = Math.round(diffSeconds / 3600);
    return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  }
  const days = Math.round(diffSeconds / 86400);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** "28 Jul 2026" — absolute dates for the history table. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
