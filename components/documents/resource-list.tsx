import { Download, ExternalLink, FileText, Headphones, Link2, PlayCircle } from "lucide-react";
import { Badge, Button, EmptyState, Icon } from "@/components/ui";
import { documentDownloadHref, documentHref, documentMeta, KIND_LABELS, type DocumentView } from "@/lib/documents/view";

/* The lesson player's Resources tab, and a reading lesson's material
   (feature 18). Links open /documents/[id], which checks access before
   redirecting to the file; no file URL is in the page. Staff previewing a
   lesson also see documents that aren't ready yet. */

const kindIcon = { pdf: FileText, docx: FileText, url: Link2, audio: Headphones, youtube: PlayCircle } as const;

export function ResourceList({ documents, emptyText }: { documents: DocumentView[]; emptyText?: string }) {
  if (documents.length === 0) {
    return <EmptyState title="No resources yet" description={emptyText ?? "Slides, readings and files for this lesson will be listed here."} />;
  }
  return (
    <ul className="m-0 flex list-none flex-col p-0">
      {documents.map((doc) => {
        const ready = doc.status === "ready";
        return (
          <li key={doc.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-3.5 last:border-b-0">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-tile bg-oat text-ink-soft">
                <Icon icon={kindIcon[doc.kind]} size={18} />
              </span>
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-[15px] font-medium">{doc.title}</span>
                <span className="text-meta text-ink-soft">{[KIND_LABELS[doc.kind], ...documentMeta(doc)].join(" · ")}</span>
              </div>
            </div>
            {ready ? (
              <div className="flex gap-2">
                <Button asChild variant="quiet" size="sm" leading={<Icon icon={ExternalLink} size={16} />}>
                  <a href={documentHref(doc.id)} target="_blank" rel="noopener">
                    Open
                  </a>
                </Button>
                {doc.hasFile && (
                  <Button asChild variant="quiet" size="sm" leading={<Icon icon={Download} size={16} />}>
                    <a href={documentDownloadHref(doc.id)} aria-label={`Download ${doc.title}`}>
                      Download
                    </a>
                  </Button>
                )}
              </div>
            ) : (
              <Badge tone={doc.status === "failed" ? "new" : "warning"} size="md">
                {doc.status === "failed" ? "Couldn't be read" : "Being read"}
              </Badge>
            )}
          </li>
        );
      })}
    </ul>
  );
}
