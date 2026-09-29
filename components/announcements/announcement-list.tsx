import "katex/dist/katex.min.css";

import type { ReactNode } from "react";
import { LocalDate } from "@/components/coursework/local-date";
import { Eyebrow } from "@/components/ui";
import type { AnnouncementView } from "@/lib/db/announcements";
import { renderPostMarkdown } from "@/lib/markdown";

/* Announcements, newest first (feature 21): the course page's tab for
   students, and Messages for staff (with the course and a delete button).
   Rendered on the server: Markdown and maths, no raw HTML. */
export function AnnouncementList({
  items,
  eyebrowFor,
  actionFor,
}: {
  items: AnnouncementView[];
  eyebrowFor?: (a: AnnouncementView) => ReactNode;
  actionFor?: (a: AnnouncementView) => ReactNode;
}) {
  return (
    <ol className="m-0 flex list-none flex-col gap-4 p-0">
      {items.map((a) => (
        <li key={a.id} id={`announcement-${a.id}`} className="flex flex-col gap-2.5 rounded-card border border-line bg-paper px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              {eyebrowFor && <Eyebrow>{eyebrowFor(a)}</Eyebrow>}
              <h3 className="m-0 text-h3 font-semibold break-words">{a.title}</h3>
              <span className="text-meta text-ink-soft">
                {a.authorName} · <LocalDate at={a.createdAt.getTime()} />
              </span>
            </div>
            {actionFor?.(a)}
          </div>
          <div className="study-notes break-words" dangerouslySetInnerHTML={{ __html: renderPostMarkdown(a.body) }} />
        </li>
      ))}
    </ol>
  );
}
