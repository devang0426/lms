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
