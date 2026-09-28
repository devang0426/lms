import { describe, expect, it } from "vitest";
import type { CompletionOptions, Engine, EngineCapabilities, StructuredOptions } from "../engine/types";
import { EngineError } from "../engine/types";
import { chapterRange, coverageProblem, dropCrowded, generateChapters, snapChapters, transcriptForPrompt, type DraftChapter } from "./chapters";
import {
  chapterText,
  generateLectureNotes,
  generateLessonCards,
  generateLessonQuiz,
  isAnswerable,
  lectureNotesText,
  mapLimit,
  shapeChapterSection,
} from "./lesson";
import { GenerationError } from "./retry";

/* No network: structured answers are queued per schema name, completions
   come from a function of the request. */
class FakeEngine implements Engine {
  readonly mode = "cloud" as const;
  structuredCalls: string[] = [];
  completeCalls: CompletionOptions[] = [];
  constructor(
    private answers: Record<string, unknown[]>,
    private completion: (opts: CompletionOptions) => string = () => "Some notes.",
  ) {}
  capabilities(): EngineCapabilities {
    return { chat: true, transcription: true, tts: true, embeddings: true };
  }
  async complete(opts: CompletionOptions): Promise<string> {
    this.completeCalls.push(opts);
    return this.completion(opts);
  }
  async structured<T>(opts: StructuredOptions<T>): Promise<T> {
    this.structuredCalls.push(opts.schemaName);
    const next = this.answers[opts.schemaName]?.shift();
    if (next instanceof Error) throw next;
    return next as T;
  }
  async transcribe(): Promise<never> {
    throw new Error("unused");
  }
  async tts(): Promise<Blob> {
    throw new Error("unused");
  }
  async embed(): Promise<number[][]> {
    return [];
  }
  async validate(): Promise<void> {}
}

const segments = Array.from({ length: 40 }, (_, i) => ({ startSec: i * 15 + 0.4, text: `Line ${i}.` }));
const starts = segments.map((s) => s.startSec);

describe("snapChapters", () => {
  it("snaps to the nearest segment start, forces 0:00 first and sorts", () => {
    const out = snapChapters(
      [
        { start: "02:08", title: "Span", summary: "s" },
        { start: "00:03", title: "Intro", summary: "i" },
        { start: "5:02", title: " Independence ", summary: "d" },
      ],
      starts,
    );
    expect(out).toEqual([
      { title: "Intro", summary: "i", startSec: 0 },
      { title: "Span", summary: "s", startSec: 135.4 },
      { title: "Independence", summary: "d", startSec: 300.4 },
    ]);
  });

  it("drops unparseable, untitled and duplicate chapters", () => {
    const out = snapChapters(
      [
        { start: "0:00", title: "A", summary: "" },
        { start: "soon", title: "B", summary: "" },
        { start: "1:00", title: "  ", summary: "" },
        { start: "2:00", title: "C", summary: "" },
        { start: "2:03", title: "C again", summary: "" },
      ],
      starts,
    );
    expect(out.map((c) => c.title)).toEqual(["A", "C"]);
  });
});

describe("chapter coverage", () => {
  const at = (...starts: number[]) => starts.map((startSec, i) => ({ title: `C${i}`, summary: "", startSec }));

  it("merges chapters closer than 20 s in a long lecture", () => {
    expect(dropCrowded(at(0, 6, 30, 45, 90), 1200).map((c) => c.startSec)).toEqual([0, 30, 90]);
    expect(dropCrowded(at(0, 6, 30), 200).map((c) => c.startSec)).toEqual([0, 6, 30]);
  });

  it("rejects chapters bunched at the start of the lecture", () => {
    // The real failure: nine chapters in the first 45 s of a 20-minute lecture.
    expect(coverageProblem(at(0, 6, 10, 15, 20, 26, 31, 40, 45), 1200)).toMatch(/Chapter 9 runs 1155 s/);
    expect(coverageProblem(at(0, 200, 400, 600, 800, 1000), 1200)).toBeNull();
  });

  it("allows a two-minute chapter in a short lecture", () => {
    expect(coverageProblem(at(0, 120), 240)).toBeNull();
    expect(coverageProblem(at(0, 30), 240)).toMatch(/Chapter 2/);
  });
});

