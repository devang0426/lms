import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { UserMenu, type MenuUser } from "@/components/auth/user-menu";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { Icon, Logo } from "@/components/ui";

/* Top-nav shell for full-width pages (course detail): 72px header with the
   logo, "Back to Explore", "My learning" and the avatar menu. No sidebar. */
export function TopNavShell({
  user,
  demoMode,
  children,
}: {
  user: MenuUser;
  demoMode: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-[72px] shrink-0 items-center justify-between gap-4 border-b border-line px-5 md:px-20">
        <span className="flex min-w-0 items-center gap-6 md:gap-10">
          <Link href="/" aria-label="Studyhall home" className="text-ink no-underline hover:text-ink">
            <Logo size="sm" wordmark={false} className="md:hidden" />
            <Logo size="sm" className="hidden md:inline-flex" />
          </Link>
          <Link
            href="/catalog"
            className="flex items-center gap-2 text-[15px] text-ink-soft no-underline hover:text-ink"
          >
            <Icon icon={ArrowLeft} size={16} />
            Back to Explore
          </Link>
        </span>
        <span className="flex items-center gap-5">
          <Link
            href="/courses"
            className="hidden text-[15px] font-medium text-ink no-underline hover:text-terracotta sm:inline"
          >
            My learning
          </Link>
          <NotificationBell />
          <UserMenu user={user} demoMode={demoMode} variant="avatar" />
        </span>
      </header>
      <main className="flex min-w-0 flex-1 flex-col gap-8 px-5 py-8 md:px-20 md:py-12">{children}</main>
    </div>
  );
}
