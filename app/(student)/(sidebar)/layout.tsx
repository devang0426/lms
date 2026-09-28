import Link from "next/link";
import { Suspense } from "react";
import { NoticeCard, SidebarShell } from "@/components/shell/sidebar-shell";
import { toMenuUser } from "@/components/shell/shell-user";
import { requireAreaRole } from "@/lib/auth";
import { dueCountsByCourse } from "@/lib/db/study";
import { isDemoMode } from "@/lib/demo/accounts";

export default async function StudentShellLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAreaRole("student", "admin");
  return (
    <SidebarShell
      areas={["student"]}
      homeHref="/"
      user={toMenuUser(user)}
      demoMode={isDemoMode()}
      tabBar
      notice={
        // Streams in after the page, so the count never slows navigation.
        <Suspense fallback={<WeekNotice />}>
          <DueNotice userId={user.id} />
        </Suspense>
      }
    >
      {children}
    </SidebarShell>
  );
}

function WeekNotice() {
  return <NoticeCard eyebrow="This week">Nothing due yet. Deadlines will show up here.</NoticeCard>;
}

/* "N cards due today" (feature 15). */
async function DueNotice({ userId }: { userId: string }) {
  const due = (await dueCountsByCourse(userId)).reduce((sum, c) => sum + c.due, 0);
  if (due === 0) return <WeekNotice />;
  return (
    <NoticeCard eyebrow="Today">
      <Link href="/study" className="font-medium text-ink underline underline-offset-4 hover:text-terracotta">
        {due} {due === 1 ? "card" : "cards"} due today
      </Link>
      . A few minutes of review keeps them fresh.
    </NoticeCard>
  );
}
