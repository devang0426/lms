"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import { Card, EmptyState } from "@/components/ui";
import { dayKey, groupByDay, monthGrid, monthParam, type CalendarEvent, type Month } from "@/lib/calendar";
import type { EventKind } from "@/lib/db/schema";
import { cn } from "@/lib/utils/cn";
import { EventRow } from "./event-row";

/* /calendar's month and agenda views (feature 21). Days are the reader's
   own: the server renders UTC days and the browser regroups by its local
   zone after hydration (the events around the month are loaded with a
   day of slack, so nothing falls off an edge). */

const noop = () => () => {};
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const pillTone: Record<EventKind, string> = {
  due: "bg-butter-tint text-butter-ink",
  quiz: "bg-butter-tint text-butter-ink",
  live: "bg-sage-tint text-sage-ink",
  custom: "bg-oat text-ink",
};
const dotTone: Record<EventKind, string> = { due: "bg-butter", quiz: "bg-butter", live: "bg-sage", custom: "bg-ink-soft" };

export function CalendarView({
  month,
  events,
  view,
  now,
}: {
  month: Month;
  events: CalendarEvent[];
  view: "month" | "agenda";
  now: number;
}) {
  const inBrowser = useSyncExternalStore(noop, () => true, () => false);
  const utc = !inBrowser;
  const byDay = useMemo(() => groupByDay(events, utc), [events, utc]);
  const today = dayKey(now, utc);
  const prefix = `${monthParam(month)}-`;
  const inMonth = useMemo(
    () => events.filter((e) => dayKey(e.at, utc).startsWith(prefix)).sort((a, b) => a.at - b.at),
    [events, utc, prefix],
  );

  const agenda = (
    <Card padded={false} className="px-5 py-1.5">
      {inMonth.length === 0 ? (
        <EmptyState title="A clear month" description="Nothing is due and nothing is planned in your courses this month." className="py-10" />
      ) : (
        inMonth.map((e) => <EventRow key={e.id} event={e} now={now} />)
      )}
    </Card>
  );

  if (view === "agenda") return agenda;

  return (
    <>
      <Card padded={false} className="overflow-hidden">
        <div role="grid" aria-label="Month" className="flex flex-col">
          <div role="row" className="grid grid-cols-7 bg-oat">
            {WEEKDAYS.map((d) => (
              <span key={d} role="columnheader" className="px-2 py-2.5 font-mono text-[11px] tracking-[0.08em] text-ink-soft uppercase md:px-3">
                {d}
              </span>
            ))}
          </div>
          {monthGrid(month).map((week) => (
            <div key={week[0].key} role="row" className="grid grid-cols-7 border-t border-line">
              {week.map((day) => {
                const list = byDay.get(day.key) ?? [];
                const isToday = day.key === today;
                return (
                  <div
                    key={day.key}
                    role="gridcell"
                    aria-label={`${day.key}${list.length ? `, ${list.length} ${list.length === 1 ? "event" : "events"}` : ""}`}
                    className={cn(
                      "flex min-h-[64px] min-w-0 flex-col gap-1 border-l border-line p-1.5 first:border-l-0 md:min-h-[112px] md:p-2",
                      !day.inMonth && "bg-oat/40",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-6 items-center justify-center self-start rounded-full text-[13px]",
                        // Other months' days: muted but at full contrast (the Oat cell marks them).
                        isToday ? "bg-ink font-medium text-cream" : day.inMonth ? "text-ink" : "text-ink-soft",
                      )}
                    >
                      {day.day}
                    </span>
                    {/* Phones: a dot per event; the agenda below has the details. */}
                    {list.length > 0 && (
                      <span className="flex flex-wrap gap-1 md:hidden" aria-hidden>
                        {list.slice(0, 4).map((e) => (
                          <span key={e.id} className={cn("size-1.5 rounded-full", dotTone[e.kind])} />
                        ))}
                      </span>
                    )}
                    <ul className="m-0 hidden list-none flex-col gap-1 p-0 md:flex">
                      {list.slice(0, 3).map((e) => (
                        <li key={e.id} className="min-w-0">
                          <EventPill event={e} />
                        </li>
                      ))}
                      {list.length > 3 && <li className="px-1.5 text-[12px] text-ink-soft">+{list.length - 3} more</li>}
                    </ul>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </Card>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-meta text-ink-soft" aria-hidden>
        <Legend dot="bg-butter">Deadlines</Legend>
        <Legend dot="bg-sage">Live sessions</Legend>
        <Legend dot="bg-ink-soft">Other events</Legend>
      </div>
      <div className="md:hidden">{agenda}</div>
    </>
  );
}

function EventPill({ event: e }: { event: CalendarEvent }) {
  const cls = cn(
    "block truncate rounded-md px-1.5 py-0.5 text-[12px] leading-[1.4] no-underline hover:brightness-[0.97]",
    pillTone[e.kind],
    e.done && "line-through opacity-70",
  );
  const label = `${e.courseCode} · ${e.title}`;
  if (!e.href) return <span className={cls} title={label}>{e.title}</span>;
  if (e.external) {
    return (
      <a href={e.href} target="_blank" rel="noopener noreferrer" className={cls} title={label}>
        {e.title}
      </a>
    );
  }
  return (
    <Link href={e.href} className={cls} title={label}>
      {e.title}
    </Link>
  );
}

function Legend({ dot, children }: { dot: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("size-2 rounded-full", dot)} />
      {children}
    </span>
  );
}
