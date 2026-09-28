import { NoticeCard, SidebarShell } from "@/components/shell/sidebar-shell";
import { toMenuUser } from "@/components/shell/shell-user";
import { requireAreaRole } from "@/lib/auth";
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
      notice={<NoticeCard eyebrow="This week">Nothing due yet. Deadlines will show up here.</NoticeCard>}
    >
      {children}
    </SidebarShell>
  );
}
