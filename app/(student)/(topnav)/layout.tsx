import { TopNavShell } from "@/components/shell/top-nav-shell";
import { toMenuUser } from "@/components/shell/shell-user";
import { requireAreaRole } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo/accounts";

export default async function TopNavLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAreaRole("student", "admin");
  return (
    <TopNavShell user={toMenuUser(user)} demoMode={isDemoMode()}>
      {children}
    </TopNavShell>
  );
}
