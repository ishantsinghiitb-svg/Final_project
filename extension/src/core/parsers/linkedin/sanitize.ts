/**
 * Rebuilds a job description's HTML from scratch, keeping only a small
 * allowlist of structural tags and stripping every attribute on every
 * retained element. This runs before the HTML is ever persisted — the
 * result is shared, stored data rendered to every user who later views the
 * same Global Job, so an unsanitized copy of third-party HTML would be a
 * stored-XSS vector. Rebuilding the tree (rather than trying to blacklist
 * dangerous patterns in the original string) means there is no attribute,
 * tag, or URL scheme left that could carry a script or event handler.
 *
 * `<template>` is used to parse — its content is an inert DocumentFragment,
 * so nothing in the source (images, scripts) ever loads or executes.
 */
const ALLOWED_TAGS = new Set([
  "P",
  "BR",
  "UL",
  "OL",
  "LI",
  "STRONG",
  "EM",
  "B",
  "I",
  "H1",
  "H2",
  "H3",
  "H4",
]);
const INERT_TAGS = new Set(["SCRIPT", "STYLE"]);

/**
 * LinkedIn frequently marks up description paragraphs as `<div>`/`<section>`
 * blocks rather than semantic `<p>` tags. Unwrapping those into their parent
 * (like any other disallowed wrapper) would merge every block's text into
 * one run with no boundary between them — exactly the "flattened into one
 * giant paragraph" symptom. Rewriting them to their allowed block-level
 * equivalent instead keeps each one as its own paragraph.
 */
const BLOCK_TAG_ALIASES: Record<string, string> = {
  DIV: "P",
  SECTION: "P",
  ARTICLE: "P",
};

export function sanitizeDescriptionHtml(rawHtml: string): string {
  const template = document.createElement("template");
  template.innerHTML = rawHtml;

  const output = document.createElement("div");
  appendSanitized(template.content, output, false);
  return output.innerHTML;
}

/**
 * `insideParagraph` tracks whether an ancestor already opened a `<p>`-
 * equivalent for this run — real `<p>` elements can't validly nest (the
 * HTML parser auto-closes the outer one when it meets an inner one), so a
 * `<div>` found inside another aliased `<div>` gets a `<br>` boundary
 * instead of a second nested `<p>`.
 */
function appendSanitized(source: Node, target: Node, insideParagraph: boolean): void {
  source.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      target.appendChild(document.createTextNode(child.textContent ?? ""));
      return;
    }

    if (child.nodeType !== Node.ELEMENT_NODE) return;

    const el = child as Element;
    if (INERT_TAGS.has(el.tagName)) return;

    const alias = BLOCK_TAG_ALIASES[el.tagName];
    if (alias) {
      if (insideParagraph) {
        if (target.lastChild) target.appendChild(document.createElement("br"));
        appendSanitized(el, target, true);
      } else {
        const clean = document.createElement(alias.toLowerCase());
        appendSanitized(el, clean, true);
        target.appendChild(clean);
      }
      return;
    }

    if (ALLOWED_TAGS.has(el.tagName)) {
      const clean = document.createElement(el.tagName.toLowerCase());
      appendSanitized(el, clean, insideParagraph || el.tagName === "P");
      target.appendChild(clean);
    } else {
      // Unwrap disallowed wrappers (span/a/font/...) into their children so
      // their text survives without carrying the tag or its attributes over.
      appendSanitized(el, target, insideParagraph);
    }
  });
}
