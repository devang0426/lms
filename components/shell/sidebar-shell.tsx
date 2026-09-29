import Link from "next/link";
import type { ReactNode } from "react";
import { UserMenu, type MenuUser } from "@/components/auth/user-menu";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { Logo } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { MobileMenu } from "./mobile-menu";
import type { NavArea } from "./nav-config";
import { SidebarNav, StudentTabBar } from "./sidebar-nav";

/* The app shell for student, instructor and admin areas
   (ui-context.md → Layout Patterns). Desktop: 248px Oat sidebar with logo,
   nav, optional notice card and the user block. Below 768px the sidebar
   collapses: students get the bottom tab bar, staff get a menu button. */
export function SidebarShell({
  areas,
  homeHref,
  user,
  demoMode,
  badge,
  notice,
  tabBar = false,
  children,
}: {
  areas: NavArea[];
  homeHref: string;
  user: MenuUser;
  demoMode: boolean;
  badge?: ReactNode;
  notice?: ReactNode;
  tabBar?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col gap-8 overflow-y-auto bg-oat px-4 pt-7 pb-5 md:flex">
        <div className="flex flex-col items-start gap-3 px-2">
          <div className="flex w-full items-center justify-between gap-2">
            <Link href={homeHref} aria-label="Studyhall home" className="text-ink no-underline hover:text-ink">
              <Logo size="sm" />
            </Link>
            <NotificationBell align="start" />
          </div>
          {badge}
        </div>
        <SidebarNav areas={areas} />
        <div className="mt-auto flex flex-col gap-4">
          {notice}
          <UserMenu user={user} demoMode={demoMode} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-line bg-page px-5 md:hidden">
          <span className="flex min-w-0 items-center gap-2.5">
            <Link href={homeHref} aria-label="Studyhall home" className="text-ink no-underline hover:text-ink">
              <Logo size="sm" />
            </Link>
            {badge}
          </span>
          <span className="flex items-center gap-2">
            <NotificationBell />
            {!tabBar && <MobileMenu areas={areas} />}
            <UserMenu user={user} demoMode={demoMode} variant="avatar" />
          </span>
        </header>

        <main
          className={cn(
            "flex min-w-0 flex-1 flex-col gap-7 px-5 pt-6 md:gap-8 md:px-12 md:pt-9 md:pb-11",
            tabBar ? "pb-[108px]" : "pb-10",
          )}
        >
          {children}
        </main>

        {tabBar && <StudentTabBar className="fixed inset-x-0 bottom-0 z-30 md:hidden" />}
      </div>
    </div>
  );
}

/* Butter notice card for the sidebar ("THIS WEEK"). */
export function NoticeCard({ eyebrow, children }: { eyebrow: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl bg-butter-tint p-4">
      <span className="font-mono text-[11px] tracking-[0.1em] text-butter-ink uppercase">{eyebrow}</span>
      <p className="m-0 text-small text-ink">{children}</p>
    </div>
  );
}
