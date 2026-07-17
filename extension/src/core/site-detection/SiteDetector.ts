import { SupportedSite } from "./types";

/**
 * Host-based site identification only. Which URL *shapes* on a site count as
 * a job page is a parser concern (see BaseParser) — LinkedIn in particular
 * renders job details on /jobs/view/*, /jobs/search/*, /jobs/collections/*
 * and others, so gating here on path would miss valid pages. Detection of
 * "is there an actual job to parse" happens by attempting the parse itself.
 */
export class SiteDetector {
  static detect(hostname: string): SupportedSite {
    const host = hostname.toLowerCase();

    if (this.matches(host, "linkedin.com")) return SupportedSite.LinkedIn;
    if (this.matches(host, "internshala.com")) return SupportedSite.Internshala;
    if (this.matches(host, "naukri.com")) return SupportedSite.Naukri;
    if (this.matches(host, "indeed.com")) return SupportedSite.Indeed;
    if (this.matches(host, "unstop.com")) return SupportedSite.Unstop;

    return SupportedSite.Unsupported;
  }

  private static matches(hostname: string, root: string): boolean {
    return hostname === root || hostname.endsWith(`.${root}`);
  }
}
