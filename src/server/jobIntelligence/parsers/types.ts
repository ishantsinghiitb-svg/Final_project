import type { ParsedJobPosting } from "../types";

/**
 * Opaque raw capture handed from a Crawler to a Parser. `html`/`json` are
 * both optional because different platforms expose postings differently
 * (server-rendered HTML vs. a JSON API) — a parser reads whichever it needs.
 */
export type RawJobPayload = {
  platform: string;
  sourceUrl: string;
  fetchedAt: string;
  html?: string;
  json?: unknown;
};

export type ParseOutcome = { ok: true; job: ParsedJobPosting } | { ok: false; reason: string };

/**
 * Contract every platform parser implements. Deliberately synchronous and
 * side-effect-free (no network/DB access) so parsers stay unit-testable in
 * isolation, the same shape the extension's own parsers already follow (see
 * memory: Module 4B/4C parsers).
 */
export interface JobParser {
  readonly platform: string;
  readonly version: string;
  parse(raw: RawJobPayload): ParseOutcome;
}
