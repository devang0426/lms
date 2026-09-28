import { describe, expect, it } from "vitest";
import { CHUNK_MAX_SEC, CHUNK_MIN_SEC, chunkTranscript, type TimedSegment } from "./chunk-transcript";

/* `count` segments of `len` seconds each with a `gap` of silence between. */
function segments(count: number, len = 5, gap = 1, from = 0): TimedSegment[] {
  return Array.from({ length: count }, (_, i) => {
    const startSec = from + i * (len + gap);
    return { startSec, endSec: startSec + len, text: `s${i}` };
  });
}

const span = (c: { startSec: number; endSec: number }) => c.endSec - c.startSec;

describe("chunkTranscript", () => {
  it("makes windows of 45–90 seconds with about 10 seconds of overlap", () => {
    const chunks = chunkTranscript(segments(100), []); // 600 s of speech
    expect(chunks.length).toBeGreaterThan(5);
    for (const c of chunks) {
      expect(span(c)).toBeGreaterThanOrEqual(CHUNK_MIN_SEC);
      expect(span(c)).toBeLessThanOrEqual(CHUNK_MAX_SEC);
    }
    for (let i = 1; i < chunks.length; i++) {
      const overlap = chunks[i - 1].endSec - chunks[i].startSec;
      expect(overlap).toBeGreaterThan(0);
      expect(overlap).toBeLessThanOrEqual(15);
    }
  });

  it("covers every segment, from the first second to the last", () => {
    const segs = segments(250, 4, 0.8);
    const chunks = chunkTranscript(segs, [
      { title: "One", startSec: 0 },
      { title: "Two", startSec: segs[90].startSec },
      { title: "Three", startSec: segs[170].startSec },
    ]);
    expect(chunks[0].startSec).toBe(segs[0].startSec);
    expect(chunks.at(-1)!.endSec).toBe(segs.at(-1)!.endSec);
    for (const s of segs) {
      expect(chunks.some((c) => c.startSec <= s.startSec && s.endSec <= c.endSec)).toBe(true);
    }
  });

  it("never crosses a chapter boundary and starts a chunk where each chapter starts", () => {
    const segs = segments(60);
    const second = segs[25].startSec;
    const chunks = chunkTranscript(segs, [
      { title: "Vectors", startSec: 0 },
      { title: "Span", startSec: second },
    ]);
    for (const c of chunks) expect(c.startSec < second && c.endSec > second).toBe(false);
    expect(chunks.some((c) => c.startSec === second && c.chapterTitle === "Span")).toBe(true);
  });

  it("prefixes each chunk with its chapter title", () => {
    const chunks = chunkTranscript(segments(10), [{ title: "Linear combinations", startSec: 0 }]);
    expect(chunks[0].text.startsWith("Linear combinations\n\ns0 s1")).toBe(true);
  });

  it("keeps speech before the first chapter, untitled", () => {
    const chunks = chunkTranscript(segments(20), [{ title: "Later", startSec: 60 }]);
    expect(chunks[0]).toMatchObject({ chapterTitle: null, startSec: 0 });
    expect(chunks[0].text.startsWith("s0")).toBe(true);
    expect(chunks.at(-1)!.chapterTitle).toBe("Later");
  });

  it("folds a short tail into the window before it when it fits", () => {
    // 60 s chapter: one 45+ s window, then a short tail that joins it.
    const chunks = chunkTranscript(segments(10), []);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ startSec: 0, endSec: 59 });
  });

  it("keeps a short chapter as one short chunk", () => {
    const chunks = chunkTranscript(segments(3), []);
    expect(chunks).toHaveLength(1);
    expect(span(chunks[0])).toBeLessThan(CHUNK_MIN_SEC);
  });

  it("lets one very long segment stand alone and still moves forward", () => {
    const segs = [
      { startSec: 0, endSec: 120, text: "long" },
      ...segments(20, 5, 1, 121),
    ];
    const chunks = chunkTranscript(segs, []);
    expect(chunks[0]).toMatchObject({ startSec: 0, endSec: 120 });
    expect(chunks.at(-1)!.endSec).toBe(segs.at(-1)!.endSec);
  });

  it("ignores empty segments, sorts input and handles no input", () => {
    expect(chunkTranscript([], [])).toEqual([]);
    const chunks = chunkTranscript(
      [
        { startSec: 10, endSec: 12, text: "b" },
        { startSec: 5, endSec: 6, text: "  " },
        { startSec: 0, endSec: 2, text: "a" },
      ],
      [],
    );
    expect(chunks).toEqual([{ text: "a b", startSec: 0, endSec: 12, chapterTitle: null }]);
  });
});
