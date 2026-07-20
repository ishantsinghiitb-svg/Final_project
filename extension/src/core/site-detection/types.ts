/**
 * A job board the extension knows about. `Unsupported` covers every other
 * site the content script may run on (or be injected into by mistake).
 */
export const SupportedSite = {
  LinkedIn: "linkedin",
  Internshala: "internshala",
  Naukri: "naukri",
  Indeed: "indeed",
  Unstop: "unstop",
  Wellfound: "wellfound",
  Foundit: "foundit",
  /**
   * DECOMMISSIONED — not a real board. This was the `source` tag the Module
   * 4C Generic Parser stamped on jobs it extracted from a site with no
   * dedicated parser. That parser was pulled from production (real-world
   * testing showed dedicated parsers are meaningfully more accurate, and a
   * wrong extraction is worse than none), so nothing in the live pipeline
   * produces this value anymore — `SiteDetector` never returns it, and
   * `ParserRegistry` has no entry for `Unsupported` to map to it. Left
   * defined only so the retained-for-reference implementation
   * (`core/parsers/generic/`) still compiles; do not wire it back in without
   * an explicit decision to re-ship the Generic Parser.
   */
  Generic: "generic",
  Unsupported: "unsupported",
} as const;

export type SupportedSite = (typeof SupportedSite)[keyof typeof SupportedSite];
