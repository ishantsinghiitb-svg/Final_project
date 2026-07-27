import type { ResumeDocument, ResumeDocBlock } from "./compose";
import { renderResumeText } from "./compose";

// ── Optimized resume download (Module 6D; PDF fixed in the 6E pass) ──
//
// Format-agnostic by design. A renderer registry maps a format id to a concrete
// exporter, so a new format is one more registry entry. Shipping:
//   • pdf  — a REAL, downloadable .pdf built with jsPDF (dynamically imported).
//     The previous print-window approach relied on pop-ups and never produced a
//     file; this generates an actual PDF blob and downloads it directly.
//   • docx — a real .docx via the `docx` package (dynamically imported).
//   • txt  — a plain-text Blob download (no dependencies; not in the primary
//     menu but kept as a supported format).
// The heavy libraries load only when their format is actually used.

export type DownloadFormat = "pdf" | "docx" | "txt";

export type ResumeFormatOption = {
  id: DownloadFormat;
  label: string;
  hint: string;
};

/** The formats offered in the Download ▼ menu (PDF + DOCX per the 6E spec). */
export const RESUME_FORMATS: readonly ResumeFormatOption[] = [
  { id: "pdf", label: "PDF", hint: "Best for applications" },
  { id: "docx", label: "Word (DOCX)", hint: "Editable in Word" },
] as const;

function safeFileName(name: string): string {
  const base = name
    .replace(/[^\w\d\-. ]+/g, "")
    .trim()
    .replace(/\s+/g, "_");
  return base || "resume";
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

// ── PDF (jsPDF) ──────────────────────────────────────────────────────────────
async function buildPdfBlob(doc: ResumeDocument): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: "a4" });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 48;
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - margin) {
      pdf.addPage();
      y = margin;
    }
  };

  const writeLines = (
    text: string,
    opts: {
      size: number;
      style?: "normal" | "bold";
      color?: [number, number, number];
      gap: number;
    },
  ) => {
    pdf.setFont("helvetica", opts.style ?? "normal");
    pdf.setFontSize(opts.size);
    pdf.setTextColor(...(opts.color ?? [26, 26, 46]));
    const lines = pdf.splitTextToSize(text, maxWidth) as string[];
    const lineHeight = opts.size * 1.35;
    for (const line of lines) {
      ensureSpace(lineHeight);
      pdf.text(line, margin, y);
      y += lineHeight;
    }
    y += opts.gap;
  };

  if (doc.name) writeLines(doc.name, { size: 20, style: "bold", gap: 2 });
  for (const line of doc.contactLines) {
    writeLines(line, { size: 10, color: [90, 90, 100], gap: 1 });
  }
  y += 8;

  for (const block of doc.blocks) {
    ensureSpace(40);
    writeLines(block.heading.toUpperCase(), {
      size: 11,
      style: "bold",
      color: [37, 99, 235],
      gap: 2,
    });
    // Divider under the heading.
    ensureSpace(6);
    pdf.setDrawColor(225, 228, 232);
    pdf.line(margin, y - 4, pageWidth - margin, y - 4);
    y += 4;
    for (const rawLine of block.body.split("\n")) {
      const line = rawLine.trim();
      if (!line) continue;
      writeLines(line, { size: 10.5, gap: 2 });
    }
    y += 8;
  }

  return pdf.output("blob");
}

// ── DOCX (docx) ──────────────────────────────────────────────────────────────
async function buildDocxBlob(doc: ResumeDocument): Promise<Blob> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import("docx");

  const children: InstanceType<typeof Paragraph>[] = [];

  if (doc.name) {
    children.push(new Paragraph({ text: doc.name, heading: HeadingLevel.TITLE }));
  }
  for (const line of doc.contactLines) {
    children.push(
      new Paragraph({
        spacing: { after: 120 },
        children: [new TextRun({ text: line, size: 20, color: "555555" })],
      }),
    );
  }

  for (const block of doc.blocks) {
    children.push(
      new Paragraph({
        text: block.heading.toUpperCase(),
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 240, after: 100 },
      }),
    );
    for (const rawLine of block.body.split("\n")) {
      const line = rawLine.trim();
      if (!line) continue;
      children.push(new Paragraph({ text: line, spacing: { after: 60 } }));
    }
  }

  const wordDoc = new Document({ sections: [{ properties: {}, children }] });
  return Packer.toBlob(wordDoc);
}

/**
 * Reverse of `renderResumeText` — reconstructs a ResumeDocument from the stored
 * plain-text of a SAVED version, so a past version can be re-exported to PDF/
 * DOCX without keeping the original document model around. Deterministic
 * because it parses text this module itself produced (heading line followed by
 * a dashed underline).
 */
export function parseResumeText(content: string): ResumeDocument {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const isDivider = (s: string) => /^-{2,}$/.test(s.trim());

  let name: string | null = null;
  const contactLines: string[] = [];
  const blocks: ResumeDocBlock[] = [];
  let current: ResumeDocBlock | null = null;
  let sawHeading = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const next = lines[i + 1] ?? "";

    // A heading is a non-empty line immediately followed by a dashed underline.
    if (trimmed && isDivider(next)) {
      if (current) blocks.push(current);
      current = { heading: toTitleCase(trimmed), body: "" };
      sawHeading = true;
      i++; // consume the divider line
      continue;
    }
    if (isDivider(trimmed)) continue;

    if (!sawHeading) {
      // Header region: first non-empty line = name, the rest = contact lines.
      if (!trimmed) continue;
      if (name === null) name = trimmed;
      else contactLines.push(trimmed);
      continue;
    }

    if (current) {
      current.body += (current.body ? "\n" : "") + line;
    }
  }
  if (current) blocks.push(current);

  for (const b of blocks) b.body = b.body.replace(/\n{3,}/g, "\n\n").trim();

  return { name, contactLines, blocks };
}

function toTitleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Download the resume in the requested format. Async because PDF/DOCX generation
 * dynamically imports its library.
 */
export async function downloadResume(
  doc: ResumeDocument,
  name: string,
  format: DownloadFormat,
): Promise<void> {
  const fileBase = safeFileName(name);
  switch (format) {
    case "txt":
      triggerBlobDownload(
        new Blob([renderResumeText(doc)], { type: "text/plain;charset=utf-8" }),
        `${fileBase}.txt`,
      );
      return;
    case "pdf":
      triggerBlobDownload(await buildPdfBlob(doc), `${fileBase}.pdf`);
      return;
    case "docx":
      triggerBlobDownload(await buildDocxBlob(doc), `${fileBase}.docx`);
      return;
  }
}
