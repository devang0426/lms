import Link from "next/link";
import type { ReactNode } from "react";
import { UserMenu, type MenuUser } from "@/components/auth/user-menu";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { Logo } from "@/components/ui";
import { StudentViewBanner } from "./student-view-banner";

/* Top-nav shell for full-width pages (course detail, the course's
   assistant): the logo, a breadcrumb ("My courses › MATH 201", or
   "Explore › …" for a course you're not in), "My courses" and the avatar
   menu. No sidebar (feature 28). On phones the breadcrumb takes a second
   row. Staff get the Student view banner, back to `teachingHref`. */
export function TopNavShell({
  user,
  demoMode,
  crumbs,
  student,
  teachingHref,
  children,
}: {
  user: MenuUser;
  demoMode: boolean;
  crumbs: ReactNode;
  /* A student sees "My courses"; staff see the Student view banner. */
  student: boolean;
  teachingHref: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex min-h-[72px] shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-line px-5 py-3 md:flex-nowrap md:gap-10 md:px-20">
        <Link href={student ? "/" : "/instructor"} aria-label="Studyhall home" className="text-ink no-underline hover:text-ink">
          <Logo size="sm" wordmark={false} className="md:hidden" />
          <Logo size="sm" className="hidden md:inline-flex" />
        </Link>
        <div className="order-last flex w-full min-w-0 md:order-none md:w-auto md:flex-1">{crumbs}</div>
        <span className="flex items-center gap-5">
          {student && (
            <Link href="/courses" className="text-[15px] font-medium text-ink no-underline hover:text-terracotta">
              My courses
            </Link>
          )}
          <NotificationBell />
          <UserMenu user={user} demoMode={demoMode} variant="avatar" profile={student} viewAsStudent={!student} />
        </span>
      </header>
      {!student && <StudentViewBanner backHref={teachingHref} />}
      <main className="flex min-w-0 flex-1 flex-col gap-8 px-5 py-8 md:px-20 md:py-12">{children}</main>
    </div>
  );
}
