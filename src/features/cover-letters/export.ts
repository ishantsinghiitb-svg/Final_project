import {
  parseRichText,
  sanitizeHref,
  stripRichTextMarkup,
  type InlineSpan,
  type RichLine,
} from "./richText";

// ── Cover letter export (Module 6E) ──
//
// Mirrors the optimizer's format-registry approach (features/optimizer/download.ts)
// but renders PROSE, not resume blocks: a cover letter is paragraphs with
// generous leading, not headings with dividers.
//
// PDF and DOCX render the Studio's lightweight rich text (bold/italic/lists/
// links — see richText.ts) as real formatting. Plain text and clipboard strip
// the markup syntax to clean, readable text instead — an online application
// form has no use for a literal "**bold**".
//
// Shipping four export paths:
//   • copy — clipboard, no file (with a legacy execCommand fallback)
//   • pdf  — a real .pdf via jsPDF (dynamically imported)
//   • docx — a real .docx via the `docx` package (dynamically imported)
//   • txt  — a plain-text Blob, no dependencies
//
// The heavy libraries load only when their format is actually used.

export type CoverLetterExportFormat = "pdf" | "docx" | "txt";

export type ExportFormatOption = {
  id: CoverLetterExportFormat;
  label: string;
  hint: string;
};

export const COVER_LETTER_EXPORT_FORMATS: readonly ExportFormatOption[] = [
  { id: "pdf", label: "PDF", hint: "Best for applications" },
  { id: "docx", label: "Word (DOCX)", hint: "Editable in Word" },
  { id: "txt", label: "Plain text", hint: "For online forms" },
] as const;

function safeFileName(name: string): string {
  const base = name
    .replace(/[^\w\d\-. ]+/g, "")
    .trim()
    .replace(/\s+/g, "_");
  return base || "cover_letter";
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Copy the letter to the clipboard as clean text (markup syntax stripped) —
 * pasting "**Managed a team**" into an application form would look broken.
 * Returns false rather than throwing when the browser denies clipboard access,
 * so the caller can show a "select and copy" message instead of an error toast.
 */
export async function copyToClipboard(content: string): Promise<boolean> {
  const plain = stripRichTextMarkup(content);
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(plain);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }

  try {
    const area = document.createElement("textarea");
    area.value = plain;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

// ── PDF (jsPDF) ──────────────────────────────────────────────────────────────
//
// jsPDF wraps a single plain string per call — it has no notion of mixed
// bold/italic runs on one line. Mixed-style lines are rendered word by word
// instead: each word is measured and drawn with its own font style, wrapping
// manually to the next line when it would overflow the margin. Link words are
// drawn with `textWithLink` and underlined so they read as clickable.

type PdfDoc = {
  setFont: (family: string, style: string) => void;
  setFontSize: (size: number) => void;
  setTextColor: (r: number, g: number, b: number) => void;
  setDrawColor: (r: number, g: number, b: number) => void;
  getTextWidth: (text: string) => number;
  text: (text: string, x: number, y: number) => void;
  textWithLink: (text: string, x: number, y: number, opts: { url: string }) => void;
  line: (x1: number, y1: number, x2: number, y2: number) => void;
  addPage: () => void;
  internal: { pageSize: { getWidth: () => number; getHeight: () => number } };
  output: (type: "blob") => Blob;
};

type PdfWord = { text: string; bold?: boolean; italic?: boolean; href?: string };

function pdfFontStyle(word: PdfWord): string {
  if (word.bold && word.italic) return "bolditalic";
  if (word.bold) return "bold";
  if (word.italic) return "italic";
  return "normal";
}

function wordsOfSpans(spans: InlineSpan[]): PdfWord[] {
  const words: PdfWord[] = [];
  for (const span of spans) {
    for (const part of span.text.split(/\s+/)) {
      if (part) words.push({ text: part, bold: span.bold, italic: span.italic, href: span.href });
    }
  }
  return words;
}

async function buildPdfBlob(content: string): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: "a4" }) as unknown as PdfDoc;

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 64; // a letter reads better with wider margins than a resume
  const bodyWidth = pageWidth - margin * 2;
  const fontSize = 11;
  const lineHeight = fontSize * 1.6;
  const linkColor: [number, number, number] = [37, 99, 235];
  const textColor: [number, number, number] = [26, 26, 46];

  pdf.setFontSize(fontSize);
  pdf.setTextColor(...textColor);
  pdf.setFont("times", "normal");

  let y = margin;
  const ensureSpace = () => {
    if (y + lineHeight > pageHeight - margin) {
      pdf.addPage();
      y = margin;
    }
  };

  /** Draw one run of words starting at (x, y), wrapping within `x + width`. */
  const drawWords = (words: PdfWord[], x: number, width: number) => {
    let cursorX = x;
    ensureSpace();
    const spaceWidth = pdf.getTextWidth(" ");
    for (const word of words) {
      pdf.setFont("times", pdfFontStyle(word));
      const wordWidth = pdf.getTextWidth(word.text);
      if (cursorX > x && cursorX + wordWidth > x + width) {
        y += lineHeight;
        cursorX = x;
        ensureSpace();
      }
      if (word.href) {
        pdf.setTextColor(...linkColor);
        pdf.textWithLink(word.text, cursorX, y, { url: sanitizeHref(word.href) });
        pdf.setDrawColor(...linkColor);
        pdf.line(cursorX, y + 1.5, cursorX + wordWidth, y + 1.5);
        pdf.setTextColor(...textColor);
      } else {
        pdf.text(word.text, cursorX, y);
      }
      cursorX += wordWidth + spaceWidth;
    }
    y += lineHeight;
  };

  const renderLines = (lines: RichLine[]) => {
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (line.kind === "bullet" || line.kind === "number") {
        const kind = line.kind;
        while (i < lines.length && lines[i].kind === kind) {
          const current = lines[i];
          const glyph = current.kind === "number" ? `${current.index}.` : "•";
          ensureSpace();
          pdf.setFont("times", "normal");
          pdf.text(glyph, margin, y);
          const indent = pdf.getTextWidth("00. ") + 4;
          drawWords(wordsOfSpans(current.spans), margin + indent, bodyWidth - indent);
          i++;
        }
      } else {
        drawWords(wordsOfSpans(line.spans), margin, bodyWidth);
        i++;
      }
    }
  };

  for (const paragraph of parseRichText(content)) {
    renderLines(paragraph.lines);
    y += lineHeight * 0.6; // paragraph spacing
  }

  return pdf.output("blob");
}

