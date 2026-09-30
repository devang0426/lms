import { SidebarShell } from "@/components/shell/sidebar-shell";
import { toMenuUser } from "@/components/shell/shell-user";
import { Badge } from "@/components/ui";
import { requireAreaRole } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo/accounts";

/* Teaching area. Admin is also the demo instructor: their sidebar starts
   with the Teaching / Admin switch instead of the badge (feature 28). A
   student is sent back to /. */
export default async function InstructorLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAreaRole("instructor", "admin");
  const admin = user.role === "admin";
  return (
    <SidebarShell
      areas={["instructor"]}
      homeHref="/instructor"
      user={toMenuUser(user)}
      demoMode={isDemoMode()}
      areaSwitch={admin}
      viewAsStudent
      badge={admin ? undefined : <Badge tone="success" size="md">Teaching mode</Badge>}
    >
      {children}
    </SidebarShell>
  );
}
