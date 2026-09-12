// ── Turning ATS description HTML into the structure the product renders ──
//
// The app's stored `description_html` passes through
// src/lib/sanitizeJobDescriptionHtml.ts (the A1 layer), whose allowlist is
// exactly: p br ul ol li strong em b i h1 h2 h3 h4 — attribute-free. Anything
// else is UNWRAPPED, keeping only its text. That matters more than it sounds:
// a description built from `<div>` blocks (which several ATS bodies are) loses
// every block boundary and renders as one unbroken wall of text, which is the
// "giant paragraph" symptom this module exists to fix.
//
// So the crawler converts to the allowlisted shape BEFORE storing:
//   • div / section / article  → <p>   (block boundaries survive sanitization)
//   • h5 / h6                  → <h4>  (h5+ is not on the allowlist)
//   • a / span / font / table… → unwrapped, text kept
//   • script / style / form …  → dropped with their contents
//
// A1 is untouched by this — the sanitizer and the DB trigger still run
// afterwards and still have the final say. This only makes sure what reaches
// them is already expressible in their vocabulary, so sanitization preserves
// the document instead of flattening it.

import { collapseWhitespace, decodeHtmlEntities, findElements, htmlToInlineText } from "./html";

/** Tags the A1 sanitizer keeps. Anything produced here must be in this set. */
const ALLOWED = new Set([
  "p",
  "br",
  "ul",
  "ol",
  "li",
  "strong",
  "em",
  "b",
  "i",
  "h1",
  "h2",
  "h3",
  "h4",
]);

/** Block-level tags that must become a paragraph so their boundary survives. */
const BLOCK_TO_PARAGRAPH = new Set([
  "div",
  "section",
  "article",
  "main",
  "aside",
  "blockquote",
  "pre",
  "figure",
  "dd",
  "dt",
  "dl",
]);

/** Dropped together with their contents — never part of a job description. */
const DROP_WITH_CONTENT = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "noscript",
  "template",
  "svg",
  "math",
  "head",
  "title",
  "link",
  "meta",
  "base",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "option",
  "applet",
  "frame",
  "frameset",
  "audio",
  "video",
  "canvas",
  "map",
]);

/**
 * Rewrites ATS description HTML into the A1 allowlist's vocabulary.
 *
 * Deliberately a tag rewriter, not a parser: the input is already
 * machine-generated HTML from an ATS API, and the output is re-sanitized twice
 * downstream (application layer, then the database trigger), so this does not
 * need — and must not claim — to be a security boundary. Its job is structural
 * fidelity, not safety.
 */
export function toStructuredJobHtml(input: string | null | undefined): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;

  let html = raw;

  // Drop dangerous/irrelevant elements with their contents first, so their
  // inner text never leaks into the description as stray words.
  for (const tag of DROP_WITH_CONTENT) {
    html = html.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, "gi"), "");
    html = html.replace(new RegExp(`<\\/?${tag}\\b[^>]*>`, "gi"), "");
  }

  // HTML comments (including unterminated ones).
  html = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<!--[\s\S]*$/g, "");

  html = html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (match, rawName: string) => {
    const name = rawName.toLowerCase();
    const closing = match.startsWith("</");

    if (ALLOWED.has(name)) return closing ? `</${name}>` : `<${name}>`;
    if (name === "br" || name === "hr") return "<br>";
    if (name === "h5" || name === "h6") return closing ? "</h4>" : "<h4>";
    if (BLOCK_TO_PARAGRAPH.has(name)) return closing ? "</p>" : "<p>";
    // Everything else (span, a, font, table, tr, td, img, …) unwraps.
    return "";
  });

  // A <p> nested inside a <p> (from a div-in-div) is invalid and renders as an
  // empty block; flatten the redundant wrappers rather than emitting them.
  html = html.replace(/<p>\s*<p>/g, "<p>").replace(/<\/p>\s*<\/p>/g, "</p>");
  // Empty blocks left behind by unwrapped decorative markup.
  html = html.replace(/<p>(?:\s|&nbsp;|<br>)*<\/p>/gi, "");
  html = html.replace(/<(h[1-4])>(?:\s|&nbsp;)*<\/\1>/gi, "");
  html = html.replace(/<(ul|ol)>\s*<\/\1>/gi, "");
  html = html.replace(/<li>(?:\s|&nbsp;|<br>)*<\/li>/gi, "");
  // Runs of breaks add nothing once blocks exist.
  html = html.replace(/(?:<br>\s*){3,}/gi, "<br><br>");
  html = html.replace(/\s+/g, " ").trim();

  return html.length > 0 ? html : null;
}

/**
 * Plain text for the searchable `description` column, derived from the SAME
 * html the product renders so the two can never describe different postings.
 * Block boundaries become newlines (the detail page splits the plain-text
 * fallback on `\n`), and list items keep a bullet.
 */
