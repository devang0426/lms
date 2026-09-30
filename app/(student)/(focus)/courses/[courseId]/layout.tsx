import { StudentViewBanner } from "@/components/shell/student-view-banner";
import { requireUser } from "@/lib/auth";

/* A course's lessons in focus mode. Staff previewing them get the Student
   view banner, back to the course's builder (feature 28). No query: the
   user is the request's cached lookup and the course id is in the URL. */
export default async function FocusCourseLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ courseId: string }>;
}) {
  const [{ courseId }, user] = await Promise.all([params, requireUser()]);
  return (
    <>
      {user.role !== "student" && <StudentViewBanner backHref={`/instructor/courses/${courseId}`} />}
      {children}
    </>
  );
}
