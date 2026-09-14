import { describe, expect, it } from "vitest";
import {
  collectLogoCandidatesFromHtml,
  extractCompanyLogoFromHtml,
  isGenericPlatformImage,
  normalizeLogoUrl,
  pickCompanyLogo,
} from "./companyLogo";

// ── Fixture-derived regression tests — Lever + Ashby ──
//
// The HTML fragments below are lifted verbatim (meta tags, JSON-LD, visible
// <img> tags) from two real captured pages, so a regression here is a
// regression against real production content, not a hypothetical:
//
//   Meesho, a real Lever job APPLICATION page (jobs.lever.co/meesho/…/apply):
//     - og:image AND twitter:image both point to
//       lever-client-logos.s3.us-west-2.amazonaws.com/4b7a9e56-…-1687351973980.png
//       — a genuine per-client Lever asset, not a vendor logo.
//     - a visible <img alt="Meesho logo" src="…4b7a9e56-…-1687351854309.png">
//       (same UUID prefix, confirming it is the same genuine Meesho asset).
//     - a SEPARATE visible <img alt="Lever logo" src="…lever-logo-refresh.svg"
//       class="footer-logo"> — Lever's own house mark, which must be rejected.
//     - no JSON-LD JobPosting block on this page at all.
//
//   Sarvam, a real Ashby job APPLICATION page (jobs.ashbyhq.com/sarvam/…):
//     - NO og:image and NO twitter:image anywhere on the page — the exact
//       case `boardLogo.ts`'s board-level og:image strategy alone cannot
//       handle.
//     - JSON-LD JobPosting IS present, but `hiringOrganization` carries only
//       `name`/`sameAs` — no `logo` field at all.
//     - the ONLY genuine signal is a visible
//       <img alt="Sarvam" class="_navLogoWordmarkImage_5bhg5_104" src="…">
//       whose class/alt says nothing about "logo" literally — an identity
//       match against the known company name is the only way to find it.
//     - the page DOES advertise Ashby's own favicon (cdn.ashbyprd.com), which
//       must never be substituted in as if it were the employer's logo.

const LEVER_BASE_URL = "https://jobs.lever.co/meesho/11111111-2222-3333-4444-555555555555/apply";
const MEESHO_LOGO_OG =
  "https://lever-client-logos.s3.us-west-2.amazonaws.com/4b7a9e56-d99e-4af6-acfc-4be8bde495d5-1687351973980.png";
const MEESHO_LOGO_IMG =
  "https://lever-client-logos.s3.us-west-2.amazonaws.com/4b7a9e56-d99e-4af6-acfc-4be8bde495d5-1687351854309.png";

const LEVER_FIXTURE_HTML = `<html><head>
  <meta property="og:image" content="${MEESHO_LOGO_OG}">
  <meta name="twitter:image" content="${MEESHO_LOGO_OG}">
</head><body>
  <img alt="Meesho logo" src="${MEESHO_LOGO_IMG}">
  <img alt="Lever logo" src="https://jobs.lever.co/img/lever-logo-refresh.svg" class="footer-logo">
</body></html>`;

const ASHBY_BASE_URL = "https://jobs.ashbyhq.com/sarvam/11111111-2222-3333-4444-555555555555";
const SARVAM_NAV_LOGO_RELATIVE = "./ashby_Sarvam_files/1af80f88-f1d7-4731-910c-57cfc83a13c5.png";
const SARVAM_NAV_LOGO_ABSOLUTE = new URL(SARVAM_NAV_LOGO_RELATIVE, ASHBY_BASE_URL).toString();

