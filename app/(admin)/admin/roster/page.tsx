import { RosterImport } from "@/components/admin/roster-import";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui";
import { requireAreaRole } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo/accounts";
import { ROSTER_HEADER, ROSTER_LIMITS } from "@/lib/roster";

export const metadata = { title: "Roster import · Studyhall" };

/* CSV roster import (feature 22, admins only). */
export default async function RosterPage() {
  await requireAreaRole("admin");
  return (
    <>
      <PageHeader eyebrow="Admin" title="Roster import" />
      {isDemoMode() && (
        <p className="m-0 rounded-xl bg-butter-tint px-4 py-2.5 text-small text-butter-ink">
          Demo mode: <strong>Check file</strong> works, but <strong>Import</strong> is turned off.
        </p>
      )}
      <Card variant="sunken" className="gap-3">
        <p className="m-0 text-small">
          One row per person and course, with this header. Courses are matched by code in the current term. A student&rsquo;s
          section is created if the course doesn&rsquo;t have it yet. People without an account get an invitation email and join
          their courses when they first sign in. Up to {ROSTER_LIMITS.rows} rows per file.
        </p>
        <pre className="m-0 overflow-x-auto rounded-xl bg-paper px-4 py-3 font-mono text-[12px] leading-[1.6]">
          {`${ROSTER_HEADER.join(",")}
aanya.sharma@uni.edu,Aanya Sharma,student,MATH 201,Section A
r.iyer@uni.edu,Rohan Iyer,student,MATH 201,Section B
meera.rao@uni.edu,Prof. Meera Rao,instructor,MATH 201,`}
        </pre>
        <p className="m-0 text-meta text-ink-soft">Roles: student or instructor. Make admins on the Users page.</p>
      </Card>
      <RosterImport />
    </>
  );
}
