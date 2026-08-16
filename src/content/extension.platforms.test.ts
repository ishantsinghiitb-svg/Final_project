import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { SUPPORTED_PLATFORMS } from "./extension";

/**
 * Guards the ONE marketing claim that is easy to get wrong and dishonest when
 * wrong: which job boards the Chrome extension actually supports.
 *
 * The extension is a separate package with its own build, so the website can't
 * import from it at runtime without dragging extension code into the web
 * bundle. Instead these tests read the extension's source files from disk and
 * assert the website's hand-maintained list matches what the code does. If a
 * parser is added or removed in the extension, this fails and the marketing
 * copy has to be updated with it.
 */

const EXT = resolve(process.cwd(), "extension/src");

function read(relativePath: string): string {
  return readFileSync(resolve(EXT, relativePath), "utf8");
}

/** Sites `ParserRegistry` registers a dedicated detail parser for. */
function registeredParserSites(): string[] {
  const source = read("core/parsers/ParserRegistry.ts");
  const body = source.slice(source.indexOf("const registry"), source.indexOf("export class"));
  return [...body.matchAll(/\[SupportedSite\.(\w+)\]:/g)].map((m) => m[1]);
}

/** Sites `SiteDetector.detect` can return (excluding the Unsupported fallback). */
function detectableSites(): string[] {
  const source = read("core/site-detection/SiteDetector.ts");
  return [...source.matchAll(/return SupportedSite\.(\w+);/g)]
    .map((m) => m[1])
    .filter((s) => s !== "Unsupported");
}

describe("marketing: supported extension platforms", () => {
  it("lists exactly the sites that have a registered parser", () => {
    expect([...SUPPORTED_PLATFORMS].map((p) => p.site).sort()).toEqual(
      registeredParserSites().sort(),
    );
  });

  it("lists only sites the extension's SiteDetector can actually detect", () => {
    const detectable = detectableSites();
    for (const platform of SUPPORTED_PLATFORMS) {
      expect(detectable, `${platform.name} is advertised but not detectable`).toContain(
        platform.site,
      );
    }
  });

  it("does not advertise ATS hosts that resolve to Unsupported", () => {
    // Host permissions are staged for these in the extension manifest, but no
    // parser exists yet — advertising them would be a false claim.
    const unshipped = [
      "Greenhouse",
      "Lever",
      "Ashby",
      "Workday",
      "SmartRecruiters",
      "Teamtailor",
      "Workable",
      "BambooHR",
      "Recruitee",
      "ApplyToJob",
    ];
    const advertised = SUPPORTED_PLATFORMS.map((p) => p.name.toLowerCase());
    for (const name of unshipped) {
      expect(advertised).not.toContain(name.toLowerCase());
    }
  });
});
