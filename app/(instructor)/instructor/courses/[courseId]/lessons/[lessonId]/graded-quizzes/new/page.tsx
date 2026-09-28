import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GradedQuizForm } from "@/components/course-builder/graded-quiz-form";
import { PageHeader } from "@/components/shell/page-header";
import { Card, EmptyState, Icon } from "@/components/ui";
import { requireCourseStaff } from "@/lib/auth";
import { getLessonForUser } from "@/lib/db/courses";
import { questionBank } from "@/lib/db/quizzes";

/* Create a graded quiz from the lesson's question bank (feature 16). Course
   staff only; anyone else gets a 404. */
export default async function NewGradedQuizPage({
  params,
}: PageProps<"/instructor/courses/[courseId]/lessons/[lessonId]/graded-quizzes/new">) {
  const { courseId, lessonId } = await params;
  const user = await requireCourseStaff(courseId);
  const found = await getLessonForUser(lessonId, user);
  if (!found || found.course.id !== courseId) notFound();
  const questions = await questionBank(lessonId);
  const backHref = `/instructor/courses/${courseId}/lessons/${lessonId}`;

  return (
    <>
      <Link href={backHref} className="flex items-center gap-2 text-small text-ink-soft no-underline hover:text-ink">
        <Icon icon={ArrowLeft} size={16} />
        {found.lesson.title}
      </Link>
      <PageHeader eyebrow={`${found.course.code} · Graded quiz`} title="Create a graded quiz" />
      {questions.length === 0 ? (
        <Card padded={false} className="border-dashed">
          <EmptyState
            title="No questions to pick from"
            description="The lesson's question bank is drafted after its video is processed. Review it, then come back."
          />
        </Card>
      ) : (
        <GradedQuizForm lessonId={lessonId} lessonTitle={found.lesson.title} backHref={backHref} questions={questions} />
      )}
    </>
  );
}
