import type { LetterSections } from "./types";

// ── Deterministic letter section model (Module 6E) ──
//
// The Studio stores a cover letter as PLAIN TEXT so the user can rewrite any
// part of it freely. "Regenerate introduction / body / closing" therefore needs
// to recover structure from that text — this module does it deterministically,
// with no AI call and no stored schema to drift out of sync.
//
// The rules are the ones a cover letter actually follows:
//   • Paragraphs are blank-line separated.
//   • A greeting is a short first paragraph starting with Dear/Hello/Hi/To.
//   • A closing is the last paragraph, plus any trailing sign-off block
//     ("Sincerely," + name) which is short and comma/name shaped.
//   • The intro is the first substantive paragraph after the greeting.
//   • The body is everything left in the middle.
//
// Degenerate inputs never throw: a one-paragraph letter is all `intro`, an
// empty letter is all empty strings.

const GREETING_RE = /^(dear|hello|hi|to whom|greetings)\b/i;
const SIGNOFF_RE =
  /^(sincerely|regards|best regards|kind regards|warm regards|best|yours (sincerely|faithfully|truly)|thank you|thanks|respectfully|cheers)\b[,.]?$/i;

function splitParagraphs(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function isGreeting(paragraph: string): boolean {
  const firstLine = paragraph.split("\n")[0].trim();
  return firstLine.length <= 120 && GREETING_RE.test(firstLine);
}

/**
 * A trailing sign-off block: "Sincerely," on its own line, optionally followed
 * by a name/contact line or two. Short by construction — anything longer is a
 * real paragraph and belongs to the closing prose, not the sign-off.
 */
function isSignOffBlock(paragraph: string): boolean {
  const lines = paragraph
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0 || lines.length > 4) return false;
  return SIGNOFF_RE.test(lines[0]);
}

/**
 * Split a letter into greeting / intro / body / closing. Pure and total — every
 * input produces the four fields, and joining them back with `joinSections`
 * reproduces the same letter for any text this module itself produced.
 */
export function parseLetterSections(content: string): LetterSections {
  const paragraphs = splitParagraphs(content);
  const empty: LetterSections = { greeting: "", intro: "", body: "", closing: "" };
  if (paragraphs.length === 0) return empty;

  let rest = [...paragraphs];

  let greeting = "";
  if (isGreeting(rest[0])) {
    greeting = rest[0];
    rest = rest.slice(1);
  }
  if (rest.length === 0) return { ...empty, greeting };

  // Pull a trailing sign-off block off the end so it always travels with the
  // closing paragraph rather than being mistaken for one.
  let signOff = "";
  if (rest.length > 1 && isSignOffBlock(rest[rest.length - 1])) {
    signOff = rest[rest.length - 1];
    rest = rest.slice(0, -1);
  }

  const intro = rest[0] ?? "";
  const closingProse = rest.length > 1 ? rest[rest.length - 1] : "";
  const bodyParagraphs = rest.length > 2 ? rest.slice(1, -1) : [];

  const closing = [closingProse, signOff].filter(Boolean).join("\n\n");

  return {
    greeting,
    intro,
    body: bodyParagraphs.join("\n\n"),
    closing,
  };
}

/** Reassemble a letter from its sections, dropping any that are empty. */
export function joinSections(sections: LetterSections): string {
  return [sections.greeting, sections.intro, sections.body, sections.closing]
    .map((s) => s.trim())
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Replace exactly one section and return the full letter. Used by the section
 * AI actions so the untouched parts of the letter come back byte-identical.
 */
export function replaceSection(
  content: string,
  section: keyof LetterSections,
  replacement: string,
): string {
  const sections = parseLetterSections(content);
  return joinSections({ ...sections, [section]: replacement.trim() });
}

/** Normalize whatever the model returned into the Studio's paragraph shape. */
export function normalizeLetterText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
