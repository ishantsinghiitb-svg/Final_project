// ── Shared client-side file download helpers ──
//
// Promoted out of src/features/optimizer/download.ts and
// src/features/cover-letters/export.ts (Module 9B) — both independently
// defined an identical `triggerBlobDownload`/`safeFileName` pair; a third
// use (interview ICS export) made a shared module worth it.

/** Strips characters that are unsafe in a filename and collapses whitespace to underscores. */
export function safeFileName(name: string, fallback = "download"): string {
  const base = name
    .replace(/[^\w\d\-. ]+/g, "")
    .trim()
    .replace(/\s+/g, "_");
  return base || fallback;
}

/** Triggers a browser download of `blob` as `filename`, via a temporary object URL revoked shortly after. */
export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
