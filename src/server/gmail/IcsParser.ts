// ── Minimal ICS (RFC 5545) parser (Module 9B) ──
//
// Hand-rolled, not a dependency — same "no new package for a narrow parsing
// need" philosophy as the rest of src/server/gmail/**. Parses a downloaded
// .ics attachment's VEVENT block for exactly the fields Module 9B needs:
//   - UID: the strongest merge key against a calendar_events row's own
//     `ical_uid` (the same UID appears in both the invitation email's .ics
//     and the calendar event itself) — this is this parser's real purpose.
//   - DTSTART/DTEND/LOCATION/ORGANIZER/STATUS/SEQUENCE: a free accuracy
//     improvement to 9A's existing prose-based date extraction when present,
//     not the primary reason this file exists.
//
// This is a DIFFERENT, harder problem than EmailClassifier.ts's existing
// `parseIcsDtStart` (which only regexes a single DTSTART line out of raw
// text) — a full VEVENT block has folded lines (RFC 5545 §3.1: a line may
// continue onto the next physical line if that line starts with a space or
// tab) and escaped text values, both handled below.
//
// DTSTART/DTEND with a trailing "Z" are unambiguous UTC instants. A floating
// (no "Z", no TZID) value is treated as UTC — a documented best-effort
// simplification, same posture as EmailClassifier's own date extraction:
// nothing here is ever the sole source of truth for a suggestion's time
// (the Calendar API event, when one exists, always wins — see
// CalendarClassifier.parseCalendarEventStart). A DTSTART with a TZID param
// (a real named zone, not UTC) is intentionally left unparsed (returns
// null) rather than silently mis-converting it — no IANA timezone database
// is available in this runtime to do that conversion correctly.

export type ParsedIcs = {
  uid: string | null;
  dtStartIso: string | null;
  dtEndIso: string | null;
  location: string | null;
  organizerEmail: string | null;
  /** 'CONFIRMED' | 'CANCELLED' | 'TENTATIVE', uppercased as ICS specifies. */
  status: string | null;
  sequence: number | null;
};

/** RFC 5545 §3.1 line unfolding: a continuation line starts with a space/tab and is joined to the previous line (with that one leading character removed). */
function unfoldLines(text: string): string[] {
  const rawLines = text.split(/\r\n|\n|\r/);
  const lines: string[] = [];
  for (const line of rawLines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

function unescapeText(value: string): string {
  return value
    .replace(/\\n/gi, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

type PropertyLine = { name: string; params: Record<string, string>; value: string };

function parsePropertyLine(line: string): PropertyLine | null {
  const colonIdx = line.indexOf(":");
  if (colonIdx === -1) return null;
  const left = line.slice(0, colonIdx);
  const value = line.slice(colonIdx + 1);
  const [name, ...paramParts] = left.split(";");
  const params: Record<string, string> = {};
  for (const part of paramParts) {
    const eq = part.indexOf("=");
    if (eq !== -1) params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1);
  }
  return { name: name.toUpperCase().trim(), params, value };
}

const DATE_PATTERN = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/;

/** Returns null for a TZID-qualified non-UTC value (see the file header — deliberately not converted) or a malformed date. */
function parseIcsDate(raw: string, params: Record<string, string>): string | null {
  const match = raw.match(DATE_PATTERN);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, zSuffix] = match;

  if (hour === undefined) {
    // VALUE=DATE (all-day) — no time component, anchor to midnight UTC.
    return new Date(`${year}-${month}-${day}T00:00:00Z`).toISOString();
  }
  if (params.TZID && !zSuffix) {
    // A real named zone we can't correctly convert without an IANA
    // database — left unparsed rather than silently treated as UTC.
    return null;
  }
  const iso = `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function extractOrganizerEmail(value: string): string | null {
  // ORGANIZER's value is typically "mailto:someone@company.com".
  const match = value.match(/mailto:([^\s;]+)/i);
  return (match ? match[1] : value.includes("@") ? value : null)?.toLowerCase().trim() ?? null;
}

/** Parses the first VEVENT block found in raw ICS text. Returns all-null fields if no VEVENT is present or the text is malformed — never throws, since a malformed attachment must never abort the whole sync run. */
export function parseIcs(rawText: string): ParsedIcs {
  const result: ParsedIcs = {
    uid: null,
    dtStartIso: null,
    dtEndIso: null,
    location: null,
    organizerEmail: null,
    status: null,
    sequence: null,
  };

  let inEvent = false;
  for (const line of unfoldLines(rawText)) {
    const trimmed = line.trim();
    if (trimmed === "BEGIN:VEVENT") {
      inEvent = true;
      continue;
    }
    if (trimmed === "END:VEVENT") break;
    if (!inEvent) continue;

    const prop = parsePropertyLine(trimmed);
    if (!prop) continue;

    switch (prop.name) {
      case "UID":
        result.uid = prop.value.trim() || null;
        break;
      case "DTSTART":
        result.dtStartIso = parseIcsDate(prop.value.trim(), prop.params);
        break;
      case "DTEND":
        result.dtEndIso = parseIcsDate(prop.value.trim(), prop.params);
        break;
      case "LOCATION":
        result.location = unescapeText(prop.value) || null;
        break;
      case "ORGANIZER":
        result.organizerEmail = extractOrganizerEmail(prop.value);
        break;
      case "STATUS":
        result.status = prop.value.trim().toUpperCase() || null;
        break;
      case "SEQUENCE": {
        const seq = Number.parseInt(prop.value.trim(), 10);
        result.sequence = Number.isNaN(seq) ? null : seq;
        break;
      }
      default:
        break;
    }
  }

  return result;
}
