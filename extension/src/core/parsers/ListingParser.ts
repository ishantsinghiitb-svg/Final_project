import type { ParserContext, UniversalJob } from "./types";

/**
 * A parser for job-board *listing/search* pages, where many postings are shown
 * as cards at once — distinct from `JobParser`, which reads a single job-detail
 * page. Internshala's search pages are the only surface (today) that warrants
 * this: its listing cards already carry enough to seed a Global Job (title,
 * company, logo, location, salary, a description snippet, skills, posted-time),
 * and the detail page later enriches the SAME row (matched by
 * `source`+`source_job_id`) via the existing COALESCE upsert.
 *
 * Extraction ONLY, exactly like `JobParser`: `parseCard` returns a
 * `UniversalJob` (unknown fields left at their defaults) — normalization,
 * validation, dedup and persistence remain later pipeline stages. The
 * content-script observer (`ListingCapture`) owns *when* cards are parsed
 * (viewport visibility) and how they're deduped/synced; a `ListingParser`
 * never touches the DOM lifecycle, the network, or observers.
 */
export interface ListingParser {
  /**
   * True when the current page is a listing/search page this parser handles.
   * Lets the content script pick the listing flow over the single-job flow
   * without hardcoding any per-site URL logic itself (see
   * `ListingParserFactory`). Must be cheap and side-effect-free.
   */
  matches(context: ParserContext): boolean;

  /**
   * All job-card elements currently present under `root`. Called repeatedly as
   * infinite-scroll appends more cards, so it must return the full current set
   * (the observer diffs against what it has already seen) and must never
   * include non-card chrome (ads, promos, section headers).
   */
  findCards(root: ParentNode): Element[];

  /**
   * Extracts one card element into a `UniversalJob`, or `null` when the element
   * isn't a real, parseable card. Reads ONLY within `card` so one card can
   * never bleed another's data.
   */
  parseCard(card: Element, context: ParserContext): UniversalJob | null;
}