describe("transcriptForPrompt", () => {
  it("prefixes every segment with its time", () => {
    expect(transcriptForPrompt(segments.slice(0, 2))).toBe("[00:00] Line 0.\n[00:15] Line 1.");
  });

  it("merges lines when the transcript is too long", () => {
    const text = transcriptForPrompt(segments, 60);
    expect(text.split("\n").length).toBeLessThan(segments.length);
    expect(text.startsWith("[00:00] Line 0. Line 1.")).toBe(true);
  });
});

describe("chapterRange", () => {
  it("asks for fewer chapters in a short lecture", () => {
    expect(chapterRange(1200)).toEqual({ min: 6, max: 15 });
    expect(chapterRange(200)).toEqual({ min: 3, max: 15 });
    expect(chapterRange(20)).toEqual({ min: 1, max: 15 });
  });
});

const sixChapters = (offset = 0) => ({
  chapters: Array.from({ length: 6 }, (_, i) => ({ start: `${i + offset}:00`, title: `Topic ${i + 1}`, summary: "About it." })),
});

describe("generateChapters", () => {
  it("returns snapped chapters", async () => {
    const engine = new FakeEngine({ chapters: [sixChapters()] });
    const out = await generateChapters(engine, segments, { durationSec: 400 });
    expect(out).toHaveLength(6);
    expect(out[1].startSec).toBe(60.4);
    expect(engine.structuredCalls).toEqual(["chapters"]);
  });

  it("retries once on a bad answer", async () => {
    const engine = new FakeEngine({ chapters: [{ chapters: [{ start: "0:00", title: "Only", summary: "" }] }, sixChapters()] });
    await expect(generateChapters(engine, segments, { durationSec: 400 })).resolves.toHaveLength(6);
    expect(engine.structuredCalls).toHaveLength(2);
  });

  it("fails with an actionable message after two bad answers", async () => {
    const engine = new FakeEngine({ chapters: [{ nope: 1 }, { nope: 2 }] });
    await expect(generateChapters(engine, segments, { durationSec: 400 })).rejects.toBeInstanceOf(GenerationError);
  });

  it("does not retry a bad key", async () => {
    const engine = new FakeEngine({ chapters: [new EngineError("Invalid key", "auth"), sixChapters()] });
    await expect(generateChapters(engine, segments, { durationSec: 400 })).rejects.toThrow("Invalid key");
    expect(engine.structuredCalls).toHaveLength(1);
  });
});

const chapters: DraftChapter[] = [
  { title: "Vectors", startSec: 0, summary: "What a vector is." },
  { title: "Span", startSec: 150.4, summary: "All combinations." },
];

describe("lecture notes", () => {
  it("splits the transcript at chapter starts", () => {
    expect(chapterText(segments, chapters, 0)).toContain("Line 0.");
    expect(chapterText(segments, chapters, 0)).not.toContain("Line 10.");
    expect(chapterText(segments, chapters, 1).startsWith("Line 10.")).toBe(true);
  });

  it("gives each section one ## heading with the chapter's time", () => {
    const blocks = shapeChapterSection("```markdown\n## Vectors!\n\nArrows.\n\n## Extra\n\n# Big\n```", chapters[0]);
    expect(blocks[0]).toMatchObject({ type: "heading2", text: "Vectors", startSec: 0 });
    expect(blocks.filter((b) => b.type === "heading2")).toHaveLength(1);
    expect(blocks.map((b) => b.type)).toEqual(["heading2", "paragraph", "heading3", "heading3"]);
  });

  it("wraps chapter sections in an overview and takeaways", async () => {
    const engine = new FakeEngine({}, (opts) =>
      opts.tier === "strong" ? "The lecture covers vectors.\n\n## Key Takeaways\n\n- Span is all combinations" : "## X\n\nBody text.",
    );
    const blocks = await generateLectureNotes(engine, segments, chapters);
    expect(blocks[0]).toMatchObject({ type: "paragraph", text: "The lecture covers vectors." });
    expect(blocks.filter((b) => b.startSec !== undefined).map((b) => [b.text, b.startSec])).toEqual([
      ["Vectors", 0],
      ["Span", 150.4],
    ]);
    expect(blocks.at(-2)).toMatchObject({ type: "heading2", text: "Key Takeaways" });
    expect(engine.completeCalls.filter((c) => c.tier === "fast")).toHaveLength(2);
    expect(engine.completeCalls.every((c) => (c.maxTokens ?? 0) >= 3000)).toBe(true);
  });

  it("keeps the chapter notes if the overview fails", async () => {
    const engine = new FakeEngine({}, (opts) => {
      if (opts.tier === "strong") throw new Error("down");
      return "Body.";
    });
    const blocks = await generateLectureNotes(engine, segments, chapters);
    expect(blocks[0]).toMatchObject({ type: "heading2", text: "Vectors" });
  });

  it("labels notes by chapter for cards and quiz", async () => {
    const engine = new FakeEngine({}, (opts) => (opts.tier === "strong" ? "Overview." : "Body."));
    const text = lectureNotesText(await generateLectureNotes(engine, segments, chapters), chapters);
    expect(text).toBe("Chapter 1: Vectors\nBody.\n\nChapter 2: Span\nBody.");
  });
});

