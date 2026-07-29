// ── Lightweight rich text (shared) ──
//
// Deliberately NOT a WYSIWYG editor and NOT stored as HTML. Callers keep a
// plain text column as the single source of truth — with a tiny, fully
// controlled markdown-like syntax layered on top for exactly five constructs:
// **bold**, *italic*/_italic_, "- " bullet lines, "1. " numbered lines, and
// [label](url) links. Nothing else is recognized.
//
// This module is the one place that understands that syntax:
//   • parseRichText   — text → structured lines/spans (used by Preview + export)
//   • renderRichTextHtml — structured lines → sanitized HTML (Preview pane only)
//   • stripRichTextMarkup — structured lines → clean plain text (stats, .txt, clipboard)
//   • toggleBold/Italic/BulletList/NumberedList/insertLink — textarea-selection
//     transforms used by the toolbar; pure functions so they're easy to reason
//     about and don't need a DOM to be tested.
//
// Originally built for Cover Letter Studio (Module 6E), relocated here so
// other features (e.g. Interview notes) can reuse it without depending on
// the cover-letters feature folder.

export type InlineSpan = { text: string; bold?: boolean; italic?: boolean; href?: string };

export type RichLine =
  | { kind: "text"; spans: InlineSpan[] }
  | { kind: "bullet"; spans: InlineSpan[] }
  | { kind: "number"; index: number; spans: InlineSpan[] };

export type RichParagraph = { lines: RichLine[] };

const BULLET_RE = /^[-*]\s+(.+)$/;
const NUMBER_RE = /^(\d+)[.)]\s+(.+)$/;
const INLINE_RE = /\*\*(.+?)\*\*|\*(.+?)\*|_(.+?)_|\[([^\]]+)\]\(([^)]+)\)/g;

