import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { SignOutActions } from "@/components/auth/sign-out-actions";
import { NAV } from "@/components/shell/nav-config";
import { PageHeader } from "@/components/shell/page-header";
import { toMenuUser } from "@/components/shell/shell-user";
import { Card, CardHeader, Icon, Person } from "@/components/ui";
import { requireAreaRole } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo/accounts";

export const metadata = { title: "Profile · Studyhall" };

/* The fourth mobile tab. Holds the account menu and the sections that
   don't fit in the tab bar (Calendar, Discussions, Progress, My space). */
const TAB_BAR_HREFS = new Set(["/", "/catalog", "/courses"]);

export default async function ProfilePage() {
  const user = await requireAreaRole("student", "admin");
  const menuUser = toMenuUser(user);
  const more = NAV.student.items.filter((i) => !TAB_BAR_HREFS.has(i.href));

  return (
    <>
      <PageHeader eyebrow="Profile" title={<em>{user.name}</em>} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="gap-5">
          <Person name={menuUser.name} role={menuUser.roleLabel} src={menuUser.imageUrl} />
          <p className="m-0 truncate text-small text-ink-soft">{user.email}</p>
          <SignOutActions demoMode={isDemoMode()} />
        </Card>
        <Card className="gap-2">
          <CardHeader title="More" />
          <ul className="m-0 flex list-none flex-col p-0">
            {more.map((item) => (
              <li key={item.href} className="border-b border-line last:border-b-0">
                <Link
                  href={item.href}
                  className="flex h-12 items-center gap-3 text-[15px] text-ink no-underline hover:text-terracotta"
                >
                  <Icon icon={item.icon} className="text-ink-soft" />
                  <span className="grow">{item.label}</span>
                  <Icon icon={ChevronRight} size={16} className="text-ink-soft" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
