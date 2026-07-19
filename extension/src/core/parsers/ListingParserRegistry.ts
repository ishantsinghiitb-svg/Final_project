import { SupportedSite } from "../site-detection/types";
import { InternshalaListingParser } from "./internshala/InternshalaListingParser";
import type { ListingParser } from "./ListingParser";

/**
 * One listing/search-page parser per site — the multi-card counterpart to
 * `ParserRegistry`. Only sites whose listing pages are worth capturing card-by
 * -card appear here (Internshala today); LinkedIn/Naukri have detail parsers
 * only. Registering a listing parser is the whole integration — the content
 * script discovers it through `ListingParserFactory`, no hardcoded site checks.
 */
const registry: Partial<Record<SupportedSite, ListingParser>> = {
  [SupportedSite.Internshala]: new InternshalaListingParser(),
};

export class ListingParserRegistry {
  static get(site: SupportedSite): ListingParser | null {
    return registry[site] ?? null;
  }
}
