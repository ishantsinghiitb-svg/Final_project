// ── Email preview presentation (Module 9A) ──
//
// Client-side counterpart to src/server/gmail/EmailCleaner.ts. The server
// strips the email down to what a human reads; this decides what to
// emphasise inside it, and how to describe attachments. Both are needed for
// "the user should never have to open Gmail" — a wall of undifferentiated
// text technically contains the interview time but doesn't communicate it.
//
// Lives here rather than in src/server/** because client code can't import
// from that import-protected path.

const HIGHLIGHT_PATTERNS = [
  /\b(?:interview|meeting|call)\s+(?:is|will be|has been)?\s*(?:scheduled|set|arranged|confirmed)\b/i,
  /\b(?:on|at)\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}\b/i,
  /\b\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)\b/,
  /\b(?:deadline|due|expires?|complete (?:it |this )?(?:by|before)|last date|valid (?:till|until))\b/i,
  /\b(?:please (?:confirm|respond|reply|complete|submit)|action required|next steps?)\b/i,
  /\b(?:CTC|stipend|salary|compensation|package)\b/i,
  /\b(?:offer|congratulations|pleased to inform|selected)\b/i,
];

/** True when a line carries decision-relevant information worth emphasising. */
export function isHighlightLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 3 || trimmed.length > 300) return false;
  return HIGHLIGHT_PATTERNS.some((p) => p.test(trimmed));
}

// ── Attachment presentation ──

export type AttachmentKind =
  | "resume"
  | "offer_letter"
  | "assignment"
  | "job_description"
  | "calendar_invite"
  | "portfolio"
  | "pdf"
  | "other";

const KIND_LABEL: Record<AttachmentKind, string> = {
  resume: "Resume",
  offer_letter: "Offer Letter",
  assignment: "Assignment",
  job_description: "Job Description",
  calendar_invite: "Calendar Invite",
  portfolio: "Portfolio",
  pdf: "Document",
  other: "File",
};

/** Classifies an attachment by filename/MIME, for the badge next to it. */
export function attachmentKind(filename: string, mimeType: string): AttachmentKind {
  const name = filename.toLowerCase();
  if (name.endsWith(".ics") || mimeType === "text/calendar") return "calendar_invite";
  if (/\b(?:resume|cv)\b/.test(name)) return "resume";
  if (/portfolio/.test(name)) return "portfolio";
  if (/\b(?:offer|loi)\b/.test(name)) return "offer_letter";
  if (/\b(?:assignment|task|challenge|problem|case)\b/.test(name)) return "assignment";
  if (/\b(?:jd|job[-_ ]?description)\b/.test(name)) return "job_description";
  if (mimeType === "application/pdf") return "pdf";
  return "other";
}

export function attachmentKindLabel(kind: AttachmentKind): string {
  return KIND_LABEL[kind];
}

/** "312 KB" / "1.4 MB" — attachment sizes come from Gmail in bytes. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
