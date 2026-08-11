// ── Module 10B.1: schema.org JobPosting (JSON-LD) extraction ──
//
// JSON-LD is the one genuinely cross-platform job format: a company careers
// page built on any ATS, or none, very often embeds a schema.org `JobPosting`
// because Google for Jobs requires it. That makes it the right generic
// fallback for the Company Career Pages adapter when a page is not one of the
// known ATS providers.
//
// Everything here is defensive: real-world JSON-LD is frequently
// `@graph`-wrapped, array-valued where the spec says scalar, HTML-in-string
// for `description`, and inconsistent about `hiringOrganization` being an
// object vs a bare string. Each reader returns null rather than throwing, so
// one malformed block never fails a whole crawl.

import { findElements, htmlToPlainText, collapseWhitespace, decodeHtmlEntities } from "./html";

export type JsonLdObject = Record<string, unknown>;

/**
 * Escapes RAW control characters (U+0000–U+001F) found INSIDE JSON string
 * literals — the JSON spec requires those to appear only as an escape
 * sequence (`\n`, `\t`, ``, …), and `JSON.parse` rejects a literal one
 * outright ("Bad control character in string literal"). This is the single
 * most common real-world JSON-LD defect: a description field pasted in with
 * an actual newline/tab instead of `\n`/`\t`.
 *
 * Purely mechanical and string-boundary-aware: it tracks quotes and existing
 * `\`-escapes to know when it is inside a string, and only ever touches a
 * raw control-character byte found there. Everything else — structure,
 * whitespace between tokens, already-escaped sequences, quotes, backslashes,
 * Unicode text — passes through byte-for-byte unchanged. It does not
 * validate or otherwise repair the JSON; a result that is still malformed
 * for any other reason simply fails the caller's `JSON.parse`, exactly as
 * before.
 */
export function escapeRawControlCharsInJsonStrings(text: string): string {
  let out = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (!inString) {
      if (ch === '"') inString = true;
      out += ch;
      continue;
    }

    if (escaped) {
      // The character right after a `\` — part of an existing escape
      // sequence (\n, \", \\, \uXXXX's "u", ...). Copy it verbatim; it is
      // never itself an unescaped control byte.
      out += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      out += ch;
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = false;
      out += ch;
      continue;
    }

    const code = text.charCodeAt(i);
    out +=
      code <= 0x1f ? (CONTROL_ESCAPES[code] ?? `\\u${code.toString(16).padStart(4, "0")}`) : ch;
  }

  return out;
}

const CONTROL_ESCAPES: Record<number, string> = {
  0x08: "\\b",
  0x09: "\\t",
  0x0a: "\\n",
  0x0c: "\\f",
  0x0d: "\\r",
};

/**
 * Parses every `<script type="application/ld+json">` block; unparseable
 * blocks are skipped. Tries a short, ordered list of safe repairs before
 * giving up on a block — HTML-decoding (some sites double-escape the JSON
 * payload) and/or control-character escaping (see
 * `escapeRawControlCharsInJsonStrings`) — but never guesses at or fabricates
 * content: the first candidate that `JSON.parse` itself accepts wins, and a
 * block that no candidate can parse is skipped exactly as it always was.
 */
export function extractJsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  // `findElements` strips <script> content, so scan the raw document here.
  const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  let match: RegExpExecArray | null;

  while ((match = scriptRe.exec(html)) !== null) {
    if (!/type\s*=\s*["']?application\/ld\+json/i.test(match[1])) continue;
    const raw = match[2].trim();
    if (!raw) continue;

    // Each candidate is computed lazily, only once the previous one has
    // failed to parse — the overwhelmingly common case (well-formed JSON)
    // never touches the repair functions at all.
    //
    // Control-character repair always runs AFTER HTML-decoding, never
    // instead of it: a description field is very often HTML-escaped
    // (`&lt;p&gt;`) as ordinary, correct content, and downstream
    // `readDescription` only recognizes literal `<p>`/`</p>` tags — decoding
    // is idempotent and harmless when there is nothing to decode, but
    // skipping it here would hand back a block that parses yet still has
    // its markup entity-escaped, which is silently wrong rather than merely
    // unparsed.
    try {
      blocks.push(JSON.parse(raw));
      continue;
    } catch {
      // fall through
    }
    try {
      blocks.push(JSON.parse(decodeHtmlEntities(raw)));
      continue;
    } catch {
      // fall through
    }
    try {
      blocks.push(JSON.parse(escapeRawControlCharsInJsonStrings(decodeHtmlEntities(raw))));
    } catch {
      // No safe repair parsed — skip the block, exactly as before.
    }
  }

  return blocks;
}

/** Flattens JSON-LD roots, arrays and `@graph` containers into a single list of objects. */
export function flattenJsonLd(value: unknown, depth = 0): JsonLdObject[] {
  if (depth > 6 || value === null || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap((entry) => flattenJsonLd(entry, depth + 1));

  const object = value as JsonLdObject;
  const results: JsonLdObject[] = [object];
  const graph = object["@graph"];
  if (graph) results.push(...flattenJsonLd(graph, depth + 1));
  return results;
}

function typesOf(node: JsonLdObject): string[] {
  const type = node["@type"];
  if (typeof type === "string") return [type.toLowerCase()];
  if (Array.isArray(type))
    return type.filter((t): t is string => typeof t === "string").map((t) => t.toLowerCase());
  return [];
}

/** Every `JobPosting` node in a document, in source order. */
export function findJobPostingNodes(html: string): JsonLdObject[] {
  return extractJsonLdBlocks(html)
    .flatMap((block) => flattenJsonLd(block))
    .filter((node) => typesOf(node).includes("jobposting"));
}

/** The first `JobPosting` node, or null when the page has none. */
export function findJobPostingNode(html: string): JsonLdObject | null {
  return findJobPostingNodes(html)[0] ?? null;
}

// ── Field readers ──

/** First non-empty string, unwrapping arrays and `{ "@value": … }` wrappers. */
export function readString(value: unknown): string | null {
  if (typeof value === "string") return collapseWhitespace(value) || null;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = readString(entry);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === "object") {
    const record = value as JsonLdObject;
    return readString(record["@value"] ?? record.name ?? record.value);
  }
  return null;
}

export function readNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(/[, ]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = readNumber(entry);
      if (found !== null) return found;
    }
  }
  if (value && typeof value === "object") {
    const record = value as JsonLdObject;
    return readNumber(record["@value"] ?? record.value);
  }
  return null;
}

