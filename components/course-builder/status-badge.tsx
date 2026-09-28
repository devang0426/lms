import { Badge, type BadgeTone } from "@/components/ui";
import type { LessonStatus } from "@/lib/db/schema";

const tones: Record<LessonStatus, BadgeTone> = {
  draft: "neutral",
  processing: "warning",
  ready: "new",
  published: "success",
};

const labels: Record<LessonStatus, string> = {
  draft: "Draft",
  processing: "Processing",
  ready: "Ready",
  published: "Published",
};

/* Course, module and lesson status. Course/module only use draft/published. */
export function StatusBadge({ status, size = "md" }: { status: LessonStatus; size?: "sm" | "md" | "lg" }) {
  return (
    <Badge tone={tones[status]} size={size}>
      {labels[status]}
    </Badge>
  );
}
