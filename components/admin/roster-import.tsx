"use client";

import { FileUp } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { importRoster, previewRoster } from "@/app/(admin)/admin/roster/actions";
import { Badge, Button, Card, Icon, Textarea, toast, type BadgeTone } from "@/components/ui";
import { ROSTER_HEADER, ROSTER_LIMITS } from "@/lib/roster";
import type { PlanRow, RosterPlan, RowOutcome } from "@/lib/roster/import";

/* Roster import (feature 22): choose a CSV (or paste it), check it, then
   import. The preview says what each row will do; bad rows are shown with
   their reason and skipped, the good ones are imported. The server checks
   everything again on import. */

const OUTCOME: Record<RowOutcome, { label: string; tone: BadgeTone }> = {
  enroll: { label: "Enroll", tone: "success" },
  teach: { label: "Teach", tone: "success" },
  invite: { label: "Invite", tone: "new" },
  skip: { label: "No change", tone: "neutral" },
  error: { label: "Error", tone: "warning" },
};

export function RosterImport() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [plan, setPlan] = useState<RosterPlan | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const actionable = plan ? plan.counts.enroll + plan.counts.teach + plan.counts.invite : 0;

  function readFile(file: File | undefined) {
    if (!file) return;
    if (file.size > ROSTER_LIMITS.bytes) return setError("That file is over 200 KB. Split it into smaller files.");
    void file.text().then((text) => {
      setCsv(text);
      setFileName(file.name);
      setPlan(null);
      setDone(false);
      setError(null);
    });
  }

  function run(kind: "preview" | "import") {
    setError(null);
    start(async () => {
      try {
        const res = kind === "preview" ? await previewRoster({ csv }) : await importRoster({ csv });
        if (!res.ok) {
          setPlan(null);
          return setError(res.error.message);
        }
        setPlan(res.data);
        setDone(kind === "import");
        if (kind === "import") {
          const c = res.data.counts;
          toast.success(`Imported: ${c.enroll} enrolled, ${c.teach} added as staff, ${c.invite} invited.`);
        }
      } catch {
        setError("Something went wrong. Try again in a moment.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            aria-label="Choose a roster CSV"
            onChange={(e) => {
              readFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <Button variant="secondary" size="sm" leading={<Icon icon={FileUp} size={16} />} onClick={() => fileInput.current?.click()}>
            Choose CSV
          </Button>
          <span className="text-small text-ink-soft">{fileName ?? "or paste it below"}</span>
        </div>
        <label htmlFor="roster-csv" className="sr-only">
          Roster CSV
        </label>
        <Textarea
          id="roster-csv"
          rows={8}
          value={csv}
          onChange={(e) => {
            setCsv(e.target.value);
            setFileName(null);
            setPlan(null);
            setDone(false);
          }}
          placeholder={`${ROSTER_HEADER.join(",")}\naanya@uni.edu,Aanya Sharma,student,MATH 201,Section A`}
          className="font-mono text-[13px]"
          spellCheck={false}
        />
        {error && (
          <p role="alert" className="m-0 rounded-xl bg-clay px-3.5 py-2.5 text-small text-clay-ink">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2.5">
          <Button variant="quiet" size="sm" loading={pending && !plan} disabled={!csv.trim() || pending} onClick={() => run("preview")}>
            Check file
          </Button>
          <Button size="sm" loading={pending && Boolean(plan)} disabled={!plan || done || actionable === 0 || pending} onClick={() => run("import")}>
            {plan && !done ? `Import ${actionable} ${actionable === 1 ? "row" : "rows"}` : "Import"}
          </Button>
        </div>
      </Card>

      {plan && <PlanTable plan={plan} done={done} />}
    </div>
  );
}

function PlanTable({ plan, done }: { plan: RosterPlan; done: boolean }) {
  const { counts } = plan;
  return (
    <section aria-label={done ? "Import results" : "Preview"} className="flex flex-col gap-3">
      <p className="m-0 text-small" aria-live="polite">
        {done ? "Imported. " : "Nothing is saved yet. "}
        {counts.enroll} to enroll, {counts.teach} to add as staff, {counts.invite} to invite, {counts.skip} unchanged
        {counts.error > 0 && (
          <>
            , <strong className="text-terracotta">{counts.error} with errors (skipped)</strong>
          </>
        )}
        .
      </p>
      <Card padded={false} className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-small">
          <thead>
            <tr className="bg-oat text-left font-mono text-[11px] tracking-[0.08em] text-ink-soft uppercase">
              <th className="px-4 py-2.5 font-normal">Line</th>
              <th className="px-4 py-2.5 font-normal">Row</th>
              <th className="px-4 py-2.5 font-normal">Result</th>
              <th className="px-4 py-2.5 font-normal">What happens</th>
            </tr>
          </thead>
          <tbody>
            {plan.rows.map((r: PlanRow) => (
              <tr key={r.line} className="border-t border-line align-top">
                <td className="px-4 py-3 font-mono text-meta text-ink-soft">{r.line}</td>
                <td className="max-w-[320px] px-4 py-3 font-mono text-[12px] break-words">{r.cells.join(", ")}</td>
                <td className="px-4 py-3">
                  <Badge tone={OUTCOME[r.outcome].tone} size="md">
                    {OUTCOME[r.outcome].label}
                  </Badge>
                </td>
                <td className={r.outcome === "error" ? "px-4 py-3 text-terracotta" : "px-4 py-3"}>
                  {r.message}
                  {r.notes.map((n) => (
                    <span key={n} className="block text-meta text-ink-soft">
                      {n}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </section>
  );
}
