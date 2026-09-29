import { CalendarClock } from "lucide-react";
import { Badge, Icon } from "@/components/ui";
import { dueLabel, dueState } from "@/lib/coursework/rules";
import { LocalDate } from "./local-date";

/* "Due Fri 9 Oct, 23:59" with a Butter badge when it's due soon
   (feature 20). Past the date it says whether late work is still taken. */
export function DueLine({ dueAt, allowLate, now }: { dueAt: number; allowLate: boolean; now: number }) {
  const state = dueState(dueAt, now);
  return (
    <div className="flex flex-wrap items-center gap-2.5 text-small">
      <Icon icon={CalendarClock} size={16} className="text-ink-soft" />
      <span>
        Due <LocalDate at={dueAt} />
      </span>
      {state === "soon" && (
        <Badge tone="warning" size="md">
          {dueLabel(dueAt, now)}
        </Badge>
      )}
      {state === "overdue" && (
        <Badge tone="neutral" size="md">
          {allowLate ? "Past due · late work accepted" : "Closed"}
        </Badge>
      )}
    </div>
  );
}
