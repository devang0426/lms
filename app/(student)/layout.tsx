import { requireAreaRole } from "@/lib/auth";

/* Student area guard. Admin can visit everything. Instructors only get
   through to the focus shell (lesson preview, feature 11); the sidebar and
   top-nav shells send them back to /instructor. */
export default async function StudentAreaLayout({ children }: { children: React.ReactNode }) {
  await requireAreaRole("student", "admin", "instructor");
  return children;
}
