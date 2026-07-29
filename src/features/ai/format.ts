// ── AI presentation formatting (Module 6G) ──
//
// Pure display helpers shared by the AI surfaces. Kept out of the component
// files so both the Hub's rows and the provenance strip can use them without
// either importing the other's React module.

/**
 * When an AI result was produced, in the way a person would say it: relative
 * for anything recent, an absolute date once "N days ago" stops being useful.
 * The year is dropped within the current year — it's noise the reader can
 * infer, and these labels sit in dense metadata lines.
 */
export function formatGeneratedAt(iso: string): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";

  const diffMs = Date.now() - then.getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;

  const days = Math.round(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;

  return then.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: then.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}
