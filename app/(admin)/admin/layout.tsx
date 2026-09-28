import { SidebarShell } from "@/components/shell/sidebar-shell";
import { toMenuUser } from "@/components/shell/shell-user";
import { Badge } from "@/components/ui";
import { requireAreaRole } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo/accounts";

/* Admin area: admins only. Anyone else goes to their own home. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAreaRole("admin");
  return (
    <SidebarShell
      areas={["instructor", "admin"]}
      homeHref="/instructor"
      user={toMenuUser(user)}
      demoMode={isDemoMode()}
      badge={<Badge tone="neutral" size="md">Admin</Badge>}
    >
      {children}
    </SidebarShell>
  );
}
