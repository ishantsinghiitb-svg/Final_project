import { SupportedSite } from "../site-detection/types";
import { IndeedParser } from "./indeed/IndeedParser";
import { InternshalaParser } from "./internshala/InternshalaParser";
import { LinkedInParser } from "./linkedin/LinkedInParser";
import { NaukriParser } from "./naukri/NaukriParser";
import type { JobParser } from "./types";
import { UnstopParser } from "./unstop/UnstopParser";

/**
 * One parser instance per site. Adding a new job board is: implement its
 * `BaseParser` subclass, register it here — nothing else in the pipeline
 * (content script, factory, validator, sync) needs to change.
 */
const registry: Partial<Record<SupportedSite, JobParser>> = {
  [SupportedSite.LinkedIn]: new LinkedInParser(),
  [SupportedSite.Internshala]: new InternshalaParser(),
  [SupportedSite.Naukri]: new NaukriParser(),
  [SupportedSite.Indeed]: new IndeedParser(),
  [SupportedSite.Unstop]: new UnstopParser(),
};

export class ParserRegistry {
  static get(site: SupportedSite): JobParser | null {
    return registry[site] ?? null;
  }
}
