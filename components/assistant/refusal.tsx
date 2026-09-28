import { MessageCircleQuestion } from "lucide-react";
import { Button, Icon } from "@/components/ui";

/* The assistant's refusal (feature 14). Fixed copy, never generated: the
   server refuses off-syllabus questions before (or instead of) any model
   answer. "Ask your instructor" opens a discussion post in feature 21;
   until then it is disabled and says so. */
export function Refusal({ courseTitle }: { courseTitle: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-oat px-4 py-3.5">
      <p className="m-0 text-[15px] leading-[1.55]">
        That topic isn&rsquo;t part of <em>{courseTitle}</em>. I can only help with material taught in this course.
      </p>
      <span title="Discussions arrive in a later update" className="self-start">
        <Button variant="quiet" size="xs" disabled aria-describedby="ask-instructor-soon">
          <Icon icon={MessageCircleQuestion} size={14} />
          Ask your instructor
        </Button>
        <span id="ask-instructor-soon" className="sr-only">
          Coming soon: discussions arrive in a later update.
        </span>
      </span>
    </div>
  );
}
