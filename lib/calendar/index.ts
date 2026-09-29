import { DUE_SOON_MS } from "@/lib/coursework/rules";
import type { EventKind } from "@/lib/db/schema";

/* The course calendar (feature 21). Pure: month arithmetic, grouping by
   day, the date tile's tone and safe links. Times are epoch milliseconds.
   The server doesn't know the reader's time zone, so grouping takes `utc`:
   the server renders UTC, the browser swaps in local days after hydration
   (the LocalDate approach). */

export interface CalendarEvent {
  id: string;
  courseId: string;
  courseCode: string;
  kind: EventKind;
  title: string;
  at: number;
  /* An in-app path or an http(s) link; null when there's nowhere to go. */
  href: string | null;
  external: boolean;
  /* The viewer has already handed in the assignment or submitted the quiz. */
  done: boolean;
}

export const EVENT_KIND_LABELS: Record<EventKind, string> = {
  due: "Assignment due",
  quiz: "Graded quiz due",
  live: "Live session",
  custom: "Event",
};

export interface Month {
  year: number;
  /* 1–12 */
  month: number;
}

/* "2026-10" from ?month=; anything else is null. */
export function parseMonth(value: unknown): Month | null {
  if (typeof value !== "string") return null;
  const m = /^(\d{4})-(\d{2})$/.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (year < 2000 || year > 2100 || month < 1 || month > 12) return null;
  return { year, month };
}

export function monthParam({ year, month }: Month): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function monthOf(at: number): Month {
  const d = new Date(at);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

export function shiftMonth({ year, month }: Month, delta: number): Month {
  const i = year * 12 + (month - 1) + delta;
  return { year: Math.floor(i / 12), month: (i % 12) + 1 };
}

export interface GridDay {
  /* YYYY-MM-DD, the same key as dayKey() */
  key: string;
  day: number;
  inMonth: boolean;
}

const DAY_MS = 86_400_000;

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/* The month as whole weeks, Monday first (4–6 rows). */
export function monthGrid({ year, month }: Month): GridDay[][] {
  const first = Date.UTC(year, month - 1, 1);
  const lead = (new Date(first).getUTCDay() + 6) % 7; // days since Monday
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells = Math.ceil((lead + daysInMonth) / 7) * 7;
  const weeks: GridDay[][] = [];
  for (let i = 0; i < cells; i++) {
    const d = new Date(first + (i - lead) * DAY_MS);
    const day: GridDay = { key: isoDay(d), day: d.getUTCDate(), inMonth: d.getUTCMonth() === month - 1 };
    if (i % 7 === 0) weeks.push([]);
    weeks[weeks.length - 1].push(day);
  }
  return weeks;
}

/* The window to load for a month's grid, with a day of slack each side
   so any time zone's days are covered. */
export function gridRange(m: Month): { from: Date; to: Date } {
  const weeks = monthGrid(m);
  const firstKey = weeks[0][0].key;
  const lastKey = weeks[weeks.length - 1][6].key;
  return {
    from: new Date(Date.parse(`${firstKey}T00:00:00Z`) - DAY_MS),
    to: new Date(Date.parse(`${lastKey}T00:00:00Z`) + 2 * DAY_MS),
  };
}

/* YYYY-MM-DD of a moment, in UTC or in the runtime's local zone. */
export function dayKey(at: number, utc: boolean): string {
  const d = new Date(at);
  const y = utc ? d.getUTCFullYear() : d.getFullYear();
  const m = (utc ? d.getUTCMonth() : d.getMonth()) + 1;
  const day = utc ? d.getUTCDate() : d.getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/* Events by day key, each day in time order. */
export function groupByDay(list: CalendarEvent[], utc: boolean): Map<string, CalendarEvent[]> {
  const days = new Map<string, CalendarEvent[]>();
  for (const e of [...list].sort((a, b) => a.at - b.at)) {
    const key = dayKey(e.at, utc);
    days.set(key, [...(days.get(key) ?? []), e]);
  }
  return days;
}

/* Butter = a deadline within three days that isn't done or past. */
export function eventTone(e: Pick<CalendarEvent, "kind" | "at" | "done">, now: number): "butter" | "oat" {
  const deadline = e.kind === "due" || e.kind === "quiz";
  return deadline && !e.done && e.at >= now && e.at - now <= DUE_SOON_MS ? "butter" : "oat";
}

/* A stored event URL, made safe to render: an in-app path, or an http(s)
   link opened in a new tab. Anything else (javascript:, //host) is no link. */
export function eventLink(url: string | null): { href: string; external: boolean } | null {
  if (!url) return null;
  if (url.startsWith("/") && !url.startsWith("//") && !url.startsWith("/\\")) return { href: url, external: false };
  try {
    const u = new URL(url);
    if (u.protocol === "https:" || u.protocol === "http:") return { href: u.toString(), external: true };
  } catch {
    // not a URL
  }
  return null;
}
