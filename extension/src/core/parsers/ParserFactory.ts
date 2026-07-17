import { SiteDetector } from "../site-detection/SiteDetector";
import { SupportedSite } from "../site-detection/types";
import { ParserRegistry } from "./ParserRegistry";
import type { JobParser } from "./types";

export class ParserFactory {
  /** Returns the parser for the current hostname, or `null` on an unsupported/unrecognized site. */
  static getParser(hostname: string): JobParser | null {
    const site = SiteDetector.detect(hostname);
    if (site === SupportedSite.Unsupported) return null;
    return ParserRegistry.get(site);
  }
}
