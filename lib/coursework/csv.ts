/* CSV that opens cleanly in Excel and Google Sheets (feature 20):
   - a UTF-8 byte-order mark, so Excel reads names like "Zoë" correctly;
   - CRLF line ends and RFC 4180 quoting (commas, quotes, line breaks);
   - text that starts with = + - @ or a tab is prefixed with ', so a name
     like "=HYPERLINK(…)" is shown as text instead of run as a formula.
   Numbers are written as numbers. */

export type CsvCell = string | number | null | undefined;

const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]|^\s|\s$/;

export function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  const text = FORMULA_START.test(value) ? `'${value}` : value;
  return NEEDS_QUOTES.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: CsvCell[][]): string {
  return `﻿${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

/* "MATH 201", "learners" on 29 Sep 2026 → "math-201-learners-2026-09-29.csv". */
export function csvFileName(courseCode: string, what: string, now: Date): string {
  const code = courseCode.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "course";
  return `${code}-${what}-${now.toISOString().slice(0, 10)}.csv`;
}
