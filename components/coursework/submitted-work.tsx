import { Download, FileText } from "lucide-react";
import { Icon } from "@/components/ui";
import { formatBytes } from "@/lib/documents/view";

/* What a student handed in, read-only (feature 20): their answer and
   their files. Files link to /submissions/[id]/files/[n], which checks
   access before redirecting, so no Blob URL is ever in the page. */

export interface SubmittedFileView {
  name: string;
  contentType: string;
  size: number;
}

export function SubmittedWork({ submissionId, text, files }: { submissionId: string; text: string; files: SubmittedFileView[] }) {
  return (
    <div className="flex flex-col gap-4">
      {text.trim() ? (
        <p className="m-0 rounded-2xl bg-oat px-5 py-4 text-[15px] leading-[1.6] break-words whitespace-pre-wrap">{text}</p>
      ) : (
        <p className="m-0 text-small text-ink-soft">No written answer.</p>
      )}
      {files.length > 0 && (
        <ul className="m-0 flex list-none flex-col p-0" aria-label="Files handed in">
          {files.map((f, i) => {
            const href = `/submissions/${submissionId}/files/${i}`;
            return (
              <li key={`${i}-${f.name}`} className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-2.5 last:border-b-0">
                <a href={href} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2.5 text-[15px] text-ink no-underline hover:text-terracotta">
                  <Icon icon={FileText} size={16} className="shrink-0 text-ink-soft" />
                  <span className="truncate">{f.name}</span>
                  <span className="shrink-0 text-meta text-ink-soft">{formatBytes(f.size)}</span>
                </a>
                <a
                  href={`${href}?download=1`}
                  aria-label={`Download ${f.name}`}
                  className="flex items-center gap-1.5 text-meta text-terracotta underline underline-offset-4 hover:text-terracotta-hover"
                >
                  <Icon icon={Download} size={14} />
                  Download
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
