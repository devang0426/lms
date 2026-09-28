import "katex/dist/katex.min.css";

import type { Block } from "@/lib/ai/types";
import { blocksToMarkdown, renderMarkdown, renderRichInline } from "@/lib/markdown";
import { cn } from "@/lib/utils/cn";
import { SeekChip } from "./seek-chip";

/* The lesson's study notes in the player (feature 12). Rendered on the
   server with lib/markdown (KaTeX included, DOMPurify-sanitized). A
   heading that carries a video time gets a "▶ 12:48" chip that seeks the
   player. */

type Part = { heading: Block } | { body: Block[] };

function split(blocks: Block[]): Part[] {
  const parts: Part[] = [];
  for (const b of blocks) {
    if (b.type.startsWith("heading")) parts.push({ heading: b });
    else {
      const last = parts[parts.length - 1];
      if (last && "body" in last) last.body.push(b);
      else parts.push({ body: [b] });
    }
  }
  return parts;
}

const headingClass = {
  heading1: "text-h2 font-semibold",
  heading2: "text-h2 font-semibold",
  heading3: "text-h3 font-semibold",
} as Record<string, string>;

export function StudyNotes({ blocks }: { blocks: Block[] }) {
  return (
    <article className="flex max-w-[760px] flex-col gap-3" aria-label="Study notes">
      {split(blocks).map((part, i) => {
        if ("heading" in part) {
          const b = part.heading;
          const Tag = b.type === "heading3" ? "h4" : "h3";
          return (
            <Tag key={b.id} className={cn("m-0 mt-4 flex flex-wrap items-center gap-2.5 first:mt-0", headingClass[b.type])}>
              <span dangerouslySetInnerHTML={{ __html: renderRichInline(b.text) }} />
              {b.startSec !== undefined && <SeekChip sec={b.startSec} />}
            </Tag>
          );
        }
        return (
          <div
            key={part.body[0]?.id ?? i}
            className="study-notes"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(blocksToMarkdown(part.body)) }}
          />
        );
      })}
    </article>
  );
}
