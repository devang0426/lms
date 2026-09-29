"use client";

import "katex/dist/katex.min.css";

import { useRouter } from "next/navigation";
import { useMemo, type MouseEvent } from "react";
import { citationChipsHtml, stripMarkers } from "@/lib/chat/citations";
import type { ChatCitation } from "@/lib/chat/types";
import { renderMarkdown, stripFence } from "@/lib/markdown";
import { citationHref, isDocumentCitation, useCitationSeek } from "./citation-chip";

/* An assistant answer as Markdown with maths (lib/markdown: KaTeX, then
   DOMPurify). Each [S#] becomes a small time chip (.cite-chip) that seeks
   or opens the lesson. A marker with no citation behind it renders as
   nothing. While streaming, markers are hidden altogether: the server
   hasn't checked them yet. */

export function AnswerBody({
  content,
  citations,
  courseId,
  currentLessonId,
  streaming = false,
}: {
  content: string;
  citations: ChatCitation[];
  /* The page's course; left out in the private space (feature 19). */
  courseId?: string;
  currentLessonId?: string;
  streaming?: boolean;
}) {
  const router = useRouter();
  const seekFor = useCitationSeek(currentLessonId);
  const html = useMemo(() => {
    const md = stripFence(content);
    return renderMarkdown(streaming ? stripMarkers(md) : citationChipsHtml(md, citations));
  }, [content, citations, streaming]);

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const chip = (e.target as HTMLElement).closest<HTMLElement>("[data-cite]");
    const c = chip ? citations[Number(chip.dataset.cite)] : undefined;
    if (!c) return;
    const seek = seekFor(c);
    if (seek) return seek();
    const href = citationHref(courseId, c);
    if (href && isDocumentCitation(c)) window.open(href, "_blank", "noopener");
    else if (href) router.push(href);
  };

  // The chips inside are real <button>s, so the keyboard reaches them.
  return <div className="study-notes text-[15px]" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />;
}
