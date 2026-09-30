import { SidebarShell } from "@/components/shell/sidebar-shell";
import { toMenuUser } from "@/components/shell/shell-user";
import { requireAreaRole } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo/accounts";

/* Admin area: admins only. Anyone else goes to their own home. The
   Teaching / Admin switch says which side this is (feature 28). */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAreaRole("admin");
  return (
    <SidebarShell
      areas={["admin"]}
      homeHref="/instructor"
      user={toMenuUser(user)}
      demoMode={isDemoMode()}
      areaSwitch
      viewAsStudent
    >
      {children}
    </SidebarShell>
  );
}
