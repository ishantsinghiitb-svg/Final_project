// ── Small email-header parsing helpers (Module 9A) ──
// Shared by RelevanceFilter, EmailClassifier, ApplicationMatcher, and
// GmailSyncService — all of them need to turn a raw `From` header into an
// address/domain/display-name triple.

export type ParsedFromHeader = { address: string; domain: string; displayName: string | null };

/** Parses a `From` header value: `"Name" <addr@domain>`, `Name <addr@domain>`, or a bare `addr@domain`. */
export function parseFromHeader(value: string): ParsedFromHeader {
  const trimmed = value.trim();
  const angleMatch = trimmed.match(/<([^<>]+)>/);
  const address = (angleMatch ? angleMatch[1] : trimmed).trim().toLowerCase();
  const displayNameRaw = angleMatch ? trimmed.slice(0, angleMatch.index).trim() : "";
  const displayName = displayNameRaw.replace(/^"|"$/g, "").trim() || null;
  const domain = address.split("@")[1] ?? "";
  return { address, domain, displayName };
}
