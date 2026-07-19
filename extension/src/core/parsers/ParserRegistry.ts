import { SupportedSite } from "../site-detection/types";
import { IndeedParser } from "./indeed/IndeedParser";
import { InternshalaJobParser } from "./internshala/InternshalaJobParser";
import { LinkedInParser } from "./linkedin/LinkedInParser";
import { NaukriJobParser } from "./naukri/NaukriJobParser";
import type { JobParser } from "./types";
import { UnstopParser } from "./unstop/UnstopParser";

/**
 * One single-job (detail-page) parser instance per site. Adding a new job board
 * is: implement its `BaseParser` subclass, register it here — nothing else in
 * the pipeline (content script, factory, validator, sync) needs to change.
 *
 * Listing/search pages are a separate concern with their own registry
 * (`ListingParserRegistry`); a site can have a detail parser here, a listing
 * parser there, or both.
 */
const registry: Partial<Record<SupportedSite, JobParser>> = {
  [SupportedSite.LinkedIn]: new LinkedInParser(),
  [SupportedSite.Internshala]: new InternshalaJobParser(),
  [SupportedSite.Naukri]: new NaukriJobParser(),
  [SupportedSite.Indeed]: new IndeedParser(),
  [SupportedSite.Unstop]: new UnstopParser(),
};

export class ParserRegistry {
  static get(site: SupportedSite): JobParser | null {
    return registry[site] ?? null;
  }
}
