import type { StructuredResume } from "@/features/ai/schemas";
import type { OptimizationSuggestion } from "./types";

// ── Optimized resume composition (Module 6D, isomorphic) ──
//
// Turns the parsed resume + the ACCEPTED suggestions into a clean, ordered
// document model, then renders it. The document model is format-agnostic on
// purpose: the same `ResumeDocument` feeds the plain-text/PDF/DOCX downloads
// (see download.ts) — adding a format never touches this composition step.
//
// A suggestion is not only a text rewrite. Its `kind` determines HOW it is
// applied to the downloadable document (6E: the full kind set):
//   • rewrite/replace/merge/split/compress/expand/highlight/restructure —
//     replace the verbatim `current` span with `suggested`.
//   • remove — delete the verbatim `current` span, or (via `removeSection`)
//     drop a whole section entirely.
//   • add — append `suggested` into whichever EXISTING section it targets.
//     Never fabricates a brand-new section.
//   • move/reorder/promote/demote — move a whole section (promote = up,
//     demote = down; move/reorder honor `beforeSection`).
//   • rename — rename a section heading to `renameTo`.
// Every operation is a no-op (never throws, never fabricates) when its target
// text/section can't be located — the compose step never guesses, so an
// advisory-only suggestion still shows in the UI without corrupting the file.

export type ResumeDocBlock = {
  /** Section heading, e.g. "Summary", "Experience", "Skills". */
  heading: string;
  /** Body text (may contain multiple lines / bullets). */
  body: string;
};

export type ResumeDocument = {
  name: string | null;
  contactLines: string[];
  blocks: ResumeDocBlock[];
};

function collapse(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Replace `current` with `replacement` in `body`, tolerant of whitespace. */
function applyOne(body: string, current: string, replacement: string): string {
  const cur = current.trim();
  if (!cur) return body;
  if (body.includes(cur)) return body.replace(cur, replacement);

  // Fall back to a whitespace-collapsed line match.
  const target = collapse(cur);
  const lines = body.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (collapse(lines[i]) === target) {
      lines[i] = lines[i].replace(/\S.*\S|\S/, replacement);
      return lines.join("\n");
    }
  }

  // Multi-line spans: collapse the whole body and try a single replacement.
  if (collapse(body) === target) return replacement;
  return body;
}

/** Collapse blank-line artifacts left behind by a removal. */
function cleanupBody(body: string): string {
  return body
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .join("\n");
}

function findBlockIndexByHeading(blocks: ResumeDocBlock[], heading: string): number {
  const needle = heading.trim().toLowerCase();
  if (!needle) return -1;
  return blocks.findIndex(
    (b) => b.heading.toLowerCase().includes(needle) || needle.includes(b.heading.toLowerCase()),
  );
}

const SECTION_KEYWORDS: Partial<Record<OptimizationSuggestion["section"], string>> = {
  summary: "summary",
  skills: "skills",
  experience: "experience",
  projects: "project",
  education: "education",
};

/** Locate the existing block an `add` suggestion targets — by label first, then section keyword. Never creates a new block. */
function findTargetBlockIndex(blocks: ResumeDocBlock[], s: OptimizationSuggestion): number {
  if (s.target.trim()) {
    const idx = findBlockIndexByHeading(blocks, s.target);
    if (idx !== -1) return idx;
  }
  const keyword = SECTION_KEYWORDS[s.section];
  if (!keyword) return -1;
  return blocks.findIndex((b) => b.heading.toLowerCase().includes(keyword));
}

function buildBaseDocument(structured: StructuredResume): ResumeDocument {
  const c = structured.contact;
  const contactLines: string[] = [];
  const contactBits = [c.email, c.phone, c.location].filter(Boolean) as string[];
  if (contactBits.length) contactLines.push(contactBits.join("  |  "));
  const links = [c.linkedin, c.github, c.portfolio].filter(Boolean) as string[];
  if (links.length) contactLines.push(links.join("  |  "));

  const blocks: ResumeDocBlock[] = [];
  if (structured.summary?.trim()) {
    blocks.push({ heading: "Summary", body: structured.summary.trim() });
  }
  for (const sec of structured.sections) {
    const body = sec.content.trim();
    if (body) blocks.push({ heading: sec.heading.trim() || "Section", body });
  }
  if (structured.skills.length) {
    blocks.push({ heading: "Skills", body: structured.skills.join(", ") });
  }

  return { name: c.name, contactLines, blocks };
}

