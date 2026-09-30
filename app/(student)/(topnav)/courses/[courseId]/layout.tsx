import { Suspense } from "react";
import type { Crumb } from "@/components/shell/breadcrumbs";
import { CourseBreadcrumbs } from "@/components/shell/course-breadcrumbs";
import { toMenuUser } from "@/components/shell/shell-user";
import { TopNavShell } from "@/components/shell/top-nav-shell";
import { requireUser } from "@/lib/auth";
import { courseDetailFor } from "@/lib/db/course-page";
import type { User } from "@/lib/db/schema";
import { isDemoMode } from "@/lib/demo/accounts";

/* A course's student pages (course detail and its assistant) in the top-nav
   shell (feature 28). The shell renders straight away; the breadcrumb
   streams in from the same cached batch the page loads, so the page's
   skeleton isn't held up and no query is added. The pages check access. */
export default async function CourseShellLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const user = await requireUser();
  const student = user.role === "student";

  return (
    <TopNavShell
      user={toMenuUser(user)}
      demoMode={isDemoMode()}
      student={student}
      teachingHref={`/instructor/courses/${courseId}`}
      crumbs={
        <Suspense fallback={<span aria-hidden className="h-5 w-40 rounded-md bg-oat" />}>
          <CourseCrumbs courseId={courseId} user={user} />
        </Suspense>
      }
    >
      {children}
    </TopNavShell>
  );
}

async function CourseCrumbs({ courseId, user }: { courseId: string; user: User }) {
  const detail = await courseDetailFor(courseId, user);
  const course = detail?.full?.course ?? detail?.preview?.course;
  if (!detail || !course) return null;
  // Enrolled students start from My courses, staff from Teaching, anyone
  // else from Explore (where they found it).
  const root: Crumb =
    detail.full?.access === "staff"
      ? { label: "Teaching", href: "/instructor/courses" }
      : detail.full
        ? { label: "My courses", href: "/courses" }
        : { label: "Explore", href: "/catalog" };
  return <CourseBreadcrumbs root={root} courseId={courseId} code={course.code} />;
}
