// ── Module 10B.2: what the crawler learned while running ──
//
// `PlatformCrawler.fetchRawPostings` is Module 10A's frozen signature: it
// returns payloads and nothing else. But a production crawl needs to report
// three things the payload list cannot express:
//
//   warnings  — pagination caps, empty pages, per-page failures
//   skipped   — postings the crawler deliberately excluded (drafts, unpublished)
//   complete  — whether the crawl can be PROVEN to have seen the whole source
//
// So the orchestrator hands the crawler a sink to fill, rather than the
// interface being widened. This replaces the plain `string[]` warning sink
// Module 10B.1 used; a warnings-only array is still supported by
// `observationsFrom` so nothing had to be rewritten at once.

export type CrawlObservations = {
  warnings: string[];
  /** Postings excluded before parsing (Ashby drafts, unpublished Recruitee offers). */
  skipped: number;
  /**
   * Starts true and is set false the moment anything makes completeness
   * unprovable. Deliberately pessimistic: "we think we got everything" is only
   * safe to act on when nothing went wrong, and Module 10B.2's crawl-safety
   * rule keys the source-observation lifecycle off exactly this flag.
   */
  complete: boolean;
};

export function newObservations(): CrawlObservations {
  return { warnings: [], skipped: 0, complete: true };
}

/** Records a warning AND, when it means the crawl is not provably whole, clears `complete`. */
export function noteIncomplete(observations: CrawlObservations, warning: string): void {
  observations.warnings.push(warning);
  observations.complete = false;
}
