import "katex/dist/katex.min.css";

import { ArrowLeft, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { LocalDate } from "@/components/coursework/local-date";
import { Badge, Card, Eyebrow, Icon } from "@/components/ui";
import type { DiscussionThread } from "@/lib/db/discussions";
import { renderPostMarkdown } from "@/lib/markdown";
import { cn } from "@/lib/utils/cn";
import { StatusBadge } from "./discussion-list";
import { AnswerButton, ReplyForm } from "./reply-form";

/* One discussion thread (feature 21), for students (/discussions/[id])
   and staff (/instructor/messages/[id]). Posts are rendered on the server
   with renderPostMarkdown: Markdown and maths, no raw HTML. The answer is
   a Sage-tint reply; staff may mark or change it, and reply "as the
   answer". */
export function DiscussionThreadView({
  thread,
  backHref,
  backLabel,
  lessonHref,
}: {
  thread: DiscussionThread;
  backHref: string;
  backLabel: string;
  /* The lesson it's about, if the reader can open it. */
  lessonHref: string | null;
}) {
  const { discussion: d, replies, canModerate } = thread;
  return (
    <>
      <Link href={backHref} className="flex items-center gap-2 self-start text-small text-ink-soft no-underline hover:text-ink">
        <Icon icon={ArrowLeft} size={16} />
        {backLabel}
      </Link>

      <header className="flex flex-col gap-3">
        <Eyebrow>
          {d.courseCode}
          {d.lessonTitle &&
            (lessonHref ? (
              <>
                {" · "}
                <Link href={lessonHref} className="text-ink-soft hover:text-terracotta">
                  {d.lessonTitle}
                </Link>
              </>
            ) : (
              ` · ${d.lessonTitle}`
            ))}
        </Eyebrow>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h1 className="m-0 max-w-[820px] font-serif text-[32px] leading-[1.15] font-normal break-words md:text-[40px]">{d.title}</h1>
          <StatusBadge status={d.status} waiting={canModerate} />
        </div>
      </header>

      <div className="flex max-w-[820px] flex-col gap-4">
        <Post author={d.mine ? "You" : d.authorName} staff={d.authorIsStaff} at={d.createdAt.getTime()} body={d.body} />

        <h2 className="m-0 mt-2 text-h3 font-semibold">
          {replies.length === 0 ? "No replies yet" : `${replies.length} ${replies.length === 1 ? "reply" : "replies"}`}
        </h2>
        {replies.map((r) => (
          <Post
            key={r.id}
            author={r.mine ? "You" : r.authorName}
            staff={r.authorIsStaff}
            at={r.createdAt.getTime()}
            body={r.body}
            answer={r.isAnswer}
            action={canModerate ? <AnswerButton discussionId={d.id} replyId={r.id} isAnswer={r.isAnswer} /> : null}
          />
        ))}

        <ReplyForm discussionId={d.id} staff={canModerate} open={d.status === "open"} />
      </div>
    </>
  );
}

function Post({
  author,
  staff,
  at,
  body,
  answer = false,
  action,
}: {
  author: string;
  staff: boolean;
  at: number;
  body: string;
  answer?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <Card padded={false} className={cn("gap-3 px-5 py-4", answer && "border-sage/40 bg-sage-tint")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex flex-wrap items-center gap-2 text-meta text-ink-soft">
          <span className="font-medium text-ink">{author}</span>
          {staff && (
            <Badge tone="new" size="sm">
              Instructor
            </Badge>
          )}
          <span>
            · <LocalDate at={at} />
          </span>
        </span>
        <span className="flex items-center gap-2">
          {answer && (
            <span className="flex items-center gap-1.5 text-meta font-medium text-sage-ink">
              <Icon icon={CheckCircle2} size={16} />
              Answer
            </span>
          )}
          {action}
        </span>
      </div>
      <div className="study-notes break-words" dangerouslySetInnerHTML={{ __html: renderPostMarkdown(body) }} />
    </Card>
  );
}
