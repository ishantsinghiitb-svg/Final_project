// ── Shared CSV export helper (Module 13 · Phase 3) ──
//
// One small generic builder rather than a per-feature bespoke one — mirrors
// the existing "shared file helper" convention in this same directory
// (download.ts). RFC 4180-style quoting only (the minimum real spreadsheet
// apps require); no external CSV library, this app has no existing one.

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export type CsvColumn<T> = {
  header: string;
  value: (row: T) => unknown;
};

/** Builds an RFC-4180-ish CSV string (with a BOM for Excel) from rows + column definitions. */
export function buildCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => escapeCsvCell(c.header)).join(",");
  const lines = rows.map((row) => columns.map((c) => escapeCsvCell(c.value(row))).join(","));
  // Leading BOM so Excel (Windows especially) detects UTF-8 instead of guessing ANSI.
  return "﻿" + [header, ...lines].join("\r\n");
}
