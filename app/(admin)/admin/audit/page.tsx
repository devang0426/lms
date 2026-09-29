import Link from "next/link";
import { LocalDate } from "@/components/coursework/local-date";
import { PageHeader } from "@/components/shell/page-header";
import { Button, Card, EmptyState, Field, SearchField, Select } from "@/components/ui";
import { requireAreaRole } from "@/lib/auth";
import { auditVocabulary, listAudit } from "@/lib/db/audit";
import { isUuid } from "@/lib/db/courses";

export const metadata = { title: "Audit log · Studyhall" };

const PAGE = 50;

/* The audit log (feature 22, admins only), newest first, filtered by
   action, what it was about, and who did it (?action=, ?entity=, ?actor=).
   "Older" pages with ?before=. Rows about students' private notes carry
   ids only (feature 19). */
export default async function AuditLogPage({ searchParams }: PageProps<"/admin/audit">) {
  await requireAreaRole("admin");
  const sp = await searchParams;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 100) : undefined);
  const action = str(sp.action);
  const entityType = str(sp.entity);
  const actor = str(sp.actor);
  // ?before=<row id>: the last row of the previous page.
  const before = isUuid(sp.before) ? sp.before : undefined;

  const [rows, vocab] = await Promise.all([listAudit({ action, entityType, actor, beforeId: before, limit: PAGE }), auditVocabulary()]);
  const olderHref = (() => {
    const last = rows[rows.length - 1];
    if (rows.length < PAGE || !last) return null;
    const p = new URLSearchParams();
    if (action) p.set("action", action);
    if (entityType) p.set("entity", entityType);
    if (actor) p.set("actor", actor);
    p.set("before", last.id);
    return `/admin/audit?${p.toString()}`;
  })();
  const filtered = Boolean(action || entityType || actor || before);

  return (
    <>
      <PageHeader eyebrow="Admin" title="Audit log" />
      <form action="/admin/audit" method="get" className="grid items-end gap-3 md:grid-cols-[1fr_1fr_1.2fr_auto]">
        <Field label="Action" htmlFor="audit-action">
          <Select id="audit-action" name="action" defaultValue={action ?? ""}>
            <option value="">Any action</option>
            {vocab.actions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="About" htmlFor="audit-entity">
          <Select id="audit-entity" name="entity" defaultValue={entityType ?? ""}>
            <option value="">Anything</option>
            {vocab.entityTypes.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Who" htmlFor="audit-actor">
          <SearchField id="audit-actor" name="actor" defaultValue={actor ?? ""} placeholder="Name or email" aria-label="Who did it" />
        </Field>
        <div className="flex gap-2">
          <Button type="submit" variant="secondary" size="md">
            Filter
          </Button>
          {filtered && (
            <Button asChild variant="link" size="md">
              <Link href="/admin/audit">Clear</Link>
            </Button>
          )}
        </div>
      </form>

      <Card padded={false} className="overflow-x-auto">
        {rows.length === 0 ? (
          <EmptyState title="Nothing matches" description="Try a different action, or clear the filters." />
        ) : (
          <table className="w-full min-w-[820px] border-collapse text-small">
            <thead>
              <tr className="bg-oat text-left font-mono text-[11px] tracking-[0.08em] text-ink-soft uppercase">
                <th className="px-[22px] py-2.5 font-normal">When</th>
                <th className="px-4 py-2.5 font-normal">Who</th>
                <th className="px-4 py-2.5 font-normal">Action</th>
                <th className="px-4 py-2.5 font-normal">About</th>
                <th className="px-4 py-2.5 font-normal">Details</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-line align-top">
                  <td className="px-[22px] py-3 whitespace-nowrap text-ink-soft">
                    <LocalDate at={r.createdAt.getTime()} />
                  </td>
                  <td className="px-4 py-3">
                    {r.actorName ? (
                      <span className="flex flex-col">
                        <span>{r.actorName}</span>
                        <span className="text-[12px] text-ink-soft">{r.actorEmail}</span>
                      </span>
                    ) : (
                      <span className="text-ink-soft">System</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-[12px]">{r.action}</td>
                  <td className="px-4 py-3">
                    <span className="flex flex-col">
                      <span>{r.entityType}</span>
                      {r.entityId && <span className="font-mono text-[11px] break-all text-ink-soft">{r.entityId}</span>}
                    </span>
                  </td>
                  <td className="max-w-[340px] px-4 py-3">
                    {r.data ? (
                      <pre className="m-0 font-mono text-[11px] leading-[1.5] break-all whitespace-pre-wrap text-ink-soft">
                        {JSON.stringify(r.data, null, 1)}
                      </pre>
                    ) : (
                      <span className="text-ink-soft">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {olderHref && (
        <Button asChild variant="quiet" size="sm" className="self-center">
          <Link href={olderHref}>Older entries</Link>
        </Button>
      )}
    </>
  );
}
