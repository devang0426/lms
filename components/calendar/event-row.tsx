import Link from "next/link";
import { LocalDate } from "@/components/coursework/local-date";
import { Badge } from "@/components/ui";
import { EVENT_KIND_LABELS, eventTone, type CalendarEvent } from "@/lib/calendar";
import { cn } from "@/lib/utils/cn";
import { EventDateTile } from "./event-date-tile";

/* One calendar entry with its date tile (feature 21): "Coming up" on
   Student home and the calendar's agenda. Butter tile = a deadline within
   three days. A live session's link opens the meeting in a new tab. */
export function EventRow({ event: e, now, className }: { event: CalendarEvent; now: number; className?: string }) {
  const titleClass = "text-ink no-underline hover:text-terracotta";
  return (
    <div className={cn("flex items-center gap-3.5 border-b border-line py-3 last:border-b-0", className)}>
      <EventDateTile at={e.at} tone={eventTone(e, now)} />
      <div className="flex min-w-0 grow flex-col gap-0.5">
        <span className="truncate text-[15px] font-medium">
          {!e.href ? (
            e.title
          ) : e.external ? (
            <a href={e.href} target="_blank" rel="noopener noreferrer" className={titleClass}>
              {e.title}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : (
            <Link href={e.href} className={titleClass}>
              {e.title}
            </Link>
          )}
        </span>
        <span className="truncate text-meta text-ink-soft">
          {e.courseCode} · {EVENT_KIND_LABELS[e.kind]} · <LocalDate at={e.at} timeOnly />
        </span>
      </div>
      {e.done && (
        <Badge tone="success" size="sm">
          {e.kind === "due" ? "Handed in" : "Done"}
        </Badge>
      )}
    </div>
  );
}
