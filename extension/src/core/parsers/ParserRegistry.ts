import { SupportedSite } from "../site-detection/types";
import { FounditJobParser } from "./foundit/FounditJobParser";
import { IndeedParser } from "./indeed/IndeedParser";
import { InternshalaJobParser } from "./internshala/InternshalaJobParser";
import { LinkedInParser } from "./linkedin/LinkedInParser";
import { NaukriJobParser } from "./naukri/NaukriJobParser";
import type { JobParser } from "./types";
import { UnstopParser } from "./unstop/UnstopParser";
import { WellfoundJobParser } from "./wellfound/WellfoundJobParser";

/**
 * One single-job (detail-page) parser instance per site. Adding a new job board
 * is: implement its `BaseParser` subclass, register it here — nothing else in
 * the pipeline (content script, factory, validator, sync) needs to change.
 *
 * Listing/search pages are a separate concern with their own registry
 * (`ListingParserRegistry`); a site can have a detail parser here, a listing
 * parser there, or both.
 *
 * `Unsupported` intentionally has NO entry — the Module 4C Generic Parser
 * (`./generic/GenericParser.ts`) used to be registered here as its catch-all,
 * but was decommissioned from production (real-world testing showed
 * dedicated parsers are meaningfully more accurate, and a wrong extraction
 * is worse than no extraction). Its implementation is kept in the repo for
 * possible future reuse, but it must never be registered or reachable from
 * here — `ParserFactory.getParser` returns `null` for `Unsupported`, exactly
 * as it did before Module 4C. The "this looks like a hiring page but isn't
 * supported yet" UI state is driven by a separate, non-parsing detector
 * (`core/site-detection/hiringPageSignals.ts`), not by this registry.
 */
const registry: Partial<Record<SupportedSite, JobParser>> = {
  [SupportedSite.LinkedIn]: new LinkedInParser(),
  [SupportedSite.Internshala]: new InternshalaJobParser(),
  [SupportedSite.Naukri]: new NaukriJobParser(),
  [SupportedSite.Indeed]: new IndeedParser(),
  [SupportedSite.Unstop]: new UnstopParser(),
  [SupportedSite.Wellfound]: new WellfoundJobParser(),
  [SupportedSite.Foundit]: new FounditJobParser(),
};

export class ParserRegistry {
  static get(site: SupportedSite): JobParser | null {
    return registry[site] ?? null;
  }
}
