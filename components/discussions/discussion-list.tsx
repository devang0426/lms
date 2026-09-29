import { ChevronRight, MessageSquare } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { LocalDate } from "@/components/coursework/local-date";
import { Badge, Icon } from "@/components/ui";
import type { DiscussionSummary } from "@/lib/db/discussions";

/* Discussion threads as rows (feature 21): /discussions, the lesson's
   Discussion tab, Messages and "Unanswered questions". `basePath` is
   where threads open for this reader: /discussions or
   /instructor/messages. `waiting` shows open threads as Butter (staff
   lists: they need an answer). */
export function DiscussionList({
  items,
  basePath,
  waiting = false,
  showCourse = true,
  empty,
}: {
  items: DiscussionSummary[];
  basePath: "/discussions" | "/instructor/messages";
  waiting?: boolean;
  showCourse?: boolean;
  empty: ReactNode;
}) {
  if (items.length === 0) return <>{empty}</>;
  return (
    <ul className="m-0 flex list-none flex-col p-0">
      {items.map((d) => (
        <li key={d.id} className="border-b border-line last:border-b-0">
          <Link
            href={`${basePath}/${d.id}`}
            className="flex items-center justify-between gap-4 px-[22px] py-4 text-ink no-underline hover:bg-oat hover:text-ink"
          >
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-[15px] font-medium break-words">{d.title}</span>
              <span className="text-meta text-ink-soft">
                {[showCourse ? d.courseCode : null, d.lessonTitle, d.mine ? "You" : d.authorName].filter(Boolean).join(" · ")}
                {" · "}
                <LocalDate at={d.lastActivityAt.getTime()} dateOnly />
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-2.5 text-meta text-ink-soft">
              <span className="hidden items-center gap-1.5 sm:flex" aria-label={`${d.replies} ${d.replies === 1 ? "reply" : "replies"}`}>
                <Icon icon={MessageSquare} size={15} />
                {d.replies}
              </span>
              <StatusBadge status={d.status} waiting={waiting} />
              <Icon icon={ChevronRight} size={16} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function StatusBadge({ status, waiting = false }: { status: DiscussionSummary["status"]; waiting?: boolean }) {
  if (status === "answered") {
    return (
      <Badge tone="success" size="md">
        Answered
      </Badge>
    );
  }
  return (
    <Badge tone={waiting ? "warning" : "neutral"} size="md">
      {waiting ? "Waiting" : "Open"}
    </Badge>
  );
}
