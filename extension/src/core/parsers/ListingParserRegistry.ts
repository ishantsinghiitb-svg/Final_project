import { SupportedSite } from "../site-detection/types";
import { FounditListingParser } from "./foundit/FounditListingParser";
import { IndeedListingParser } from "./indeed/IndeedListingParser";
import { InternshalaListingParser } from "./internshala/InternshalaListingParser";
import type { ListingParser } from "./ListingParser";
import { UnstopListingParser } from "./unstop/UnstopListingParser";

/**
 * One listing/search-page parser per site — the multi-card counterpart to
 * `ParserRegistry`. Only sites whose listing pages are worth capturing
 * card-by-card appear here (Internshala, Foundit, Indeed); LinkedIn/Naukri/
 * Wellfound have detail parsers only — Wellfound in particular deliberately
 * has NO listing parser (see the note atop `WellfoundJobParser`: its listing
 * and single-job modal share the same `/jobs` URL, so a listing parser there
 * would shadow the single-job Save/Track flow). Indeed's homepage/search and
 * single-job pane ALSO share a URL, so `IndeedListingParser.matches()` guards
 * against that shadow by returning false whenever a `vjk`/`jk` job key is in
 * the URL. Registering a listing parser is the whole integration — the content
 * script discovers it through `ListingParserFactory`, no hardcoded site checks.
 */
const registry: Partial<Record<SupportedSite, ListingParser>> = {
  [SupportedSite.Internshala]: new InternshalaListingParser(),
  [SupportedSite.Foundit]: new FounditListingParser(),
  [SupportedSite.Indeed]: new IndeedListingParser(),
  [SupportedSite.Unstop]: new UnstopListingParser(),
};

export class ListingParserRegistry {
  static get(site: SupportedSite): ListingParser | null {
    return registry[site] ?? null;
  }
}
