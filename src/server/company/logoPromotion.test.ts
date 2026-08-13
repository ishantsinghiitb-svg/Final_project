import { describe, expect, it } from "vitest";
import { isUsableLogoUrl, pickPromotableLogo, type LogoCandidatePosting } from "./logoPromotion";

const posting = (
  companyLogoUrl: string | null,
  createdAt: string,
  source = "internshala",
): LogoCandidatePosting => ({ companyLogoUrl, createdAt, source });

describe("isUsableLogoUrl", () => {
  it("accepts the CDN URLs the existing 186 logos actually use", () => {
    expect(isUsableLogoUrl("https://wwr-pro.s3.amazonaws.com/logos/0171/5998/logo.gif")).toBe(true);
    expect(
      isUsableLogoUrl("https://internshala-uploads.internshala.com/logo%2Ffs6zo5lb5on-12841.jpeg"),
    ).toBe(true);
    expect(isUsableLogoUrl("https://media.licdn.com/dms/image/v2/D560BAQG9PE-JEHJrNA/x")).toBe(
      true,
    );
  });

  it("rejects empty, relative and non-http values", () => {
    expect(isUsableLogoUrl(null)).toBe(false);
    expect(isUsableLogoUrl("")).toBe(false);
    expect(isUsableLogoUrl("   ")).toBe(false);
    expect(isUsableLogoUrl("/assets/logo.png")).toBe(false);
    expect(isUsableLogoUrl("data:image/png;base64,iVBORw0KGgo=")).toBe(false);
  });
});

describe("pickPromotableLogo", () => {
  it("promotes the single logo its postings agree on", () => {
    const result = pickPromotableLogo([
      posting("https://cdn.example.org/a.png", "2026-01-01T00:00:00Z"),
      posting("https://cdn.example.org/a.png", "2026-01-02T00:00:00Z"),
      posting(null, "2026-01-03T00:00:00Z"),
    ]);
    expect(result).toMatchObject({
      logoUrl: "https://cdn.example.org/a.png",
      votes: 2,
      candidates: 2,
      contested: false,
    });
  });

  it("refuses when the company already has a logo — an established mark is never replaced", () => {
    const result = pickPromotableLogo(
      [posting("https://cdn.example.org/new.png", "2026-01-01T00:00:00Z")],
      "https://cdn.example.org/established.png",
    );
    expect(result).toBeNull();
  });

  it("refuses when no posting carries a usable logo", () => {
    expect(pickPromotableLogo([posting(null, "2026-01-01T00:00:00Z")])).toBeNull();
    expect(pickPromotableLogo([posting("/relative.png", "2026-01-01T00:00:00Z")])).toBeNull();
    expect(pickPromotableLogo([])).toBeNull();
  });

  it("takes the majority mark when postings disagree, and says so", () => {
    const result = pickPromotableLogo([
      posting("https://cdn.example.org/minority.png", "2026-01-01T00:00:00Z"),
      posting("https://cdn.example.org/majority.png", "2026-01-02T00:00:00Z"),
      posting("https://cdn.example.org/majority.png", "2026-01-03T00:00:00Z"),
    ]);
    expect(result).toMatchObject({
      logoUrl: "https://cdn.example.org/majority.png",
      votes: 2,
      candidates: 3,
      contested: true,
    });
  });

  it("breaks a tie on the earliest posting, deterministically", () => {
    const result = pickPromotableLogo([
      posting("https://cdn.example.org/later.png", "2026-02-01T00:00:00Z"),
      posting("https://cdn.example.org/earlier.png", "2026-01-01T00:00:00Z"),
    ]);
    expect(result?.logoUrl).toBe("https://cdn.example.org/earlier.png");
    expect(result?.contested).toBe(true);
  });

  it("produces the same answer regardless of input order", () => {
    const postings = [
      posting("https://cdn.example.org/b.png", "2026-01-02T00:00:00Z"),
      posting("https://cdn.example.org/a.png", "2026-01-01T00:00:00Z"),
      posting("https://cdn.example.org/b.png", "2026-01-03T00:00:00Z"),
    ];
    const forward = pickPromotableLogo(postings);
    const reversed = pickPromotableLogo([...postings].reverse());
    expect(forward).toEqual(reversed);
  });

  it("reports the platforms the winning logo was captured from", () => {
    const result = pickPromotableLogo([
      posting("https://cdn.example.org/a.png", "2026-01-01T00:00:00Z", "weworkremotely"),
      posting("https://cdn.example.org/a.png", "2026-01-02T00:00:00Z", "internshala"),
    ]);
    expect(result?.sources).toEqual(["internshala", "weworkremotely"]);
  });
});
