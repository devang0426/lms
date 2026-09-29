"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { addCourseEvent, deleteCourseEvent } from "@/app/(instructor)/instructor/courses/[courseId]/event-actions";
import { LocalDate } from "@/components/coursework/local-date";
import { useAction } from "@/components/course-builder/use-action";
import { Badge, Button, Card, CardHeader, ChipGroup, Field, Icon, Input } from "@/components/ui";
import { EVENT_KIND_LABELS, type CalendarEvent } from "@/lib/calendar";
import { EventDateTile } from "./event-date-tile";

/* The course builder's Calendar tab (feature 21): what's coming up on the
   course calendar, and "Add to calendar" for a live session (a link to
   the meeting, which runs elsewhere) or any other dated event. Due dates
   and graded quizzes come from their own forms and can't be removed here. */

type ManualKind = "live" | "custom";

export function CourseEventsEditor({ courseId, events }: { courseId: string; events: CalendarEvent[] }) {
  const [kind, setKind] = useState<ManualKind>("live");
  const [title, setTitle] = useState("");
  // Empty until picked: a default would render in the server's time zone.
  const [at, setAt] = useState("");
  const [url, setUrl] = useState("");
  const { pending, run } = useAction();

  function add() {
    const when = new Date(at);
    if (Number.isNaN(when.getTime())) return;
    run(
      () => addCourseEvent({ courseId, kind, title, at: when.toISOString(), url: url.trim() || null }),
      () => {
        setTitle("");
        setAt("");
        setUrl("");
      },
    );
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1.4fr_1fr]">
      <Card padded={false} className="px-5 py-1.5">
        {events.length === 0 ? (
          <p className="m-0 py-6 text-center text-small text-ink-soft">Nothing coming up. Due dates appear here when you set them.</p>
        ) : (
          events.map((e) => <EventLine key={e.id} courseId={courseId} event={e} />)
        )}
      </Card>

      <Card className="gap-4">
        <CardHeader title="Add to calendar" />
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <ChipGroup
            label="Kind of event"
            value={kind}
            onValueChange={(v) => setKind(v as ManualKind)}
            options={[
              { value: "live", label: "Live session" },
              { value: "custom", label: "Other" },
            ]}
          />
          <Field label="Title" htmlFor="event-title">
            <Input
              id="event-title"
              value={title}
              maxLength={140}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={kind === "live" ? "e.g. Review session before the midterm" : "e.g. Midterm exam, Room 204"}
            />
          </Field>
          <Field label="When" htmlFor="event-at" hint="In your time zone.">
            <Input id="event-at" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
          </Field>
          <Field
            label={kind === "live" ? "Meeting link" : "Link (optional)"}
            htmlFor="event-url"
            hint={kind === "live" ? "Zoom, Teams or Meet: students join there." : undefined}
          >
            <Input id="event-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
          </Field>
          <Button type="submit" variant="secondary" size="sm" className="self-end" loading={pending} disabled={!title.trim() || !at || (kind === "live" && !url.trim())}>
            Add to calendar
          </Button>
        </form>
      </Card>
    </div>
  );
}

function EventLine({ courseId, event: e }: { courseId: string; event: CalendarEvent }) {
  const { pending, run } = useAction();
  const manual = e.kind === "live" || e.kind === "custom";
  return (
    <div className="flex items-center gap-3.5 border-b border-line py-3 last:border-b-0">
      <EventDateTile at={e.at} />
      <div className="flex min-w-0 grow flex-col gap-0.5">
        <span className="truncate text-[15px] font-medium">{e.title}</span>
        <span className="truncate text-meta text-ink-soft">
          {EVENT_KIND_LABELS[e.kind]} · <LocalDate at={e.at} timeOnly />
        </span>
      </div>
      {manual ? (
        <Button
          variant="icon"
          size="xs"
          aria-label={`Remove “${e.title}”`}
          loading={pending}
          onClick={() => run(() => deleteCourseEvent({ courseId, eventId: e.id }))}
        >
          <Icon icon={Trash2} size={15} />
        </Button>
      ) : (
        <Badge tone="neutral" size="sm">
          {e.kind === "due" ? "From the assignment" : "From the quiz"}
        </Badge>
      )}
    </div>
  );
}
