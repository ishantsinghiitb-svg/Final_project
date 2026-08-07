// ── Module 10A: Location normalization ──
//
// Mirrors the SQL `normalize_location_text()` helper (see
// supabase/migrations/20260722000001_module4a_hierarchical_dedup.sql) exactly
// — lowercase + whitespace collapse, NULL/"" → null — so a cross-platform
// dedup decision made in TS (see ../dedup) agrees with the one the DB would
// make for the same input. Deliberately does NOT do city/region parsing or
// aliasing (e.g. "Bangalore" vs "Bengaluru") — that's a real-world gazetteer
// problem out of scope for this module; two postings differing only by such
// an alias correctly stay un-merged rather than risk a false-positive merge.

export function normalizeLocationText(input: string | null | undefined): string | null {
  const cleaned = (input ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return cleaned || null;
}
