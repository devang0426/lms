import { requireAreaRole } from "@/lib/auth";

/* Focus shell: no sidebar or top nav. Each page renders <FocusHeader>
   because the header shows lesson data. Instructors are let in to preview
   lessons of courses they teach; the page itself checks course access. */
export default async function FocusLayout({ children }: { children: React.ReactNode }) {
  await requireAreaRole("student", "admin", "instructor");
  return <div className="flex min-h-dvh flex-col">{children}</div>;
}