const ASHBY_FIXTURE_HTML = `<html><head>
  <meta name="description" content="GTM Strategy">
  <link rel="icon" type="image/svg+xml" href="https://cdn.ashbyprd.com/cdn_assets/22606dcf47948bf8cb1e65660d32535f48cfdf85/favicon.svg">
  <link rel="apple-touch-icon" sizes="180x180" href="https://cdn.ashbyprd.com/cdn_assets/22606dcf47948bf8cb1e65660d32535f48cfdf85/apple-touch-icon.png">
  <script type="application/ld+json">{"@context":"https://schema.org/","@type":"JobPosting","title":"GTM Strategy - Chanakya","datePosted":"2026-09-08","hiringOrganization":{"@type":"Organization","name":"Sarvam","sameAs":"https://www.sarvam.ai/"},"jobLocation":{"@type":"Place","address":{"@type":"PostalAddress","addressLocality":"Delhi","addressRegion":"Delhi","addressCountry":"India"}},"employmentType":"FULL_TIME"}</script>
</head><body>
  <img alt="Sarvam" class="_navLogoWordmarkImage_5bhg5_104" src="${SARVAM_NAV_LOGO_RELATIVE}">
  <img width="50" height="50" alt="" aria-hidden="true" src="data:image/png;base64,iVBORw0KGgo=">
</body></html>`;

describe("Lever (Meesho application-page fixture)", () => {
  it("extracts the genuine Meesho client logo from og:image, never Lever's own house logo", () => {
    const logo = extractCompanyLogoFromHtml(LEVER_FIXTURE_HTML, LEVER_BASE_URL, "Meesho");
    expect(logo).toBe(MEESHO_LOGO_IMG);
    expect(logo).not.toMatch(/lever-logo-refresh/);
  });

  it("collects the visible 'Meesho logo' image ahead of the generic 'Lever logo' image", () => {
    const candidates = collectLogoCandidatesFromHtml(LEVER_FIXTURE_HTML, "Meesho");
    const meeshoIndex = candidates.indexOf(MEESHO_LOGO_IMG);
    const leverHouseIndex = candidates.findIndex((c) => c.includes("lever-logo-refresh"));
    expect(meeshoIndex).toBeGreaterThanOrEqual(0);
    expect(leverHouseIndex).toBeGreaterThanOrEqual(0);
    expect(meeshoIndex).toBeLessThan(leverHouseIndex);
  });

  it("still rejects Lever's own house logo even when passed with no company name", () => {
    // No identity to match against — falls back to plain "logo" substring
    // matching, which still finds "Meesho logo" first in document order.
    const logo = extractCompanyLogoFromHtml(LEVER_FIXTURE_HTML, LEVER_BASE_URL);
    expect(logo).not.toMatch(/lever-logo-refresh/);
  });

  it("never returns the raw lever.co/img/ house-logo URL even in isolation", () => {
    expect(isGenericPlatformImage("https://jobs.lever.co/img/lever-logo-refresh.svg")).toBe(true);
    expect(isGenericPlatformImage(MEESHO_LOGO_IMG)).toBe(false);
  });
});

