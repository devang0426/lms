import { requireAreaRole } from "@/lib/auth";

/* Full-width student pages. Instructors are let in too (feature 28, N3):
   a course's staff open its student pages to see them as students do. Each
   page checks course access, and sends an instructor who doesn't teach the
   course back to /instructor. The shell is in courses/[courseId]/layout. */
export default async function TopNavLayout({ children }: { children: React.ReactNode }) {
  await requireAreaRole("student", "admin", "instructor");
  return children;
}
