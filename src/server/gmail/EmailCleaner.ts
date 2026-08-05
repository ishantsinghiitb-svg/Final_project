// ── Email body cleaning (Module 9A) ──
//
// Recruiting mail is mostly not the message: a four-line invitation arrives
// wrapped in a signature block, a legal disclaimer, an unsubscribe footer and
// (on a reply) the entire quoted history. Rendering that verbatim in the
// Review panel would be worse than the Gmail link it's meant to replace, so
// this trims to the part a human actually reads.
//
// Everything here is conservative in one direction on purpose: it will leave
// noise in before it cuts real content out. A stray footer line is a cosmetic
// miss; silently truncating the sentence that carries the interview time is a
// correctness failure, and the user would have no way to know it happened.
//
// Output is plain text only. The panel renders it as text rather than HTML,
// so nothing a sender writes can inject markup into the dashboard — which is
// also why links are returned as structured data instead of anchor tags.

/** Lines at/after these markers are quoted history, not this message. */
const QUOTED_REPLY_MARKERS = [
  /^\s*On .{10,80}\bwrote:\s*$/i,
  /^\s*-{2,}\s*Original Message\s*-{2,}\s*$/i,
  /^\s*_{5,}\s*$/,
  /^\s*From:\s.+@.+$/i,
  /^\s*>{1,}\s?/,
];

/** Lines at/after these markers are a signature or footer. */
const SIGNATURE_MARKERS = [
  /^\s*--\s*$/,
  /^\s*-{2,}\s*$/,
  /^\s*Sent from my \w+/i,
  /^\s*Get Outlook for \w+/i,
];

/** Boilerplate blocks — matched anywhere, and everything after them dropped. */
const FOOTER_MARKERS = [
  /\bunsubscribe\b/i,
  /\bmanage (?:your )?(?:email )?preferences\b/i,
  /\bview (?:this email )?in (?:your )?browser\b/i,
  /\bthis (?:e-?mail|message) (?:and any attachments )?(?:is|are) confidential\b/i,
  /\bconfidentiality notice\b/i,
  /\bdisclaimer\s*:/i,
  /\bif you (?:no longer wish|do not wish) to receive\b/i,
  /\bplease do not reply to this (?:e-?mail|message)\b/i,
  /\ball rights reserved\b/i,
  /©\s*\d{4}/,
];

/** Individual lines dropped wherever they appear (address/social chrome). */
const NOISE_LINE_PATTERNS = [
  /^\s*(?:facebook|twitter|linkedin|instagram|youtube)\s*$/i,
  /^\s*\[?(?:image|logo|cid):[^\]]*\]?\s*$/i,
  /^\s*\|\s*$/,
];

const URL_PATTERN = /https?:\/\/[^\s<>()[\]"']+/g;

export type CleanedEmail = {
  text: string;
  links: { label: string; url: string }[];
};

/** A human label for a URL, so the panel can show "Reschedule" not a 200-char tracking link. */
function labelForUrl(url: string): string {
  const lower = url.toLowerCase();
  if (/zoom\.us/.test(lower)) return "Zoom meeting";
  if (/meet\.google\.com/.test(lower)) return "Google Meet";
  if (/teams\.(?:microsoft|live)\.com/.test(lower)) return "Microsoft Teams";
  if (/webex\.com/.test(lower)) return "Webex";
  if (/calendly\.com|savvycal\.com|cal\.com/.test(lower)) return "Scheduling link";
  if (/forms\.gle|docs\.google\.com\/forms/.test(lower)) return "Google Form";
  if (/hackerrank\.com/.test(lower)) return "HackerRank";
  if (/codility\.com/.test(lower)) return "Codility";
  if (/hackerearth\.com/.test(lower)) return "HackerEarth";
  if (/codesignal\.com/.test(lower)) return "CodeSignal";
  if (/mettl\.com/.test(lower)) return "Mercer | Mettl";
  if (/testgorilla\.com/.test(lower)) return "TestGorilla";
  if (/hirevue\.com/.test(lower)) return "HireVue";
  if (/greenhouse\.io|lever\.co|ashbyhq\.com|workday/.test(lower)) return "Application portal";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Link";
  }
}

function isQuotedStart(line: string): boolean {
  return QUOTED_REPLY_MARKERS.some((p) => p.test(line));
}

function isSignatureStart(line: string): boolean {
  return SIGNATURE_MARKERS.some((p) => p.test(line));
}

function isFooterStart(line: string): boolean {
  return FOOTER_MARKERS.some((p) => p.test(line));
}

/**
 * Trims quoted history, signatures and boilerplate footers, collapses
 * runaway blank lines, and pulls out the links worth surfacing as buttons.
 */
export function cleanEmailBody(raw: string): CleanedEmail {
  const normalized = (raw ?? "").replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ");
  const lines = normalized.split("\n");

  const kept: string[] = [];
  for (const line of lines) {
    if (isQuotedStart(line) || isFooterStart(line)) break;
    // A signature dash only ends the message if there's already real content
    // above it — some senders open with a rule.
    if (isSignatureStart(line) && kept.some((l) => l.trim().length > 0)) break;
    if (NOISE_LINE_PATTERNS.some((p) => p.test(line))) continue;
    kept.push(line.replace(/[ \t]+$/g, ""));
  }

  // Collect links from the KEPT text only, so unsubscribe/tracking URLs in
  // the stripped footer never surface as suggested actions.
  const keptText = kept.join("\n");
  const links: { label: string; url: string }[] = [];
  const seen = new Set<string>();
  for (const match of keptText.matchAll(URL_PATTERN)) {
    const url = match[0].replace(/[.,;:)\]]+$/, "");
    if (seen.has(url)) continue;
    seen.add(url);
    links.push({ label: labelForUrl(url), url });
    if (links.length >= 8) break;
  }

  const text = keptText
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    // If stripping removed everything (a purely-HTML mail that reduced to
    // chrome), fall back to the original rather than showing a blank panel.
    .slice(0, 20_000);

  return { text: text.length > 0 ? text : normalized.trim().slice(0, 20_000), links };
}

// Line highlighting is a presentation concern and lives client-side in
// src/features/gmail/preview.ts — this module stays import-protected
// server-only code (it's reachable only through the fetch server function).