describe("mapLimit", () => {
  it("keeps input order and never runs more than the limit at once", async () => {
    let running = 0;
    let peak = 0;
    const out = await mapLimit([30, 5, 20, 1, 10], 2, async (ms, i) => {
      peak = Math.max(peak, ++running);
      await new Promise((r) => setTimeout(r, ms));
      running--;
      return i * 10;
    });
    expect(out).toEqual([0, 10, 20, 30, 40]);
    expect(peak).toBe(2);
  });
});

describe("generateLessonCards", () => {
  const card = (chapter: number) => ({ front: "Q?", back: "A.", topic: "Span", chapter });

  it("maps each card's chapter to its start time", async () => {
    const cards = Array.from({ length: 15 }, (_, i) => card(i % 3));
    const engine = new FakeEngine({ lesson_cards: [{ cards }] });
    const out = await generateLessonCards(engine, "notes", chapters);
    expect(out).toHaveLength(15);
    expect(out.slice(0, 3).map((c) => c.startSec)).toEqual([null, 0, 150.4]);
  });

  it("retries when there are too few cards", async () => {
    const engine = new FakeEngine({ lesson_cards: [{ cards: [card(1)] }, { cards: Array(16).fill(card(1)) }] });
    await expect(generateLessonCards(engine, "notes", chapters)).resolves.toHaveLength(16);
  });
});

describe("quiz", () => {
  const base = { topic: "t", difficulty: "basic", question: "Q ___", explanation: "e", chapter: 2 };

  it("only accepts answerable questions", () => {
    expect(isAnswerable({ ...base, type: "mcq", options: ["a", "b", "c", "d"], correctIndex: 3 })).toBe(true);
    expect(isAnswerable({ ...base, type: "mcq", options: ["a", "b", "c"], correctIndex: 0 })).toBe(false);
    expect(isAnswerable({ ...base, type: "mcq", options: ["a", "a", "c", "d"], correctIndex: 0 })).toBe(false);
    expect(isAnswerable({ ...base, type: "mcq", options: ["a", "b", "c", "d"], correctIndex: 4 })).toBe(false);
    expect(isAnswerable({ ...base, type: "true_false", options: ["True", "False"], correctIndex: 1 })).toBe(true);
    expect(isAnswerable({ ...base, type: "true_false", options: ["Yes", "No"], correctIndex: 1 })).toBe(false);
    expect(isAnswerable({ ...base, type: "fill_blank", options: ["span"], correctIndex: 0 })).toBe(true);
    expect(isAnswerable({ ...base, type: "fill_blank", question: "No blank", options: ["span"], correctIndex: 0 })).toBe(false);
  });

  it("keeps 8 good questions at the requested level", async () => {
    const good = { ...base, type: "mcq", options: ["a", "b", "c", "d"], correctIndex: 1, difficulty: "exam" };
    const bad = { ...good, correctIndex: 9 };
    const engine = new FakeEngine({ lesson_quiz: [{ questions: [bad, ...Array(9).fill(good)] }] });
    const out = await generateLessonQuiz(engine, "notes", chapters, "basic");
    expect(out).toHaveLength(8);
    expect(out[0]).toMatchObject({ difficulty: "basic", startSec: 150.4, correctIndex: 1 });
  });

  it("fails after two short answers", async () => {
    const engine = new FakeEngine({ lesson_quiz: [{ questions: [] }, { questions: [] }] });
    await expect(generateLessonQuiz(engine, "notes", chapters, "exam")).rejects.toThrow("exam quiz questions");
  });
});
