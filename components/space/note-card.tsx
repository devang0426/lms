import { AudioLines, FileText, Globe, Play } from "lucide-react";
import Link from "next/link";
import { Badge, Eyebrow, Icon, type BadgeTone } from "@/components/ui";
import type { DocumentKind } from "@/lib/db/schema";
import { KIND_LABELS } from "@/lib/documents/view";
import { noteSummary, type NotePhase } from "@/lib/space/view";
import { cn } from "@/lib/utils/cn";

/* One note on the private space's dashboard (feature 19): a flat Paper
   card like the course card, without a cover. Mono eyebrow with the
   source, serif title, where the note stands, and when it was added. */

export const PHASE_BADGES: Record<NotePhase, { tone: BadgeTone; label: string }> = {
  uploading: { tone: "neutral", label: "Upload unfinished" },
  processing: { tone: "warning", label: "Being made" },
  ready: { tone: "success", label: "Ready" },
  failed: { tone: "new", label: "Failed" },
};

const KIND_ICONS = { pdf: FileText, docx: FileText, url: Globe, audio: AudioLines, youtube: Play } as const;

export function NoteCard({
  note,
}: {
  note: {
    id: string;
    title: string;
    kind: DocumentKind | null;
    meta: string[];
    phase: NotePhase;
    cards: number;
    questions: number;
    createdAt: Date;
  };
}) {
  const badge = PHASE_BADGES[note.phase];
  return (
    <Link
      href={`/space/${note.id}`}
      className={cn(
        "flex h-full flex-col gap-3 rounded-card border border-line bg-paper px-[18px] pt-4 pb-[18px] text-ink no-underline transition-shadow",
        "hover:text-ink hover:shadow-raised",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <Eyebrow className="flex items-center gap-1.5">
          {note.kind && <Icon icon={KIND_ICONS[note.kind]} size={13} />}
          {[note.kind ? KIND_LABELS[note.kind] : "Note", ...note.meta].join(" · ")}
        </Eyebrow>
        <Badge tone={badge.tone} size="md">
          {badge.label}
        </Badge>
      </div>
      <span className="line-clamp-2 font-serif text-[24px] leading-[1.1]">{note.title}</span>
      <span className="mt-auto flex flex-col gap-0.5 text-meta text-ink-soft">
        <span>{noteSummary(note.phase, note)}</span>
        <span>Added {note.createdAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
      </span>
    </Link>
  );
}
