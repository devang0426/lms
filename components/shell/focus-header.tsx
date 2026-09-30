import { ArrowLeft, Check } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { UserMenu } from "@/components/auth/user-menu";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { Button, Icon, ProgressBar } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo/accounts";
import { toMenuUser } from "./shell-user";

/* Lesson player header (focus mode, 68px): back, course and module on the
   left; course progress, "7 / 12", "Mark complete", the bell and the
   account menu on the right (feature 28: the player had no way to either).
   The page renders it because every value is lesson data; the user comes
   from lib/auth's per-request cache, so it costs no query. `completeAction`
   is the Mark complete control (feature 12 wires it); without one a
   disabled button is shown. */
export async function FocusHeader({
  backHref,
  courseName,
  moduleTitle,
  done,
  total,
  completeAction,
}: {
  backHref: string;
  courseName: string;
  moduleTitle: string;
  done: number;
  total: number;
  completeAction?: ReactNode;
}) {
  const user = await getCurrentUser();
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <header className="flex h-[68px] shrink-0 items-center justify-between gap-3 border-b border-line bg-paper px-4 md:gap-4 md:px-6">
      <span className="flex min-w-0 items-center gap-3">
        <Button asChild variant="icon" size="sm" aria-label="Back to course">
          <Link href={backHref}>
            <Icon icon={ArrowLeft} />
          </Link>
        </Button>
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-mono text-[11px] tracking-[0.1em] text-ink-soft uppercase">
            {courseName}
          </span>
          <span className="truncate text-[15px] font-medium">{moduleTitle}</span>
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2 md:gap-4">
        <ProgressBar value={pct} className="hidden w-40 md:block" label="Course progress" />
        <span className="hidden font-mono text-meta text-ink-soft sm:inline">
          {done} / {total}
        </span>
        {completeAction ?? (
          <Button variant="success" size="sm" leading={<Icon icon={Check} size={16} />} disabled>
            <span className="hidden sm:inline">Mark complete</span>
            <span className="sm:hidden">Done</span>
          </Button>
        )}
        {user && (
          <>
            <NotificationBell />
            <UserMenu
              user={toMenuUser(user)}
              demoMode={isDemoMode()}
              variant="avatar"
              profile={user.role === "student"}
              viewAsStudent={false}
            />
          </>
        )}
      </span>
    </header>
  );
}
