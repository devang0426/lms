import Link from "next/link";
import { DeleteUserButton, InviteUserDialog, RevokeInvitationButton, RoleSelect } from "@/components/admin/user-controls";
import { LocalDate } from "@/components/coursework/local-date";
import { PageHeader } from "@/components/shell/page-header";
import { Badge, Card, CardHeader, Chip, DataTable, Person, SearchField } from "@/components/ui";
import { deleteRefusal } from "@/lib/account/rules";
import { aiLimitsFor, atLimit, nearLimit, type AiLimits } from "@/lib/ai/budget";
import { requireAreaRole } from "@/lib/auth";
import { pendingInvitations } from "@/lib/db/invitations";
import { ROLES, type Role } from "@/lib/db/schema";
import { countAtAiLimit, listUsers, roleCounts, type UserRow } from "@/lib/db/users";
import { DEMO_ACCOUNT_EMAILS, isDemoMode } from "@/lib/demo/accounts";

export const metadata = { title: "Users · Studyhall" };

/* Users and roles (feature 22, admins only): search, filter by role,
   change a role (Clerk first, then the Neon mirror, audited), invite by
   email, and the invitations nobody has accepted yet. "AI today" is each
   person's AI calls and cost over the last 24 hours, against their daily
   limit (feature 25). Delete removes an account (feature 33): Clerk
   first, then the erase-user task. ?q=, ?role= and ?ai=limit are in the
   URL. */