/** Content-edit kinds: all replace a verbatim `current` span with `suggested`. */
const REPLACE_KINDS = new Set<OptimizationSuggestion["kind"]>([
  "rewrite",
  "replace",
  "merge",
  "split",
  "compress",
  "expand",
  "highlight",
  "restructure",
]);

/** Section-move kinds. */
const MOVE_KINDS = new Set<OptimizationSuggestion["kind"]>([
  "move",
  "reorder",
  "promote",
  "demote",
]);

/**
 * Compose the optimized resume document from the parsed resume and the accepted
 * suggestions. Applied in ordered passes so kinds never interfere: whole-section
 * removal, then content edits, then additions, then renames, then section moves.
 */
export function composeOptimizedResume(
  structured: StructuredResume,
  accepted: OptimizationSuggestion[],
): ResumeDocument {
  const doc = buildBaseDocument(structured);

  // 1. Whole-section removals (changes the blocks array's length/indices).
  for (const s of accepted) {
    if (s.kind === "remove" && s.removeSection) {
      const idx = findBlockIndexByHeading(doc.blocks, s.removeSection);
      if (idx !== -1) doc.blocks.splice(idx, 1);
    }
  }

  // 2. Content edits: every replace-like kind + line-level remove.
  for (const s of accepted) {
    const isReplace = REPLACE_KINDS.has(s.kind);
    const isLineRemove = s.kind === "remove" && !s.removeSection;
    if (!isReplace && !isLineRemove) continue;
    const cur = s.current.trim();
    if (!cur) continue;
    const replacement = isLineRemove ? "" : s.suggested.trim();
    for (const block of doc.blocks) {
      const next = applyOne(block.body, cur, replacement);
      if (next !== block.body) {
        block.body = cleanupBody(next);
        break;
      }
    }
  }

  // 3. Additions — append into a matching EXISTING block only; never fabricate a new section.
  for (const s of accepted) {
    if (s.kind !== "add") continue;
    const suggested = s.suggested.trim();
    if (!suggested) continue;
    const idx = findTargetBlockIndex(doc.blocks, s);
    if (idx !== -1) {
      doc.blocks[idx] = {
        ...doc.blocks[idx],
        body: `${doc.blocks[idx].body.trim()}\n${suggested}`,
      };
    }
  }

  // 4. Renames — change a section heading in place.
  for (const s of accepted) {
    if (s.kind !== "rename") continue;
    const newHeading = (s.renameTo ?? s.suggested).trim();
    if (!newHeading) continue;
    const idx = findBlockIndexByHeading(doc.blocks, s.current || s.target);
    if (idx !== -1) doc.blocks[idx] = { ...doc.blocks[idx], heading: newHeading };
  }

  // 5. Section moves (move/reorder/promote/demote).
  for (const s of accepted) {
    if (!MOVE_KINDS.has(s.kind) || !s.moveSection) continue;
    const fromIdx = findBlockIndexByHeading(doc.blocks, s.moveSection);
    if (fromIdx === -1) continue;
    const [moved] = doc.blocks.splice(fromIdx, 1);

    if (s.beforeSection) {
      const toIdx = findBlockIndexByHeading(doc.blocks, s.beforeSection);
      doc.blocks.splice(toIdx === -1 ? doc.blocks.length : toIdx, 0, moved);
    } else if (s.kind === "demote") {
      doc.blocks.push(moved); // demote with no explicit anchor → move to the bottom
    } else {
      doc.blocks.unshift(moved); // move/reorder/promote with no anchor → move to the top
    }
  }

  return doc;
}

/** Render the document to clean plain text (the .txt download + version content). */
export function renderResumeText(doc: ResumeDocument): string {
  const parts: string[] = [];
  if (doc.name) parts.push(doc.name);
  if (doc.contactLines.length) parts.push(doc.contactLines.join("\n"));
  parts.push(""); // spacer under the header

  for (const block of doc.blocks) {
    parts.push(block.heading.toUpperCase());
    parts.push("-".repeat(Math.min(block.heading.length, 40)));
    parts.push(block.body);
    parts.push("");
  }
  return (
    parts
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trimEnd() + "\n"
  );
}
