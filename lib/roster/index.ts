import { z } from "zod";

/* CSV roster import (feature 22). Pure: read the file, check each row on
   its own, and flag the rows that clash with each other. What needs the
   database (does the course exist, does the person have an account) is
   decided in lib/roster/plan.ts's server side. */

export const ROSTER_HEADER = ["email", "name", "role", "course_code", "section"] as const;
/* Admins are made on the Users page, never by a file. */
export const ROSTER_ROLES = ["student", "instructor"] as const;
export type RosterRole = (typeof ROSTER_ROLES)[number];

/* Small enough that one import (with its Clerk invitations) is a short
   request; a bigger roster goes in several files. */
export const ROSTER_LIMITS = { rows: 500, bytes: 200_000 } as const;

/* RFC 4180: quoted fields with "" for a quote, commas and line breaks
   inside quotes, CRLF or LF line ends, and an optional byte-order mark.
   Rows that are entirely empty are dropped. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === "") {
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

export interface RosterRow {
  /* 2 = the first row under the header, as a spreadsheet numbers it. */
  line: number;
  email: string;
  name: string;
  role: RosterRole;
  courseCode: string;
  section: string;
}

export type CheckedRow = { line: number; raw: string[] } & ({ ok: true; row: RosterRow } | { ok: false; error: string });

export type ParsedRoster = { ok: true; rows: CheckedRow[] } | { ok: false; error: string };

const email = z.email();

/* The file's header, then every row: fields present and well formed.
   A later row that repeats an email + course, or gives an email a second
   role, is an error (the first one stands). */
export function parseRoster(text: string): ParsedRoster {
  if (text.length > ROSTER_LIMITS.bytes) return { ok: false, error: "That file is over 200 KB. Split it into smaller files." };
  const table = parseCsv(text);
  if (table.length === 0) return { ok: false, error: "The file is empty." };
  const header = table[0].map((h) => h.trim().toLowerCase());
  if (header.length !== ROSTER_HEADER.length || header.some((h, i) => h !== ROSTER_HEADER[i])) {
    return { ok: false, error: `The first row must be the header: ${ROSTER_HEADER.join(",")}` };
  }
  const body = table.slice(1);
  if (body.length === 0) return { ok: false, error: "The file has a header but no rows." };
  if (body.length > ROSTER_LIMITS.rows) return { ok: false, error: `That's ${body.length} rows. Import at most ${ROSTER_LIMITS.rows} at a time.` };

  const seenCourse = new Set<string>();
  const roleOf = new Map<string, RosterRole>();
  const rows: CheckedRow[] = body.map((raw, i) => {
    const line = i + 2;
    const bad = (error: string): CheckedRow => ({ line, raw, ok: false, error });
    if (raw.length !== ROSTER_HEADER.length) return bad(`Expected ${ROSTER_HEADER.length} columns, found ${raw.length}.`);
    const [e, n, r, c, s] = raw.map((v) => v.trim());
    const mail = e.toLowerCase();
    if (!email.safeParse(mail).success) return bad(`“${e}” isn't an email address.`);
    if (!n) return bad("The name is missing.");
    if (n.length > 120) return bad("The name is over 120 characters.");
    const role = r.toLowerCase();
    if (!(ROSTER_ROLES as readonly string[]).includes(role)) return bad(`Role must be student or instructor, not “${r}”.`);
    if (!c) return bad("The course code is missing.");
    if (role === "student" && !s) return bad("A student needs a section.");
    if (s.length > 60) return bad("The section name is over 60 characters.");

    const key = `${mail}|${c.toUpperCase()}`;
    if (seenCourse.has(key)) return bad(`${mail} is already listed for ${c} above.`);
    const earlier = roleOf.get(mail);
    if (earlier && earlier !== role) return bad(`${mail} is listed as a ${earlier} above; one person has one role.`);
    seenCourse.add(key);
    roleOf.set(mail, role as RosterRole);
    return { line, raw, ok: true, row: { line, email: mail, name: n, role: role as RosterRole, courseCode: c, section: s } };
  });
  return { ok: true, rows };
}