/** All strings in a scalar-or-array field (e.g. `skills`, `employmentType`). */
export function readStringList(value: unknown): string[] {
  if (value == null) return [];
  const raw = Array.isArray(value) ? value : [value];
  const out: string[] = [];
  for (const entry of raw) {
    const text = readString(entry);
    if (text) out.push(text);
  }
  return out;
}

/** ISO-8601 date normalization; invalid/absent input → null. */
export function readDate(value: unknown): string | null {
  const raw = readString(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export type JsonLdLocation = {
  location: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
};

/** Reads `jobLocation` (possibly an array) into flat city/state/country + a display string. */
export function readJobLocation(node: JsonLdObject): JsonLdLocation {
  const raw = node.jobLocation;
  const candidates = Array.isArray(raw) ? raw : [raw];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const place = candidate as JsonLdObject;
    const address = place.address;
    if (!address) continue;

    if (typeof address === "string") {
      return {
        location: collapseWhitespace(address) || null,
        city: null,
        state: null,
        country: null,
      };
    }
    const record = address as JsonLdObject;
    const city = readString(record.addressLocality);
    const state = readString(record.addressRegion);
    const country = readString(record.addressCountry);
    const location = [city, state, country].filter(Boolean).join(", ") || null;
    return { location, city, state, country };
  }

  const applicantLocation = readString(node.applicantLocationRequirements);
  return { location: applicantLocation, city: null, state: null, country: null };
}

export type JsonLdSalary = {
  min: number | null;
  max: number | null;
  currency: string | null;
  period: string | null;
};

const UNIT_TO_PERIOD: Record<string, string> = {
  hour: "Hourly",
  day: "Daily",
  week: "Weekly",
  month: "Monthly",
  year: "Yearly",
};

/** Reads `baseSalary` → `MonetaryAmount`/`QuantitativeValue` into min/max/currency/period. */
export function readBaseSalary(node: JsonLdObject): JsonLdSalary {
  const empty: JsonLdSalary = { min: null, max: null, currency: null, period: null };
  const base = node.baseSalary ?? node.estimatedSalary;
  if (!base || typeof base !== "object") return empty;

  const monetary = (Array.isArray(base) ? base[0] : base) as JsonLdObject;
  if (!monetary || typeof monetary !== "object") return empty;

  const currency = readString(monetary.currency) ?? readString(monetary.salaryCurrency);
  const rawValue = monetary.value;
  if (rawValue == null) return { ...empty, currency };

  if (typeof rawValue === "number" || typeof rawValue === "string") {
    const single = readNumber(rawValue);
    return { min: single, max: single, currency, period: null };
  }

  const value = (Array.isArray(rawValue) ? rawValue[0] : rawValue) as JsonLdObject;
  if (!value || typeof value !== "object") return { ...empty, currency };

  const min = readNumber(value.minValue);
  const max = readNumber(value.maxValue);
  const exact = readNumber(value.value);
  const unit = readString(value.unitText)?.toLowerCase() ?? null;

  return {
    min: min ?? exact,
    max: max ?? exact,
    currency: currency ?? readString(value.currency),
    period: unit ? (UNIT_TO_PERIOD[unit] ?? null) : null,
  };
}

/** `hiringOrganization` name, whether it's an object or a bare string. */
export function readHiringOrganization(node: JsonLdObject): {
  name: string | null;
  url: string | null;
  logo: string | null;
} {
  const org = node.hiringOrganization;
  if (typeof org === "string")
    return { name: collapseWhitespace(org) || null, url: null, logo: null };
  if (!org || typeof org !== "object") return { name: null, url: null, logo: null };

  const record = (Array.isArray(org) ? org[0] : org) as JsonLdObject;
  if (!record || typeof record !== "object") return { name: null, url: null, logo: null };

  const logoValue = record.logo;
  const logo =
    typeof logoValue === "string"
      ? collapseWhitespace(logoValue)
      : readString((logoValue as JsonLdObject | undefined)?.url);

  return {
    name: readString(record.name),
    url: readString(record.sameAs) ?? readString(record.url),
    logo: logo || null,
  };
}

/** `description` as clean plain text — JobPosting descriptions are almost always HTML strings. */
export function readDescription(node: JsonLdObject): string | null {
  const raw = readString(node.description);
  if (!raw) return null;
  const text = htmlToPlainText(raw);
  return text || null;
}
