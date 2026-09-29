import { describe, expect, it } from "vitest";
import type { Block } from "@/lib/ai/types";
import type { Engine, EngineCapabilities, StructuredOptions, TtsOptions } from "../engine/types";
import { EngineError } from "../engine/types";
import { podcastSystem } from "../prompts";
import { generatePodcastScript, isDevanagariScript, PODCAST_VOICES, PODCAST_VOICES_BY_LANGUAGE, podcastSource, synthesizePodcastLines } from "./podcast";
import { GenerationError } from "./retry";

/* No network: structured answers are queued, TTS returns the voice and
   text it was asked for, after a delay that finishes lines out of order. */
class FakeEngine implements Engine {
  readonly mode = "cloud" as const;
  structuredCalls = 0;
  ttsCalls: { text: string; voice: string; format?: string }[] = [];
  constructor(private answers: unknown[] = []) {}
  capabilities(): EngineCapabilities {
    return { chat: true, transcription: true, tts: true, embeddings: true };
  }
  async complete(): Promise<string> {
    throw new Error("unused");
  }
  async structured<T>(_opts: StructuredOptions<T>): Promise<T> {
    this.structuredCalls++;
    const next = this.answers.shift();
    if (next instanceof Error) throw next;
    return next as T;
  }
  async transcribe(): Promise<never> {
    throw new Error("unused");
  }
  async tts(text: string, opts: TtsOptions): Promise<Blob> {
    this.ttsCalls.push({ text, voice: opts.voice, format: opts.format });
    await new Promise((r) => setTimeout(r, text.length % 3));
    return new Blob([`${opts.voice}:${text}`], { type: "audio/mpeg" });
  }
  async embed(): Promise<number[][]> {
    return [];
  }
  async validate(): Promise<void> {}
}

const line = (speaker: "host" | "guest", n: number) => ({ speaker, text: `Line ${n} about $x^2$.`, spoken: `Line ${n} about x squared.` });
const goodScript = { lines: Array.from({ length: 8 }, (_, i) => line(i % 2 ? "guest" : "host", i)) };

describe("podcastSource", () => {
  const blocks: Block[] = [
    { id: "1", type: "heading2", text: "Span", startSec: 12 },
    { id: "2", type: "paragraph", text: "The span is every linear combination." },
  ];

  it("hashes the notes' Markdown, the same every time", () => {
    const a = podcastSource(blocks)!;
    expect(a.text).toContain("## Span");
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(podcastSource(blocks.map((b) => ({ ...b, id: `x${b.id}` })))!.hash).toBe(a.hash);
  });

  it("changes when the notes change, and is null for empty notes", () => {
    const edited = podcastSource([blocks[0], { ...blocks[1], text: "The span is all combinations." }])!;
    expect(edited.hash).not.toBe(podcastSource(blocks)!.hash);
    expect(podcastSource([])).toBeNull();
  });
});

describe("generatePodcastScript", () => {
  it("returns validated lines on the strong tier with a token cap", async () => {
    const engine = new FakeEngine([goodScript]);
    const script = await generatePodcastScript(engine, "notes", "short");
    expect(script).toHaveLength(8);
    expect(script[1]).toEqual({ speaker: "guest", text: "Line 1 about $x^2$.", spoken: "Line 1 about x squared." });
  });

  it("falls back to the display text when `spoken` is empty", async () => {
    const withBlank = { lines: goodScript.lines.map((l, i) => (i === 0 ? { ...l, spoken: " " } : l)) };
    const [first] = await generatePodcastScript(new FakeEngine([withBlank]), "notes");
    expect(first.spoken).toBe(first.text);
  });

  it("retries once on a bad answer, then gives a readable error", async () => {
    const tooShort = { lines: goodScript.lines.slice(0, 3) };
    const oneVoice = { lines: goodScript.lines.map((l) => ({ ...l, speaker: "host" })) };
    const retried = new FakeEngine([{ lines: "nope" }, goodScript]);
    await expect(generatePodcastScript(retried, "notes")).resolves.toHaveLength(8);
    expect(retried.structuredCalls).toBe(2);

    const failing = new FakeEngine([tooShort, oneVoice]);
    await expect(generatePodcastScript(failing, "notes")).rejects.toBeInstanceOf(GenerationError);
  });

  it("doesn't retry an auth or quota error", async () => {
    const engine = new FakeEngine([new EngineError("No credit left.", "quota"), goodScript]);
    await expect(generatePodcastScript(engine, "notes")).rejects.toMatchObject({ kind: "quota" });
    expect(engine.structuredCalls).toBe(1);
  });
});