export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  const admin = await requireAreaRole("admin");
  const { q: rawQ, role: rawRole, ai: rawAi } = await searchParams;
  const q = typeof rawQ === "string" ? rawQ.slice(0, 100) : "";
  const role = (ROLES as readonly string[]).includes(String(rawRole)) ? (rawRole as Role) : undefined;
  const onlyAtLimit = rawAi === "limit";
  const limits = { student: aiLimitsFor("student"), staff: aiLimitsFor("instructor") };

  const [people, counts, pending, atLimitCount] = await Promise.all([
    listUsers({ q, role, atAiLimit: onlyAtLimit ? limits : undefined }),
    roleCounts(),
    pendingInvitations(),
    countAtAiLimit(limits),
  ]);
  const total = counts.admin + counts.instructor + counts.student;
  const href = (r: Role | undefined, ai = onlyAtLimit) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (r) p.set("role", r);
    if (ai) p.set("ai", "limit");
    const s = p.toString();
    return s ? `/admin/users?${s}` : "/admin/users";
  };
  const limitsOf = (u: UserRow): AiLimits => (u.role === "student" ? limits.student : limits.staff);
  const demo = { on: isDemoMode(), emails: DEMO_ACCOUNT_EMAILS };
  const filters: { value?: Role; label: string }[] = [
    { label: `All · ${total}` },
    { value: "student", label: `Students · ${counts.student}` },
    { value: "instructor", label: `Instructors · ${counts.instructor}` },
    { value: "admin", label: `Admins · ${counts.admin}` },
  ];

  return (
    <>
      <PageHeader eyebrow="Admin" title="Users" actions={<InviteUserDialog />} />
      {isDemoMode() && (
        <p className="m-0 rounded-xl bg-butter-tint px-4 py-2.5 text-small text-butter-ink">
          Demo mode: role changes and invitations are turned off, so nothing done here outlasts the demo.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by role">
            {filters.map((f) => (
              <Chip key={f.label} asChild active={f.value === role} className="h-[34px] px-3.5">
                <Link href={href(f.value)} aria-current={f.value === role ? "true" : undefined} scroll={false}>
                  {f.label}
                </Link>
              </Chip>
            ))}
          </div>
          <Chip asChild active={onlyAtLimit} className="h-[34px] px-3.5">
            <Link href={href(role, !onlyAtLimit)} aria-current={onlyAtLimit ? "true" : undefined} scroll={false}>
              At AI limit · {atLimitCount}
            </Link>
          </Chip>
        </div>
        <form action="/admin/users" method="get" role="search">
          {role && <input type="hidden" name="role" value={role} />}
          {onlyAtLimit && <input type="hidden" name="ai" value="limit" />}
          <SearchField name="q" defaultValue={q} placeholder="Search name or email…" aria-label="Search users" className="w-[280px]" />
        </form>
      </div>

      <Card padded={false} className="overflow-x-auto">
        <DataTable
          className="min-w-[960px]"
          rows={people}
          rowKey={(u) => u.id}
          empty={q ? `Nobody matches “${q}”.` : onlyAtLimit ? "Nobody is at their AI limit." : "No users yet."}
          columns={[
            { key: "person", header: "Person", width: "2.4fr", cell: (u) => <Person name={u.name} role={u.email} src={u.imageUrl} className="min-w-0" /> },
            { key: "role", header: "Role", width: "1.2fr", cell: (u) => <RoleSelect userId={u.id} name={u.name} role={u.role} self={u.id === admin.id} /> },
            {
              key: "courses",
              header: "Courses",
              width: "1.2fr",
              cell: (u) =>
                [u.courses ? `${u.courses} enrolled` : null, u.teaching ? `teaches ${u.teaching}` : null].filter(Boolean).join(" · ") || (
                  <span className="text-ink-soft">—</span>
                ),
            },
            {
              key: "ai",
              header: "AI today",
              width: "1.3fr",
              cell: (u) => {
                const usage = { calls: u.aiCalls, usd: u.aiUsd };
                const flag = atLimit(usage, limitsOf(u)) ? "At limit" : nearLimit(usage, limitsOf(u)) ? "Near limit" : null;
                return (
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="tabular-nums">
                      {u.aiCalls} {u.aiCalls === 1 ? "call" : "calls"} · {usd(u.aiUsd)}
                    </span>
                    {flag && (
                      <Badge tone={flag === "At limit" ? "new" : "warning"} size="sm">
                        {flag}
                      </Badge>
                    )}
                  </span>
                );
              },
            },
            { key: "joined", header: "Joined", width: "1fr", cell: (u) => <LocalDate at={u.createdAt.getTime()} dateOnly /> },
            {
              key: "delete",
              header: "",
              width: "auto",
              cell: (u) => <DeleteUserButton userId={u.id} name={u.name} email={u.email} refusal={deleteRefusal(u, admin, demo)} />,
            },
          ]}
        />
      </Card>
      <p className="m-0 text-meta text-ink-soft">
        AI today counts the last 24 hours. Daily limits: students {limitLabel(limits.student)}, staff {limitLabel(limits.staff)}.
        {people.length === 200 && " Showing the first 200: search to narrow it down."}
      </p>

      <section aria-labelledby="pending" className="flex flex-col gap-4">
        <CardHeader title={<span id="pending">Pending invitations</span>} />
        <Card padded={false} className="overflow-x-auto">
          <DataTable
            className="min-w-[640px]"
            rows={pending}
            rowKey={(p) => p.email}
            empty="No invitations waiting. People you invite show here until they sign up."
            columns={[
              {
                key: "who",
                header: "Invited",
                width: "2.2fr",
                cell: (p) => (
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[15px] font-medium">{p.name}</span>
                    <span className="truncate text-meta text-ink-soft">{p.email}</span>
                  </span>
                ),
              },
              { key: "role", header: "Role", width: "1fr", cell: (p) => <Badge tone="neutral" size="md">{p.role}</Badge> },
              { key: "places", header: "Courses", width: "1.6fr", cell: (p) => p.places.join(", ") || <span className="text-ink-soft">—</span> },
              { key: "when", header: "Sent", width: "1fr", cell: (p) => <LocalDate at={p.invitedAt.getTime()} dateOnly /> },
              { key: "revoke", header: "", width: "auto", cell: (p) => <RevokeInvitationButton email={p.email} /> },
            ]}
          />
        </Card>
      </section>
    </>
  );
}

/* "$0", "<$0.01", "$0.12". */
function usd(amount: number): string {
  if (amount === 0) return "$0";
  return amount < 0.01 ? "<$0.01" : `$${amount.toFixed(2)}`;
}

function limitLabel(l: AiLimits): string {
  return `${l.calls.toLocaleString("en-GB")} ${l.calls === 1 ? "call" : "calls"} or $${l.usd}`;
}
