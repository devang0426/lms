import { SidebarShell } from "@/components/shell/sidebar-shell";
import { toMenuUser } from "@/components/shell/shell-user";
import { Badge } from "@/components/ui";
import { requireAreaRole } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo/accounts";

/* Teaching area. Admin is also the demo instructor, so their sidebar shows
   the Admin section too. A student is sent back to /. */
export default async function InstructorLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAreaRole("instructor", "admin");
  return (
    <SidebarShell
      areas={user.role === "admin" ? ["instructor", "admin"] : ["instructor"]}
      homeHref="/instructor"
      user={toMenuUser(user)}
      demoMode={isDemoMode()}
      badge={<Badge tone="success" size="md">Teaching mode</Badge>}
    >
      {children}
    </SidebarShell>
  );
}
