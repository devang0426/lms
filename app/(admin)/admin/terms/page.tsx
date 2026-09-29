import { MakeCurrentButton, NewTermDialog } from "@/components/admin/term-controls";
import { PageHeader } from "@/components/shell/page-header";
import { Badge, Card, DataTable } from "@/components/ui";
import { requireAreaRole } from "@/lib/auth";
import { listTerms } from "@/lib/db/terms";

export const metadata = { title: "Terms · Studyhall" };

const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/* Academic terms (feature 22, admins only): add one, make one current. */
export default async function TermsPage() {
  await requireAreaRole("admin");
  const rows = await listTerms();

  return (
    <>
      <PageHeader eyebrow="Admin" title="Terms" actions={<NewTermDialog />} />
      <Card padded={false} className="overflow-x-auto">
        <DataTable
          className="min-w-[600px]"
          rows={rows}
          rowKey={(t) => t.id}
          empty="No terms yet."
          columns={[
            { key: "name", header: "Term", width: "1.6fr", cell: (t) => <span className="text-[15px] font-medium">{t.name}</span> },
            { key: "dates", header: "Dates", width: "2fr", cell: (t) => `${fmt(t.startsOn)} – ${fmt(t.endsOn)}` },
            { key: "courses", header: "Courses", width: "0.8fr", cell: (t) => t.courses },
            {
              key: "current",
              header: "",
              width: "1.2fr",
              cell: (t) =>
                t.isCurrent ? (
                  <Badge tone="success" size="md">
                    Current
                  </Badge>
                ) : (
                  <MakeCurrentButton id={t.id} name={t.name} />
                ),
            },
          ]}
        />
      </Card>
      <p className="m-0 text-meta text-ink-soft">The current term&rsquo;s courses show in the catalog, and the roster import matches course codes in it.</p>
    </>
  );
}
