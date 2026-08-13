import { describe, expect, it } from "vitest";
import { DEFAULT_FAVICON_SIZE, googleFaviconUrl, isLikelyPlaceholderFavicon } from "./logo";

describe("googleFaviconUrl", () => {
  it("builds a Google favicon-by-domain URL for a domain", () => {
    const url = googleFaviconUrl("acme.com");
    expect(url).toBe(
      `https://www.google.com/s2/favicons?sz=${DEFAULT_FAVICON_SIZE}&domain=acme.com`,
    );
  });

  it("lowercases and trims the domain", () => {
    expect(googleFaviconUrl("  Acme.COM  ")).toContain("domain=acme.com");
  });

  it("accepts a custom size", () => {
    expect(googleFaviconUrl("acme.com", 64)).toContain("sz=64");
  });

  it("returns null for empty/missing input — never guesses a logo without a domain", () => {
    expect(googleFaviconUrl(null)).toBeNull();
    expect(googleFaviconUrl(undefined)).toBeNull();
    expect(googleFaviconUrl("")).toBeNull();
    expect(googleFaviconUrl("   ")).toBeNull();
  });
});

describe("isLikelyPlaceholderFavicon", () => {
  it("flags a tiny response as a likely placeholder", () => {
    expect(isLikelyPlaceholderFavicon(96)).toBe(true);
  });

  it("does not flag a normal-sized image", () => {
    expect(isLikelyPlaceholderFavicon(4096)).toBe(false);
  });

  it("does not flag a zero/negative length as a placeholder (treated as no data, not a signal)", () => {
    expect(isLikelyPlaceholderFavicon(0)).toBe(false);
  });
});
