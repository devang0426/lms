"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { enrollStudent, unenrollStudent } from "@/app/(admin)/admin/courses/[courseId]/enrollments/actions";
import { useAction } from "@/components/course-builder/use-action";
import { Button, Icon, Select, toast } from "@/components/ui";

export function EnrollButton({
  courseId,
  userId,
  name,
  sections,
}: {
  courseId: string;
  userId: string;
  name: string;
  sections: { id: string; name: string }[];
}) {
  const { pending, run } = useAction();
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? "");

  return (
    <span className="flex items-center gap-2">
      {sections.length > 1 && (
        <Select
          value={sectionId}
          onChange={(e) => setSectionId(e.target.value)}
          aria-label={`Section for ${name}`}
          className="h-8 w-auto rounded-lg px-2 text-meta"
        >
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      )}
      <Button
        variant="success"
        size="xs"
        loading={pending}
        disabled={!sectionId}
        leading={<Icon icon={Plus} size={14} />}
        onClick={() =>
          run(() => enrollStudent({ courseId, userId, sectionId }), () => toast.success(`${name} enrolled.`))
        }
      >
        Enroll
      </Button>
    </span>
  );
}

export function RemoveEnrollmentButton({ courseId, userId, name }: { courseId: string; userId: string; name: string }) {
  const { pending, run } = useAction();
  return (
    <Button
      variant="quiet"
      size="xs"
      loading={pending}
      leading={<Icon icon={X} size={14} />}
      aria-label={`Remove ${name} from this course`}
      onClick={() => run(() => unenrollStudent({ courseId, userId }), () => toast.success(`${name} removed.`))}
    >
      Remove
    </Button>
  );
}
