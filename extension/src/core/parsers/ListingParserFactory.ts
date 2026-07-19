import { SiteDetector } from "../site-detection/SiteDetector";
import { SupportedSite } from "../site-detection/types";
import { ListingParserRegistry } from "./ListingParserRegistry";
import type { ListingParser } from "./ListingParser";

/**
 * Mirror of `ParserFactory` for listing/search pages: resolves the current
 * hostname to a `ListingParser` (or `null`). Whether the current *page* is
 * actually a listing page is the parser's own `matches()` call — this only
 * answers "does this site have a listing parser at all?".
 */
export class ListingParserFactory {
  static getListingParser(hostname: string): ListingParser | null {
    const site = SiteDetector.detect(hostname);
    if (site === SupportedSite.Unsupported) return null;
    return ListingParserRegistry.get(site);
  }
}
