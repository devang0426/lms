/* Transcript → retrieval chunks (feature 13). Pure: no db, no engine.

   Segments are grouped into windows of about 45–90 seconds. Consecutive
   windows share their last ~10 seconds, so a sentence on a seam is whole
   in at least one chunk. A window never crosses a chapter boundary: the
   assistant's citation seeks to the chunk's start, and a chunk that starts
   where its chapter starts lands the student where the topic begins. Each
   chunk's text opens with its chapter title, which gives the embedding
   and full-text search the topic even when the speaker never names it. */

export interface TimedSegment {
  startSec: number;
  endSec: number;
  text: string;
}

export interface ChapterMark {
  title: string;
  startSec: number;
}

export interface TranscriptChunk {
  /* Chapter title, a blank line, then the transcript text. */
  text: string;
  startSec: number;
  endSec: number;
  chapterTitle: string | null;
}

export const CHUNK_MIN_SEC = 45;
export const CHUNK_MAX_SEC = 90;
export const CHUNK_OVERLAP_SEC = 10;

export function chunkTranscript(segments: TimedSegment[], chapters: ChapterMark[]): TranscriptChunk[] {
  const segs = segments
    .filter((s) => s.text.trim() !== "")
    .map((s) => ({ ...s, endSec: Math.max(s.endSec, s.startSec) }))
    .sort((a, b) => a.startSec - b.startSec);
  return groupByChapter(segs, chapters).flatMap(({ title, segs: group }) =>
    windows(group).map(([i, j]) => ({
      text: chunkText(title, group.slice(i, j + 1)),
      startSec: group[i].startSec,
      endSec: group[j].endSec,
      chapterTitle: title,
    })),
  );
}

/* Each segment goes to the last chapter starting at or before it. Segments
   before the first chapter form a group with no title. */
function groupByChapter(segs: TimedSegment[], chapters: ChapterMark[]) {
  const marks = [...chapters].sort((a, b) => a.startSec - b.startSec);
  const groups: { title: string | null; segs: TimedSegment[] }[] = [];
  let c = -1;
  for (const seg of segs) {
    let next = c;
    while (next + 1 < marks.length && marks[next + 1].startSec <= seg.startSec + 1e-3) next++;
    if (next !== c || groups.length === 0) {
      c = next;
      groups.push({ title: c >= 0 ? marks[c].title.trim() || null : null, segs: [] });
    }
    groups.at(-1)!.segs.push(seg);
  }
  return groups.filter((g) => g.segs.length > 0);
}

/* Inclusive [first, last] segment indexes of each window in one chapter. */
function windows(segs: TimedSegment[]): [number, number][] {
  const span = (i: number, j: number) => segs[j].endSec - segs[i].startSec;
  const out: [number, number][] = [];
  let i = 0;
  while (i < segs.length) {
    let j = i;
    // Grow to at least the minimum, never past the maximum (a single
    // segment longer than the maximum is a window on its own).
    while (j + 1 < segs.length && span(i, j) < CHUNK_MIN_SEC && span(i, j + 1) <= CHUNK_MAX_SEC) j++;
    out.push([i, j]);
    if (j === segs.length - 1) break;
    // The next window starts with the segments in this one's last
    // overlap seconds, but always moves forward by at least one segment.
    const overlapFrom = segs[j].endSec - CHUNK_OVERLAP_SEC;
    let next = j + 1;
    while (next - 1 > i && segs[next - 1].startSec >= overlapFrom) next--;
    i = next;
  }
  // A short tail joins the window before it when the result still fits.
  if (out.length > 1) {
    const [li, lj] = out.at(-1)!;
    const [pi] = out.at(-2)!;
    if (span(li, lj) < CHUNK_MIN_SEC && span(pi, lj) <= CHUNK_MAX_SEC) out.splice(-2, 2, [pi, lj]);
  }
  return out;
}

function chunkText(title: string | null, segs: TimedSegment[]): string {
  const body = segs
    .map((s) => s.text.trim())
    .join(" ")
    .replace(/\s+/g, " ");
  return title ? `${title}\n\n${body}` : body;
}
