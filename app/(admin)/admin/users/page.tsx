import Link from "next/link";
import { InviteUserDialog, RevokeInvitationButton, RoleSelect } from "@/components/admin/user-controls";
import { LocalDate } from "@/components/coursework/local-date";
import { PageHeader } from "@/components/shell/page-header";
import { Badge, Card, CardHeader, Chip, DataTable, Person, SearchField } from "@/components/ui";
import { requireAreaRole } from "@/lib/auth";
import { pendingInvitations } from "@/lib/db/invitations";
import { ROLES, type Role } from "@/lib/db/schema";
import { listUsers, roleCounts } from "@/lib/db/users";

export const metadata = { title: "Users · Studyhall" };

/* Users and roles (feature 22, admins only): search, filter by role,
   change a role (Clerk first, then the Neon mirror, audited), invite by
   email, and the invitations nobody has accepted yet. ?q= and ?role= are
   in the URL. */
export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  const admin = await requireAreaRole("admin");
  const { q: rawQ, role: rawRole } = await searchParams;
  const q = typeof rawQ === "string" ? rawQ.slice(0, 100) : "";
  const role = (ROLES as readonly string[]).includes(String(rawRole)) ? (rawRole as Role) : undefined;

  const [people, counts, pending] = await Promise.all([listUsers({ q, role }), roleCounts(), pendingInvitations()]);
  const total = counts.admin + counts.instructor + counts.student;
  const href = (r?: Role) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (r) p.set("role", r);
    const s = p.toString();
    return s ? `/admin/users?${s}` : "/admin/users";
  };
  const filters: { value?: Role; label: string }[] = [
    { label: `All · ${total}` },
    { value: "student", label: `Students · ${counts.student}` },
    { value: "instructor", label: `Instructors · ${counts.instructor}` },
    { value: "admin", label: `Admins · ${counts.admin}` },
  ];

  return (
    <>
      <PageHeader eyebrow="Admin" title="Users" actions={<InviteUserDialog />} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by role">
          {filters.map((f) => (
            <Chip key={f.label} asChild active={f.value === role} className="h-[34px] px-3.5">
              <Link href={href(f.value)} aria-current={f.value === role ? "true" : undefined} scroll={false}>
                {f.label}
              </Link>
            </Chip>
          ))}
        </div>
        <form action="/admin/users" method="get" role="search">
          {role && <input type="hidden" name="role" value={role} />}
          <SearchField name="q" defaultValue={q} placeholder="Search name or email…" aria-label="Search users" className="w-[280px]" />
        </form>
      </div>

      <Card padded={false} className="overflow-x-auto">
        <DataTable
          className="min-w-[720px]"
          rows={people}
          rowKey={(u) => u.id}
          empty={q ? `Nobody matches “${q}”.` : "No users yet."}
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
            { key: "joined", header: "Joined", width: "1fr", cell: (u) => <LocalDate at={u.createdAt.getTime()} dateOnly /> },
          ]}
        />
      </Card>
      {people.length === 200 && <p className="m-0 text-meta text-ink-soft">Showing the first 200. Search to narrow it down.</p>}

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