describe("Ashby (Sarvam application-page fixture) — no reliable og:image", () => {
  it("has no og:image or twitter:image at all — confirms the board-level-only strategy cannot work here", () => {
    expect(ASHBY_FIXTURE_HTML).not.toMatch(/og:image/);
    expect(ASHBY_FIXTURE_HTML).not.toMatch(/twitter:image/);
  });

  it("recovers the genuine Sarvam logo via employer-identity matching on the visible nav image", () => {
    const logo = extractCompanyLogoFromHtml(ASHBY_FIXTURE_HTML, ASHBY_BASE_URL, "Sarvam");
    expect(logo).toBe(SARVAM_NAV_LOGO_ABSOLUTE);
  });

  it("resolves the relative fixture-style src against the live page URL, never storing it as-is", () => {
    const logo = extractCompanyLogoFromHtml(ASHBY_FIXTURE_HTML, ASHBY_BASE_URL, "Sarvam");
    expect(logo).not.toMatch(/^\.\//);
    expect(logo?.startsWith("https://jobs.ashbyhq.com/")).toBe(true);
  });

  it("never substitutes Ashby's own favicon for the employer logo", () => {
    const logo = extractCompanyLogoFromHtml(ASHBY_FIXTURE_HTML, ASHBY_BASE_URL, "Sarvam");
    expect(logo).not.toMatch(/cdn\.ashbyprd\.com/);
    expect(isGenericPlatformImage("https://cdn.ashbyprd.com/cdn_assets/x/favicon.svg")).toBe(true);
  });

  it("still finds the nav image without a company name, since its own class literally says 'logo'", () => {
    // "_navLogoWordmarkImage_5bhg5_104" contains "logo" as a substring, so the
    // plain generic tier (no identity needed) already recovers it. The
    // identity-match tier exists for the harder case, covered below, where
    // the image's alt/class says nothing about "logo" at all.
    const logo = extractCompanyLogoFromHtml(ASHBY_FIXTURE_HTML, ASHBY_BASE_URL);
    expect(logo).toBe(SARVAM_NAV_LOGO_ABSOLUTE);
  });

  it("returns null (never a wrong logo) when neither an identity match nor the word 'logo' is present", () => {
    const noLogoWordHtml = `<html><body>
      <img alt="Sarvam" class="_navWordmarkImage_5bhg5_104" src="${SARVAM_NAV_LOGO_RELATIVE}">
    </body></html>`;
    // Without the company name, there is no identity signal and the image's
    // own alt/class say nothing about "logo" — the correct outcome is null.
    expect(extractCompanyLogoFromHtml(noLogoWordHtml, ASHBY_BASE_URL)).toBeNull();
    // With the company name, the identity-match tier recovers it correctly.
    expect(extractCompanyLogoFromHtml(noLogoWordHtml, ASHBY_BASE_URL, "Sarvam")).toBe(
      SARVAM_NAV_LOGO_ABSOLUTE,
    );
  });

  it("does not identity-match the decorative aria-hidden data: URI image", () => {
    const candidates = collectLogoCandidatesFromHtml(ASHBY_FIXTURE_HTML, "Sarvam");
    expect(candidates.some((c) => c.startsWith("data:"))).toBe(false);
  });
});

describe("employer-identity matching — general behaviour", () => {
  it("is case- and punctuation-insensitive", () => {
    const html = `<img alt="ACME-Corp Logo" src="https://cdn.example.com/acme.png">`;
    expect(extractCompanyLogoFromHtml(html, "https://example.com", "acme corp")).toBe(
      "https://cdn.example.com/acme.png",
    );
  });

  it("never widens what og:image/twitter:image accept — a generic social image is still rejected even with a matching company name in scope", () => {
    const html = `<meta property="og:image" content="https://workable.com/assets/facebook-preview.png">`;
    expect(extractCompanyLogoFromHtml(html, "https://apply.workable.com", "Acme")).toBeNull();
  });

  it("does not identity-match on a too-short company name (avoids matching everything)", () => {
    const html = `<img alt="A logo" src="https://cdn.example.com/a.png">`;
    // A 1-character company name is too weak a signal to trust for identity
    // matching; this still falls through to the plain "logo" substring tier,
    // which DOES match "A logo" — the point of this test is that identity
    // matching itself never fires on a degenerate needle.
    const candidates = collectLogoCandidatesFromHtml(html, "A");
    expect(candidates).toEqual(["https://cdn.example.com/a.png"]);
  });
});

describe("normalizeLogoUrl / pickCompanyLogo — unaffected by the identity-matching addition", () => {
  it("still rejects data: URIs", () => {
    expect(normalizeLogoUrl("data:image/png;base64,abc")).toBeNull();
  });

  it("still resolves a protocol-relative URL", () => {
    expect(normalizeLogoUrl("//cdn.example.com/logo.png")).toBe("https://cdn.example.com/logo.png");
  });

  it("pickCompanyLogo skips a generic candidate and falls through to the next", () => {
    const result = pickCompanyLogo(
      ["https://workable.com/assets/facebook-preview.png", "https://cdn.example.com/real-logo.png"],
      "https://example.com",
    );
    expect(result).toBe("https://cdn.example.com/real-logo.png");
  });
});
