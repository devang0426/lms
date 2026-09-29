import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { CalendarView } from "@/components/calendar/calendar-view";
import { PageHeader } from "@/components/shell/page-header";
import { Button, Chip, Icon } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { gridRange, monthOf, monthParam, parseMonth, shiftMonth, type Month } from "@/lib/calendar";
import { eventsBetween } from "@/lib/db/events";
import { requestTime } from "@/lib/utils/clock";

export const metadata = { title: "Calendar · Studyhall" };

/* The calendar (feature 21): due dates, graded quizzes, live sessions and
   other events across the viewer's courses, as a month or an agenda.
   ?month=2026-10 picks the month, ?view=agenda the list. What's shown is
   decided in the query (lib/db/events.ts). */
export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const user = await requireUser();
  const params = await searchParams;
  const now = requestTime();
  const month: Month = parseMonth(params.month) ?? monthOf(now);
  const view = params.view === "agenda" ? "agenda" : "month";
  const { from, to } = gridRange(month);
  const events = await eventsBetween(user, from, to);

  const name = new Date(Date.UTC(month.year, month.month - 1, 1)).toLocaleString("en-GB", { month: "long", timeZone: "UTC" });
  const href = (m: Month, v = view) => `/calendar?month=${monthParam(m)}${v === "agenda" ? "&view=agenda" : ""}`;

  return (
    <>
      <PageHeader
        eyebrow="Calendar"
        title={
          <>
            {name} <em>{month.year}</em>
          </>
        }
        actions={
          <>
            <div className="flex gap-2" role="group" aria-label="View">
              <Chip asChild active={view === "month"} className="h-[34px] px-3.5">
                <Link href={href(month, "month")} aria-current={view === "month" ? "true" : undefined} scroll={false}>
                  Month
                </Link>
              </Chip>
              <Chip asChild active={view === "agenda"} className="h-[34px] px-3.5">
                <Link href={href(month, "agenda")} aria-current={view === "agenda" ? "true" : undefined} scroll={false}>
                  Agenda
                </Link>
              </Chip>
            </div>
            <div className="flex items-center gap-2">
              <Button asChild variant="icon" size="sm" aria-label="Previous month">
                <Link href={href(shiftMonth(month, -1))} scroll={false}>
                  <Icon icon={ChevronLeft} />
                </Link>
              </Button>
              <Button asChild variant="quiet" size="sm">
                <Link href={view === "agenda" ? "/calendar?view=agenda" : "/calendar"} scroll={false}>
                  Today
                </Link>
              </Button>
              <Button asChild variant="icon" size="sm" aria-label="Next month">
                <Link href={href(shiftMonth(month, 1))} scroll={false}>
                  <Icon icon={ChevronRight} />
                </Link>
              </Button>
            </div>
          </>
        }
      />
      <CalendarView month={month} events={events} view={view} now={now} />
    </>
  );
}
