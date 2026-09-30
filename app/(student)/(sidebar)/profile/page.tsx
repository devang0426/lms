import { DataExportCard, type ExportCardView } from "@/components/account/data-export-card";
import { SignOutActions } from "@/components/auth/sign-out-actions";
import { PageHeader } from "@/components/shell/page-header";
import { toMenuUser } from "@/components/shell/shell-user";
import { Card, Person } from "@/components/ui";
import { exportCardFor, type ExportCard } from "@/lib/account/export";
import { requireAreaRole } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo/accounts";
import { requestTime } from "@/lib/utils/clock";

export const metadata = { title: "Profile · Studyhall" };

/* The account: who's signed in, signing out, and (feature 33) downloading
   a copy of your data. On phones it's in the tab bar's More sheet; on
   desktop, in the account menu (feature 28). */
export default async function ProfilePage() {
  const user = await requireAreaRole("student", "admin");
  const menuUser = toMenuUser(user);
  const card = await exportCardFor(user, new Date(requestTime()));

  return (
    <>
      <PageHeader eyebrow="Profile" title={<em>{user.name}</em>} />
      <Card className="max-w-[560px] gap-5">
        <Person name={menuUser.name} role={menuUser.roleLabel} src={menuUser.imageUrl} />
        <p className="m-0 truncate text-small text-ink-soft">{user.email}</p>
        <SignOutActions demoMode={isDemoMode()} />
      </Card>
      <DataExportCard view={toView(card)} />
    </>
  );
}

function toView(card: ExportCard): ExportCardView {
  const p = card.phase;
  switch (p.phase) {
    case "none":
      return { phase: "none" };
    case "building":
      return { phase: "building", run: card.run };
    case "ready":
      return { phase: "ready", exportId: card.exportId ?? "", expiresAt: p.expiresAt.getTime(), sizeBytes: p.sizeBytes };
    case "failed":
      return { phase: "failed", message: p.message };
    default: {
      const never: never = p;
      throw new Error(`Unknown export phase ${JSON.stringify(never)}`);
    }
  }
}
