/* Podcast (feature 17): a two-voice conversation about a lesson's notes.
   The script is structured output (validated, retried once); each line is
   then spoken with its speaker's voice. Joining the pieces into one MP3 is
   ffmpeg's job in the task (trigger/lib/podcast-audio.ts): gluing MP3
   Blobs end to end gives a file whose header describes only the first
   piece. Engine passed in, no db. */

import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import type { Block, PodcastLine } from "@/lib/ai/types";
import { blocksToMarkdown } from "@/lib/markdown-blocks";
import type { Engine } from "../engine/types";
import { podcastSchema, podcastSystem } from "../prompts";
import { STRUCTURED_MAX_TOKENS } from "./chapters";
import { capTokens } from "./chunk";
import { mapLimit } from "./lesson";
import { withOneRetry } from "./retry";

export type PodcastLength = "short" | "medium" | "long";
export type PodcastLanguage = "en" | "hinglish";

/* Grounding cap, the same as NitroAI's study tools. */
const PODCAST_SOURCE_TOKENS = 8000;
/* Fewer lines than this isn't a conversation: retry. */
const MIN_LINES = 6;

/* Two clearly different Kokoro voices: a male host and a female guest. */
export const PODCAST_VOICES = { host: "am_michael", guest: "af_heart" } as const;

/* Kokoro's Hindi voices read Devanagari, and English words written in
   Latin letters, clearly (checked by transcribing them back with Whisper). */
export const PODCAST_VOICES_BY_LANGUAGE: Record<PodcastLanguage, { host: string; guest: string }> = {
  en: PODCAST_VOICES,
  hinglish: { host: "hm_omega", guest: "hf_alpha" },
};

/* Most Hinglish lines must carry Devanagari: a romanized script ("aaj hum
   baat karenge") comes out garbled from the Hindi voices, so it's retried. */
const DEVANAGARI = /[\u0900-\u097F]/;
const MIN_DEVANAGARI_SHARE = 0.6;

export function isDevanagariScript(lines: readonly { spoken: string; text: string }[]): boolean {
  const withHindi = lines.filter((l) => DEVANAGARI.test(l.spoken || l.text)).length;
  return lines.length > 0 && withHindi / lines.length >= MIN_DEVANAGARI_SHARE;
}

/* What the podcast is made from, and its fingerprint. The hash is stored
   with the audio: while it and PODCAST_PROMPTS_VERSION match, the podcast is never
   made again. */
export function podcastSource(blocks: readonly Block[]): { text: string; hash: string } | null {
  const text = capTokens(blocksToMarkdown([...blocks]).trim(), PODCAST_SOURCE_TOKENS);
  if (!text) return null;
  return { text, hash: createHash("sha256").update(text).digest("hex") };
}

const scriptOutput = z.object({
  lines: z.array(
    z.object({
      speaker: z.enum(["host", "guest"]),
      text: z.string().trim().min(1).max(2000),
      spoken: z.string().trim().max(3000),
    }),
  ),
});

export async function generatePodcastScript(
  engine: Engine,
  content: string,
  length: PodcastLength = "short",
  language: PodcastLanguage = "en",
): Promise<PodcastLine[]> {
  return withOneRetry("podcast script", async () => {
    const raw = await engine.structured<unknown>({
      system: podcastSystem(length, language),
      messages: [{ role: "user", content }],
      schema: podcastSchema as unknown as Record<string, unknown>,
      schemaName: "podcast",
      tier: "strong",
      maxTokens: STRUCTURED_MAX_TOKENS,
    });
    const { lines } = scriptOutput.parse(raw);
    if (lines.length < MIN_LINES) throw new Error(`Only ${lines.length} lines (need ${MIN_LINES}).`);
    if (!lines.some((l) => l.speaker === "host") || !lines.some((l) => l.speaker === "guest")) {
      throw new Error("The script has only one speaker.");
    }
    if (language === "hinglish" && !isDevanagariScript(lines)) throw new Error("The Hinglish script wasn't written in Devanagari.");
    return lines.map((l) => ({ speaker: l.speaker, text: l.text, spoken: l.spoken || l.text }));
  });
}

/* Speak every line with its speaker's voice, a few at a time, in order.
   Throws EngineError (kind "unsupported"/"model_missing") if the engine
   has no TTS. */
export async function synthesizePodcastLines(
  engine: Engine,
  script: readonly PodcastLine[],
  opts: { voices?: { host: string; guest: string }; concurrency?: number; onLine?: (done: number, total: number) => void } = {},
): Promise<Blob[]> {
  const voices = opts.voices ?? PODCAST_VOICES;
  let done = 0;
  return mapLimit(script, opts.concurrency ?? 4, async (line) => {
    const audio = await engine.tts(line.spoken || line.text, { voice: voices[line.speaker], format: "mp3" });
    opts.onLine?.(++done, script.length);
    return audio;
  });
}
