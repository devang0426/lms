import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CourseDetailsForm, PublishCourseButton } from "@/components/course-builder/course-settings";
import { CurriculumEditor } from "@/components/course-builder/curriculum-editor";
import { StatusBadge } from "@/components/course-builder/status-badge";
import { PageHeader } from "@/components/shell/page-header";
import { Card, Icon, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { requireCourseStaff } from "@/lib/auth";
import { getCourseForUser } from "@/lib/db/courses";

export default async function CourseBuilderPage({ params }: PageProps<"/instructor/courses/[courseId]">) {
  const { courseId } = await params;
  const user = await requireCourseStaff(courseId);
  const data = await getCourseForUser(courseId, user);
  if (!data) notFound();
  const { course, modules } = data;

  const lessonCount = modules.reduce((n, m) => n + m.lessons.length, 0);
  const visible = modules
    .filter((m) => m.status === "published")
    .reduce((n, m) => n + m.lessons.filter((l) => l.status === "published").length, 0);

  return (
    <>
      <Link href="/instructor/courses" className="flex items-center gap-2 text-small text-ink-soft no-underline hover:text-ink">
        <Icon icon={ArrowLeft} size={16} />
        All courses
      </Link>
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-3">
            {course.code}
            <StatusBadge status={course.status} size="sm" />
          </span>
        }
        title={course.title}
        actions={<PublishCourseButton courseId={course.id} published={course.status === "published"} />}
      />

      <p className="m-0 rounded-2xl bg-butter-tint px-4 py-3 text-small text-butter-ink">
        {course.status === "published"
          ? `Enrolled students can see ${visible} of ${lessonCount} lessons. A lesson shows once it and its module are published.`
          : "This course is a draft, so students can't see any of it yet. Publish the course, its modules and its lessons."}
      </p>

      <Tabs defaultValue="curriculum" className="flex flex-col">
        <TabsList>
          <TabsTrigger value="curriculum" count={modules.length}>
            Curriculum
          </TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>
        <TabsContent value="curriculum">
          <CurriculumEditor courseId={course.id} modules={modules} />
        </TabsContent>
        <TabsContent value="details">
          <Card>
            <CourseDetailsForm course={course} />
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
