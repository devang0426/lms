import { ArrowLeft, Eye } from "lucide-react";
import Link from "next/link";
import { Icon } from "@/components/ui";

/* Shown to staff on student pages (feature 28, N3): they're seeing what
   students see, and the way back. `backHref` is the course's builder when
   there is one, else the teaching dashboard. */
export function StudentViewBanner({ backHref = "/instructor" }: { backHref?: string }) {
  return (
    <div
      role="note"
      aria-label="Student view"
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 bg-butter-tint px-5 py-2 text-small text-butter-ink md:px-12"
    >
      <span className="flex items-center gap-2">
        <Icon icon={Eye} size={16} />
        <span>
          <strong className="font-medium">Student view.</strong> Pages as students see them; drafts are marked, and students
          don&apos;t see those.
        </span>
      </span>
      <Link href={backHref} className="flex items-center gap-1.5 font-medium text-ink no-underline hover:text-terracotta">
        <Icon icon={ArrowLeft} size={14} />
        Back to Teaching
      </Link>
    </div>
  );
}
