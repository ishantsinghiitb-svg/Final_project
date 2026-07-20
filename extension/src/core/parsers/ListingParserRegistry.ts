import { SupportedSite } from "../site-detection/types";
import { FounditListingParser } from "./foundit/FounditListingParser";
import { InternshalaListingParser } from "./internshala/InternshalaListingParser";
import type { ListingParser } from "./ListingParser";

/**
 * One listing/search-page parser per site — the multi-card counterpart to
 * `ParserRegistry`. Only sites whose listing pages are worth capturing
 * card-by-card appear here (Internshala, Foundit); LinkedIn/Naukri/Wellfound
 * have detail parsers only — Wellfound in particular deliberately has NO
 * listing parser (see the note atop `WellfoundJobParser`: its listing and
 * single-job modal share the same `/jobs` URL, so a listing parser there
 * would shadow the single-job Save/Track flow). Registering a listing parser
 * is the whole integration — the content script discovers it through
 * `ListingParserFactory`, no hardcoded site checks.
 */
const registry: Partial<Record<SupportedSite, ListingParser>> = {
  [SupportedSite.Internshala]: new InternshalaListingParser(),
  [SupportedSite.Foundit]: new FounditListingParser(),
};

export class ListingParserRegistry {
  static get(site: SupportedSite): ListingParser | null {
    return registry[site] ?? null;
  }
}