// ── DOCX (docx) ──────────────────────────────────────────────────────────────
//
// Unlike jsPDF, `docx` paragraphs natively hold multiple styled runs and
// reflow automatically, so mixed bold/italic/link text needs no manual layout.
// List bullets/numbers are rendered as a literal "• " / "1. " run rather than
// Word's native auto-numbering, which would need a Document-level numbering
// config — a reasonable simplification for a lightweight editor.

async function buildDocxBlob(content: string): Promise<Blob> {
  const { Document, ExternalHyperlink, Packer, Paragraph, TextRun } = await import("docx");

  const runsOf = (spans: InlineSpan[]) =>
    spans.map((span) => {
      if (span.href) {
        return new ExternalHyperlink({
          link: sanitizeHref(span.href),
          children: [new TextRun({ text: span.text, size: 22, color: "2563EB", underline: {} })],
        });
      }
      return new TextRun({ text: span.text, size: 22, bold: span.bold, italics: span.italic });
    });

  const children: InstanceType<typeof Paragraph>[] = [];
  for (const para of parseRichText(content)) {
    const lines = para.lines;
    lines.forEach((line: RichLine, i) => {
      const prefix =
        line.kind === "bullet" ? "•  " : line.kind === "number" ? `${line.index}.  ` : "";
      const runs = runsOf(line.spans);
      children.push(
        new Paragraph({
          spacing: { after: i === lines.length - 1 ? 240 : 60, line: 300 },
          children: prefix ? [new TextRun({ text: prefix, size: 22 }), ...runs] : runs,
        }),
      );
    });
  }

  const doc = new Document({ sections: [{ properties: {}, children }] });
  return Packer.toBlob(doc);
}

/**
 * Download the letter in the requested format. Async because PDF/DOCX
 * generation dynamically imports its library.
 */
export async function downloadCoverLetter(
  content: string,
  name: string,
  format: CoverLetterExportFormat,
): Promise<void> {
  const fileBase = safeFileName(name);
  switch (format) {
    case "txt":
      triggerBlobDownload(
        new Blob([stripRichTextMarkup(content)], { type: "text/plain;charset=utf-8" }),
        `${fileBase}.txt`,
      );
      return;
    case "pdf":
      triggerBlobDownload(await buildPdfBlob(content), `${fileBase}.pdf`);
      return;
    case "docx":
      triggerBlobDownload(await buildDocxBlob(content), `${fileBase}.docx`);
      return;
  }
}
