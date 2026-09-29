"use client";

import { useState } from "react";
import { replyToDiscussion, setAnswer } from "@/app/(student)/(sidebar)/discussions/actions";
import { useAction } from "@/components/course-builder/use-action";
import { Button, Textarea } from "@/components/ui";
import { DISCUSSION_LIMITS } from "@/lib/discussions/view";

/* Reply to a thread (feature 21). Staff get "Mark my reply as the answer",
   on by default while the thread is open, so answering a question takes
   one click. The action revalidates the page, which shows the reply. */
export function ReplyForm({ discussionId, staff, open }: { discussionId: string; staff: boolean; open: boolean }) {
  const [body, setBody] = useState("");
  const [asAnswer, setAsAnswer] = useState(open);
  const { pending, run } = useAction();

  return (
    <form
      className="flex flex-col gap-2.5 pt-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => replyToDiscussion({ discussionId, body, markAnswer: staff && asAnswer }), () => setBody(""));
      }}
    >
      <label htmlFor={`reply-${discussionId}`} className="text-meta font-medium">
        Your reply
      </label>
      <Textarea
        id={`reply-${discussionId}`}
        rows={4}
        value={body}
        maxLength={DISCUSSION_LIMITS.body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={staff ? "Answer the question, or ask what they've tried." : "Add to the discussion."}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        {staff ? (
          <label className="flex cursor-pointer items-center gap-2 text-small">
            <input type="checkbox" checked={asAnswer} onChange={(e) => setAsAnswer(e.target.checked)} className="size-4 accent-sage" />
            Mark my reply as the answer
          </label>
        ) : (
          <span className="text-meta text-ink-soft">Markdown and $maths$ work.</span>
        )}
        <Button type="submit" variant={staff ? "primary" : "secondary"} size="sm" loading={pending} disabled={!body.trim()}>
          Reply
        </Button>
      </div>
    </form>
  );
}

/* Staff only: mark this reply as the thread's answer, or clear it. */
export function AnswerButton({ discussionId, replyId, isAnswer }: { discussionId: string; replyId: string; isAnswer: boolean }) {
  const { pending, run } = useAction();
  return (
    <Button
      variant={isAnswer ? "quiet" : "success"}
      size="xs"
      loading={pending}
      onClick={() => run(() => setAnswer({ discussionId, replyId: isAnswer ? null : replyId }))}
    >
      {isAnswer ? "Unmark" : "Mark as answer"}
    </Button>
  );
}