export function structuredHtmlToText(html: string | null | undefined): string | null {
  const value = (html ?? "").trim();
  if (!value) return null;

  // "- " for list items, matching htmlToPlainText's existing convention — the
  // two produce the same plain-text shape, so swapping which one an adapter
  // uses never changes what a stored description looks like.
  let text = value
    .replace(/<\/(p|h[1-4]|ul|ol)>/gi, "\n\n")
    .replace(/<li>/gi, "\n- ")
    .replace(/<br>/gi, "\n")
    .replace(/<[^>]+>/g, "");

  text = decodeHtmlEntities(text)
    // Decoded &nbsp; (U+00A0) is written as an escape so the source stays ASCII.
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text.length > 0 ? text : null;
}

export type JobHtmlSection = {
  heading: string;
  /** List items under the heading, if it was followed by a list. */
  items: string[];
};

/**
 * Named sections in a description body.
 *
 * Handles BOTH real headings (`<h2>Qualifications</h2>`) and the pseudo-heading
 * convention ATS editors produce constantly — a standalone
 * `<p><strong>Role &amp; responsibilities</strong></p>` — because Greenhouse
 * bodies (verified on a live Groww posting) use the latter exclusively and a
 * heading-tag-only scan finds nothing in them.
 */
export function extractHtmlSections(input: string | null | undefined): JobHtmlSection[] {
  const html = (input ?? "").trim();
  if (!html) return [];

  const sections: JobHtmlSection[] = [];
  // Three heading shapes, because ATS bodies use all three interchangeably:
  //   1. a real heading tag                      <h2>Qualifications</h2>
  //   2. a paragraph that is entirely bold       <p><strong>Our Values</strong></p>
  //   3. a short paragraph ending in a colon     <p>Key Responsibilities:</p>
  // (3) is what SmartRecruiters actually emits inside its `jobDescription`
  // section, verified against a live Swiggy posting — without it the bullets
  // under that line belong to no section and are silently dropped. It is
  // bounded to short, single-line text so a sentence ending in a colon mid-body
  // is not mistaken for a heading.
  const headingPattern =
    /<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>|<p\b[^>]*>\s*<(?:strong|b)\b[^>]*>([\s\S]*?)<\/(?:strong|b)>\s*<\/p>|<p\b[^>]*>([^<]{1,60}:)\s*<\/p>/gi;

  const matches = [...html.matchAll(headingPattern)];
  for (let index = 0; index < matches.length; index++) {
    const match = matches[index];
    const heading = collapseWhitespace(
      htmlToInlineText(match[1] ?? match[2] ?? match[3] ?? "").replace(/[:\s]+$/, ""),
    );
    if (!heading) continue;

    const start = (match.index ?? 0) + match[0].length;
    const end =
      index + 1 < matches.length ? (matches[index + 1].index ?? html.length) : html.length;
    const body = html.slice(start, end);

    const items = findElements(body, "li")
      .map((element) => collapseWhitespace(htmlToInlineText(element.innerHtml)))
      .filter(Boolean);

    sections.push({ heading, items });
  }

  return sections;
}

const RESPONSIBILITY_HEADINGS =
  /(responsibilit|what you.{0,3}ll do|what you will do|you will|the role|role\s*&?\s*responsibilit|day to day|key duties|duties|your impact|about the role)/i;
const REQUIREMENT_HEADINGS =
  /(requirement|qualification|what we.{0,3}re looking for|who you are|about you|skills|experience|must have|eligibility|preferred candidate)/i;
const PREFERRED_HEADINGS = /(preferred|nice to have|bonus|good to have|plus|desirable)/i;
const BENEFIT_HEADINGS = /(benefit|perk|we offer|what we offer|why join|compensation)/i;

export type ClassifiedSections = {
  responsibilities: string[] | null;
  requirements: string[] | null;
  preferredQualifications: string[] | null;
  benefits: string[] | null;
};

/**
 * Buckets a description's list sections into the structured columns
 * `global_jobs` already has. Preferred-qualification headings are tested BEFORE
 * requirement headings, since "Preferred Qualifications" matches both and the
 * more specific reading is the right one.
 */
export function classifyHtmlSections(sections: JobHtmlSection[]): ClassifiedSections {
  const responsibilities: string[] = [];
  const requirements: string[] = [];
  const preferred: string[] = [];
  const benefits: string[] = [];

  for (const section of sections) {
    if (section.items.length === 0) continue;
    const heading = section.heading;

    if (PREFERRED_HEADINGS.test(heading)) preferred.push(...section.items);
    else if (BENEFIT_HEADINGS.test(heading)) benefits.push(...section.items);
    else if (RESPONSIBILITY_HEADINGS.test(heading)) responsibilities.push(...section.items);
    else if (REQUIREMENT_HEADINGS.test(heading)) requirements.push(...section.items);
  }

  const orNull = (values: string[]): string[] | null =>
    values.length > 0 ? [...new Set(values)] : null;

  return {
    responsibilities: orNull(responsibilities),
    requirements: orNull(requirements),
    preferredQualifications: orNull(preferred),
    benefits: orNull(benefits),
  };
}

/** Builds one `<h2>`-titled section of HTML from a title and a body fragment. */
export function sectionHtml(
  title: string | null | undefined,
  body: string | null | undefined,
): string {
  const heading = collapseWhitespace(title ?? "");
  const content = (body ?? "").trim();
  if (!content) return "";
  return heading ? `<h2>${escapeText(heading)}</h2>${content}` : content;
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
