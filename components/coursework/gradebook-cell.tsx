import Link from "next/link";
import { Badge } from "@/components/ui";
import type { GradebookCell } from "@/lib/coursework/gradebook";
import { formatPoints } from "@/lib/coursework/rules";

/* One student's state on one gradebook item (feature 20), for staff: a
   score, a draft grade, work to grade (each linking to the grade view),
   missing, or not due yet. The gradebook and the student report (feature
   31) both show it. */
export function GradebookCellView({ cell }: { cell: GradebookCell }) {
  switch (cell.kind) {
    case "score": {
      const value = (
        <span className="whitespace-nowrap">
          <span className="text-[15px] text-ink">{formatPoints(cell.score)}</span>
          <span className="text-ink-soft"> / {cell.maxScore}</span>
        </span>
      );
      return (
        <span className="flex flex-wrap items-center gap-2">
          {cell.submissionId ? (
            <Link href={`/instructor/grading/${cell.submissionId}`} className="no-underline hover:underline">
              {value}
            </Link>
          ) : (
            value
          )}
          {cell.late && (
            <Badge tone="warning" size="sm">
              Late
            </Badge>
          )}
        </span>
      );
    }
    case "draft":
      return (
        <Link href={`/instructor/grading/${cell.submissionId}`} className="whitespace-nowrap text-ink-soft hover:text-ink">
          Draft · {formatPoints(cell.score)} / {cell.maxScore}
        </Link>
      );
    case "to_grade":
      return (
        <Link href={`/instructor/grading/${cell.submissionId}`} className="no-underline">
          <Badge tone="warning" size="md">
            To grade{cell.late ? " · late" : ""}
          </Badge>
        </Link>
      );
    case "missing":
      return <span className="text-ink-soft">Missing</span>;
    case "none":
      return (
        <span className="text-ink-soft" aria-label="Not due yet">
          —
        </span>
      );
    default: {
      const never: never = cell;
      return never;
    }
  }
}
