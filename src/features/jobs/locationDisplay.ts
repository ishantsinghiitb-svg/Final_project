// ── Module 11C-2: display-only location formatting ──
//
// Purely a rendering concern — cleans up empty comma segments a source's own
// location string sometimes carries (SmartRecruiters leaves the state field
// blank for many Indian postings, producing "Bengaluru, , India"; 71 of the
// 90 malformed location strings the 11C-2 investigation found match exactly
// this shape). NEVER touches the stored `location`/`city`/`state`/`country`
// columns, and is a completely separate function from `normalizeLocationText`
// (src/server/jobIntelligence/normalize/location.ts), which lowercases and
// collapses whitespace for CROSS-PLATFORM DEDUP matching — that function must
// never be changed to also handle display, or every dedup decision downstream
// of it would silently change too.
//
// Deliberately conservative: this only REMOVES segments a source itself left
// blank. It never infers, reorders, translates, or fills in a missing
// city/country — an already-terse or already-correct string, or one using a
// separator other than a bare empty comma segment (e.g. "New York, NY or San
// Mateo, CA"), passes through completely unchanged.

/**
 * Cleans up a location string for display: drops empty comma-separated
 * segments (`"Bengaluru, , India"` → `"Bengaluru, India"`), safely handling
 * leading/trailing/repeated empty segments and whitespace-only input.
 *
 * Splits on `;` first and formats each part independently before rejoining,
 * so a legitimate multi-location string
 * (`"New York, New York, United States; San Francisco, California, United States"`)
 * is preserved exactly — its own commas are cleaned within each part, but the
 * parts themselves are never merged, reordered, or dropped.
 *
 * Returns `""` for empty/whitespace-only input, exactly like `formatSalary`
 * and `formatPostedTime` (features/jobs/utils/index.ts) — callers gate
 * rendering on the returned string being truthy, so nothing is invented in
 * place of missing data.
 */
export function formatLocationDisplay(location: string | null | undefined): string {
  const raw = (location ?? "").trim();
  if (!raw) return "";

  return raw
    .split(";")
    .map((part) => cleanCommaSegments(part))
    .filter(Boolean)
    .join("; ");
}

function cleanCommaSegments(part: string): string {
  return part
    .split(",")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .join(", ");
}
