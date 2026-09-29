"use client";

import { FileText, Play } from "lucide-react";
import Link from "next/link";
import { useOptionalPlayer } from "@/components/player/player-context";
import { Icon } from "@/components/ui";
import type { ChatCitation } from "@/lib/chat/types";
import { documentHref } from "@/lib/documents/view";
import { cn } from "@/lib/utils/cn";

/* "Lecture 3 · 12:48" (feature 14). In the lesson the student is watching
   it seeks the player; anywhere else it opens that lesson at the moment.
   A document citation (feature 18), "Week 2 slides · p. 7", opens the
   document at that page (or moment) in a new tab. In the private space
   (feature 19) there's no page course: a lecture chip uses its own. */

export const isDocumentCitation = (c: ChatCitation) => Boolean(c.documentId);

export function citationHref(courseId: string | undefined, c: ChatCitation): string | null {
  if (c.documentId) return documentHref(c.documentId, { page: c.page, startSec: c.startSec });
  const course = c.courseId ?? courseId;
  if (!c.lessonId || !course) return null;
  const t = c.startSec !== null ? `?t=${Math.floor(c.startSec)}` : "";
  return `/courses/${course}/lessons/${c.lessonId}${t}`;
}

/* Seek when the cited lesson is the one playing; otherwise null. */
export function useCitationSeek(currentLessonId: string | undefined) {
  const player = useOptionalPlayer();
  return (c: ChatCitation): (() => void) | null => {
    if (!player || !currentLessonId || c.documentId || c.lessonId !== currentLessonId || c.startSec === null) return null;
    const sec = c.startSec;
    return () => player.seek(sec);
  };
}

const chipClass =
  "inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border-0 bg-clay px-3 font-mono text-[12px] text-clay-ink no-underline hover:bg-clay-stripe hover:text-clay-ink";

export function CitationChip({
  citation,
  courseId,
  currentLessonId,
  className,
}: {
  citation: ChatCitation;
  courseId?: string;
  currentLessonId?: string;
  className?: string;
}) {
  const seekFor = useCitationSeek(currentLessonId);
  const seek = seekFor(citation);
  const doc = isDocumentCitation(citation);
  const content = (
    <>
      {doc ? <Icon icon={FileText} size={12} /> : citation.startSec !== null && <Icon icon={Play} size={10} fill="currentColor" />}
      {citation.label}
    </>
  );
  if (seek) {
    return (
      <button type="button" onClick={seek} aria-label={`Play from ${citation.label}`} className={cn(chipClass, className)}>
        {content}
      </button>
    );
  }
  const href = citationHref(courseId, citation);
  if (!href) return <span className={cn(chipClass, "cursor-default", className)}>{content}</span>;
  if (doc) {
    return (
      <a href={href} target="_blank" rel="noopener" aria-label={`Open ${citation.label} in a new tab`} className={cn(chipClass, className)}>
        {content}
      </a>
    );
  }
  return (
    <Link href={href} aria-label={`Open ${citation.label}`} className={cn(chipClass, className)}>
      {content}
    </Link>
  );
}
