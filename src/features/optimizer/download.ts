import type { ResumeDocument } from "./compose";
import { renderResumeText } from "./compose";

// ── Optimized resume download (Module 6D, client-only) ──
//
// Format-agnostic by design. A renderer registry maps a format id to a concrete
// exporter, so DOCX can be added later as one more entry with zero changes to
// callers or to composition. Shipping now:
//   • txt — a plain-text Blob download (always available, no dependencies).
//   • pdf — the browser's own print-to-PDF over a styled print document.
// DOCX is declared but not yet available (needs a document library); the UI
// reads `available` and shows it as coming soon rather than hard-coding the
// list of buttons.

export type DownloadFormat = "pdf" | "txt" | "docx";

export type ResumeFormatOption = {
  id: DownloadFormat;
  label: string;
  hint: string;
  available: boolean;
};

export const RESUME_FORMATS: readonly ResumeFormatOption[] = [
  { id: "pdf", label: "PDF", hint: "Best for applications", available: true },
  { id: "txt", label: "Plain text", hint: "Universal, ATS-safe", available: true },
  { id: "docx", label: "Word (DOCX)", hint: "Coming soon", available: false },
] as const;

function safeFileName(name: string): string {
  const base = name
    .replace(/[^\w\d\-. ]+/g, "")
    .trim()
    .replace(/\s+/g, "_");
  return base || "resume";
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function triggerBlobDownload(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Render the document as a clean, print-ready HTML page. */
export function renderResumeHtml(doc: ResumeDocument, title: string): string {
  const header: string[] = [];
  if (doc.name) header.push(`<h1>${escapeHtml(doc.name)}</h1>`);
  if (doc.contactLines.length) {
    header.push(
      `<p class="contact">${doc.contactLines.map((l) => escapeHtml(l)).join("<br/>")}</p>`,
    );
  }

  const blocks = doc.blocks
    .map((b) => {
      const body = escapeHtml(b.body)
        .split("\n")
        .map((line) => line.trimEnd())
        .filter(Boolean)
        .map((line) => `<p>${line}</p>`)
        .join("");
      return `<section><h2>${escapeHtml(b.heading)}</h2>${body}</section>`;
    })
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1a1a2e;
         max-width: 720px; margin: 40px auto; padding: 0 24px; line-height: 1.5; }
  h1 { font-size: 24px; margin: 0 0 4px; }
  .contact { color: #555; font-size: 13px; margin: 0 0 20px; }
  section { margin: 0 0 18px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: #2563EB;
       border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; margin: 0 0 8px; }
  section p { margin: 0 0 6px; font-size: 13.5px; }
  @media print { body { margin: 0; } @page { margin: 18mm; } }
</style></head><body>${header.join("")}${blocks}</body></html>`;
}

function downloadPdf(doc: ResumeDocument, title: string): void {
  const html = renderResumeHtml(doc, title);
  const win = window.open("", "_blank", "noopener,noreferrer,width=820,height=1000");
  if (!win) {
    throw new Error(
      "Your browser blocked the print window. Allow pop-ups for this site, or download as plain text.",
    );
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  // Give the new document a tick to lay out before invoking print.
  win.setTimeout(() => {
    win.focus();
    win.print();
  }, 350);
}

/**
 * Download the optimized resume in the requested format. Throws a
 * human-readable error only for the pop-up-blocked PDF case so the caller can
 * surface it as a toast.
 */
export function downloadResume(doc: ResumeDocument, name: string, format: DownloadFormat): void {
  const fileBase = safeFileName(name);
  switch (format) {
    case "txt":
      triggerBlobDownload(renderResumeText(doc), `${fileBase}.txt`, "text/plain;charset=utf-8");
      return;
    case "pdf":
      downloadPdf(doc, name);
      return;
    case "docx":
      // Not yet available — the UI never offers this path. Fall back safely.
      triggerBlobDownload(renderResumeText(doc), `${fileBase}.txt`, "text/plain;charset=utf-8");
      return;
  }
}