describe("synthesizePodcastLines", () => {
  it("speaks each line with its speaker's voice, keeping the script's order", async () => {
    const engine = new FakeEngine();
    const progress: number[] = [];
    const parts = await synthesizePodcastLines(engine, goodScript.lines, { onLine: (done) => progress.push(done) });
    const texts = await Promise.all(parts.map((p) => p.text()));
    expect(texts).toEqual(goodScript.lines.map((l) => `${PODCAST_VOICES[l.speaker]}:${l.spoken}`));
    expect(new Set(engine.ttsCalls.map((c) => c.voice))).toEqual(new Set([PODCAST_VOICES.host, PODCAST_VOICES.guest]));
    expect(PODCAST_VOICES.host).not.toBe(PODCAST_VOICES.guest);
    expect(engine.ttsCalls.every((c) => c.format === "mp3")).toBe(true);
    expect(progress).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe("Hinglish episodes", () => {
  const hindi = (speaker: "host" | "guest", n: number) => ({
    speaker,
    text: `तो line ${n} में हम span की बात करेंगे।`,
    spoken: `तो line ${n} में हम span की बात करेंगे।`,
  });
  const hinglishScript = { lines: Array.from({ length: 8 }, (_, i) => hindi(i % 2 ? "guest" : "host", i)) };
  const romanized = { lines: goodScript.lines.map((l) => ({ ...l, text: "Aaj hum span ki baat karenge.", spoken: "Aaj hum span ki baat karenge." })) };

  it("asks for Hinglish in Devanagari, and leaves the English prompt as it was", () => {
    const hi = podcastSystem("short", "hinglish");
    expect(hi).toContain("Devanagari");
    expect(hi).toContain("NEVER write Hindi in Roman letters");
    expect(podcastSystem("short")).toBe(podcastSystem("short", "en"));
    expect(podcastSystem("short")).not.toMatch(/Hinglish|Devanagari/);
  });

  it("accepts a Devanagari script and retries a romanized one", async () => {
    await expect(generatePodcastScript(new FakeEngine([hinglishScript]), "notes", "short", "hinglish")).resolves.toHaveLength(8);
    const retried = new FakeEngine([romanized, hinglishScript]);
    await expect(generatePodcastScript(retried, "notes", "short", "hinglish")).resolves.toHaveLength(8);
    expect(retried.structuredCalls).toBe(2);
    await expect(generatePodcastScript(new FakeEngine([romanized, romanized]), "notes", "short", "hinglish")).rejects.toBeInstanceOf(
      GenerationError,
    );
    // English doesn't need Devanagari.
    await expect(generatePodcastScript(new FakeEngine([goodScript]), "notes", "short", "en")).resolves.toHaveLength(8);
  });

  it("needs most lines in Devanagari, allowing a few all-English ones", () => {
    const lines = hinglishScript.lines.map((l, i) => (i < 3 ? { ...l, text: "Exactly!", spoken: "Exactly!" } : l));
    expect(isDevanagariScript(lines)).toBe(true); // 5 of 8
    expect(isDevanagariScript(lines.map((l, i) => (i < 4 ? { ...l, text: "Yes.", spoken: "Yes." } : l)))).toBe(false); // 4 of 8
    expect(isDevanagariScript([])).toBe(false);
  });

  it("speaks with two different Hindi voices", async () => {
    const engine = new FakeEngine();
    await synthesizePodcastLines(engine, hinglishScript.lines, { voices: PODCAST_VOICES_BY_LANGUAGE.hinglish });
    expect(new Set(engine.ttsCalls.map((c) => c.voice))).toEqual(new Set(["hm_omega", "hf_alpha"]));
    expect(PODCAST_VOICES_BY_LANGUAGE.en).toEqual(PODCAST_VOICES);
  });
});
