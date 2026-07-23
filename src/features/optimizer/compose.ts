import type { StructuredResume } from "@/features/ai/schemas";
import type { OptimizationSuggestion } from "./types";

// ── Optimized resume composition (Module 6D, isomorphic) ──
//
// Turns the parsed resume + the ACCEPTED suggestions into a clean, ordered
// document model, then renders it. The document model is format-agnostic on
// purpose: the same `ResumeDocument` feeds the plain-text download today and a
// DOCX renderer later (see download.ts) — adding a format never touches this
// composition step.
//
// Applying a suggestion = replacing its verbatim `current` text with
// `suggested`. The model is instructed to quote `current` exactly; matching
// falls back to a whitespace-tolerant line match, and if a span still can't be
// located the block is left unchanged (never fabricated).

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

/** Replace `current` with `suggested` in `body`, tolerant of whitespace. */
function applyOne(body: string, current: string, suggested: string): string {
  const cur = current.trim();
  if (!cur) return body;
  if (body.includes(cur)) return body.replace(cur, suggested.trim());

  // Fall back to a whitespace-collapsed line match.
  const target = collapse(cur);
  const lines = body.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (collapse(lines[i]) === target) {
      lines[i] = lines[i].replace(/\S.*\S|\S/, suggested.trim());
      return lines.join("\n");
    }
  }

  // Multi-line spans: collapse the whole body and try a single replacement.
  if (collapse(body).includes(target)) {
    const idx = collapse(body).indexOf(target);
    // Best-effort: if the whole body collapses to the target, replace wholesale.
    if (idx === 0 && collapse(body) === target) return suggested.trim();
  }
  return body;
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

/**
 * Compose the optimized resume document from the parsed resume and the accepted
 * suggestions. Suggestions are applied in order; each edits whichever block
 * contains its `current` text.
 */
export function composeOptimizedResume(
  structured: StructuredResume,
  accepted: OptimizationSuggestion[],
): ResumeDocument {
  const doc = buildBaseDocument(structured);
  for (const s of accepted) {
    if (!s.current.trim() || !s.suggested.trim()) continue;
    for (const block of doc.blocks) {
      const next = applyOne(block.body, s.current, s.suggested);
      if (next !== block.body) {
        block.body = next;
        break;
      }
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
