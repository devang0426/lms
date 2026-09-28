import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { NewCourseForm } from "@/components/course-builder/new-course-form";
import { PageHeader } from "@/components/shell/page-header";
import { Card, Icon } from "@/components/ui";
import { requireAreaRole } from "@/lib/auth";

export const metadata = { title: "New course · Studyhall" };

export default async function NewCoursePage() {
  await requireAreaRole("instructor", "admin");
  return (
    <>
      <Link href="/instructor/courses" className="flex items-center gap-2 text-small text-ink-soft no-underline hover:text-ink">
        <Icon icon={ArrowLeft} size={16} />
        All courses
      </Link>
      <PageHeader eyebrow="Teaching" title={<>A new <em>course</em></>} />
      <Card>
        <NewCourseForm />
      </Card>
    </>
  );
}