function splitParagraphs(content: string): string[] {
  return content
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function parseInline(text: string): InlineSpan[] {
  const spans: InlineSpan[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(INLINE_RE)) {
    const idx = match.index ?? 0;
    if (idx > lastIndex) spans.push({ text: text.slice(lastIndex, idx) });
    if (match[1] !== undefined) spans.push({ text: match[1], bold: true });
    else if (match[2] !== undefined) spans.push({ text: match[2], italic: true });
    else if (match[3] !== undefined) spans.push({ text: match[3], italic: true });
    else if (match[4] !== undefined) spans.push({ text: match[4], href: match[5] });
    lastIndex = idx + match[0].length;
  }
  if (lastIndex < text.length) spans.push({ text: text.slice(lastIndex) });
  return spans.length ? spans : [{ text }];
}

function classifyLine(line: string): RichLine {
  const trimmed = line.trimStart();
  const bulletMatch = trimmed.match(BULLET_RE);
  if (bulletMatch) return { kind: "bullet", spans: parseInline(bulletMatch[1]) };
  const numberMatch = trimmed.match(NUMBER_RE);
  if (numberMatch) {
    return { kind: "number", index: Number(numberMatch[1]), spans: parseInline(numberMatch[2]) };
  }
  return { kind: "text", spans: parseInline(line) };
}

/** Parse text into paragraphs of classified lines — the shared model for Preview and export. */
export function parseRichText(content: string): RichParagraph[] {
  return splitParagraphs(content).map((paragraph) => ({
    lines: paragraph.split("\n").map(classifyLine),
  }));
}

// ── HTML rendering (Preview pane only — never stored) ──────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Only http(s)/mailto links render as live links; a bare "example.com" is
 * treated as https. Anything else (javascript:, data:, …) is neutralized —
 * this is built from user-typed text, so a link href is untrusted input.
 * Exported so PDF/DOCX export reuses the same guard for their hyperlinks.
 */
export function sanitizeHref(href: string): string {
  const trimmed = href.trim();
  if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed;
  if (/^[\w.-]+\.[a-z]{2,}(\/[^\s]*)?$/i.test(trimmed)) return `https://${trimmed}`;
  return "#";
}

function renderSpanHtml(span: InlineSpan): string {
  const inner = escapeHtml(span.text);
  if (span.href) {
    return `<a href="${escapeHtml(sanitizeHref(span.href))}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
  }
  if (span.bold) return `<strong>${inner}</strong>`;
  if (span.italic) return `<em>${inner}</em>`;
  return inner;
}

function renderParagraphHtml(lines: RichLine[]): string {
  const chunks: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.kind === "bullet" || line.kind === "number") {
      const tag = line.kind === "bullet" ? "ul" : "ol";
      const items: string[] = [];
      while (i < lines.length && lines[i].kind === line.kind) {
        items.push(`<li>${lines[i].spans.map(renderSpanHtml).join("")}</li>`);
        i++;
      }
      chunks.push(`<${tag}>${items.join("")}</${tag}>`);
    } else {
      const textLines: string[] = [];
      while (i < lines.length && lines[i].kind === "text") {
        textLines.push(lines[i].spans.map(renderSpanHtml).join(""));
        i++;
      }
      chunks.push(`<p>${textLines.join("<br>")}</p>`);
    }
  }
  return chunks.join("");
}

/** Sanitized HTML for a Preview pane. Never sent to the AI or stored. */
export function renderRichTextHtml(content: string): string {
  return parseRichText(content)
    .map((para) => renderParagraphHtml(para.lines))
    .join("");
}

// ── Plain-text stripping (stats, plain-text export, clipboard) ─────────────

/** Clean, readable text with markup syntax removed — bullets become "•", links become "text (url)". */
export function stripRichTextMarkup(content: string): string {
  return parseRichText(content)
    .map((para) =>
      para.lines
        .map((line) => {
          const text = line.spans.map((s) => (s.href ? `${s.text} (${s.href})` : s.text)).join("");
          if (line.kind === "bullet") return `• ${text}`;
          if (line.kind === "number") return `${line.index}. ${text}`;
          return text;
        })
        .join("\n"),
    )
    .join("\n\n");
}

// ── Textarea selection transforms (toolbar) ─────────────────────────────────

export type TextareaSelection = { value: string; start: number; end: number };

function wrapSelection(sel: TextareaSelection, marker: string): TextareaSelection {
  const { value, start, end } = sel;
  const selected = value.slice(start, end);
  const before = value.slice(Math.max(0, start - marker.length), start);
  const after = value.slice(end, end + marker.length);

  // Toggle off if the selection is already wrapped in this exact marker.
  if (selected && before === marker && after === marker) {
    const next =
      value.slice(0, start - marker.length) + selected + value.slice(end + marker.length);
    return { value: next, start: start - marker.length, end: end - marker.length };
  }

  const insertText = selected || "text";
  const next = value.slice(0, start) + marker + insertText + marker + value.slice(end);
  const newStart = start + marker.length;
  return { value: next, start: newStart, end: newStart + insertText.length };
}

export function toggleBold(sel: TextareaSelection): TextareaSelection {
  return wrapSelection(sel, "**");
}

export function toggleItalic(sel: TextareaSelection): TextareaSelection {
  return wrapSelection(sel, "*");
}

function lineBlockRange(
  value: string,
  start: number,
  end: number,
): { lineStart: number; lineEnd: number } {
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const nextBreak = value.indexOf("\n", end);
  const lineEnd = nextBreak === -1 ? value.length : nextBreak;
  return { lineStart, lineEnd };
}

function toggleListPrefix(
  sel: TextareaSelection,
  makePrefix: (i: number) => string,
  stripRe: RegExp,
): TextareaSelection {
  const { value, start, end } = sel;
  const { lineStart, lineEnd } = lineBlockRange(value, start, end);
  const block = value.slice(lineStart, lineEnd);
  const lines = block.split("\n");
  const contentLines = lines.filter((l) => l.trim());
  const alreadyListed = contentLines.length > 0 && contentLines.every((l) => stripRe.test(l));

  let n = 0;
  const nextLines = lines.map((l) => {
    if (!l.trim()) return l;
    if (alreadyListed) return l.replace(stripRe, "");
    const prefixed = makePrefix(n) + l.replace(stripRe, "");
    n += 1;
    return prefixed;
  });

  const nextBlock = nextLines.join("\n");
  const next = value.slice(0, lineStart) + nextBlock + value.slice(lineEnd);
  const delta = nextBlock.length - block.length;
  return { value: next, start: Math.max(lineStart, start), end: end + delta };
}

export function toggleBulletList(sel: TextareaSelection): TextareaSelection {
  return toggleListPrefix(sel, () => "- ", /^[-*]\s+/);
}

export function toggleNumberedList(sel: TextareaSelection): TextareaSelection {
  return toggleListPrefix(sel, (i) => `${i + 1}. `, /^\d+[.)]\s+/);
}

/** Wrap the selection (or insert placeholder text) as a `[label](url)` link. */
export function insertLink(sel: TextareaSelection, url: string): TextareaSelection {
  const { value, start, end } = sel;
  const label = value.slice(start, end) || "link text";
  const insertText = `[${label}](${url})`;
  const next = value.slice(0, start) + insertText + value.slice(end);
  const labelStart = start + 1; // past "["
  return { value: next, start: labelStart, end: labelStart + label.length };
}

export type RichTextCommand = "bold" | "italic" | "bullet" | "number" | "link";

/** Apply a toolbar command to a textarea selection — shared by the toolbar and the editor. */
export function applyRichTextCommand(
  command: RichTextCommand,
  sel: TextareaSelection,
  linkUrl?: string,
): TextareaSelection {
  switch (command) {
    case "bold":
      return toggleBold(sel);
    case "italic":
      return toggleItalic(sel);
    case "bullet":
      return toggleBulletList(sel);
    case "number":
      return toggleNumberedList(sel);
    case "link":
      return insertLink(sel, linkUrl ?? "");
  }
}
