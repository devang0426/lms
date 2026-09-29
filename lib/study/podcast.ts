import type { JobState } from "@/lib/jobs/stages";

/* Podcast rules (feature 17). Pure and shared: the server decides with
   these, and the Podcast tab gets the same answers as props.

   A podcast is made only when someone asks, then cached for the whole
   course. It is never made again while the lesson's published notes and
   PROMPTS_VERSION are unchanged. Who may start one:
   - nobody has made it yet (or every attempt failed): staff, or the first
     student to ask;
   - it exists but the notes changed since: staff only, so students can't
     keep spending on regenerations;
   - it's being made, or it's up to date: nobody.
   A private note's podcast (feature 19) belongs to the note's owner, who
   has staff's say over it ("owner"): nobody else can even see it. */

export type PodcastLength = "short" | "medium" | "long";

/* Each language is its own episode, made and cached separately. */
export type PodcastLanguage = "en" | "hinglish";
export const PODCAST_LANGUAGES: { value: PodcastLanguage; label: string; htmlLang: string }[] = [
  { value: "en", label: "English", htmlLang: "en" },
  { value: "hinglish", label: "हिंदी + English", htmlLang: "hi" },
];
export type PodcastPhase = "none" | "generating" | "ready" | "failed";
export type PodcastAccess = "staff" | "student" | "owner";

export interface PodcastRowState {
  status: "generating" | "ready" | "failed";
  audioUrl: string | null;
  sourceHash: string | null;
  promptsVersion: number | null;
}

export interface PodcastSourceState {
  hash: string;
  promptsVersion: number;
}

export interface PodcastState {
  phase: PodcastPhase;
  hasAudio: boolean;
  /* There is audio, but it was made from older notes or prompts. */
  stale: boolean;
  canGenerate: boolean;
}

export function podcastState(
  row: PodcastRowState | null,
  source: PodcastSourceState | null,
  access: PodcastAccess,
): PodcastState {
  const phase: PodcastPhase = row ? row.status : "none";
  const hasAudio = Boolean(row?.audioUrl);
  const stale =
    hasAudio && source !== null && (row!.sourceHash !== source.hash || row!.promptsVersion !== source.promptsVersion);
  let canGenerate = false;
  if (source !== null && phase !== "generating") {
    canGenerate = hasAudio ? stale && access !== "student" : true;
  }
  return { phase, hasAudio, stale, canGenerate };
}

export interface PodcastLineView {
  speaker: "host" | "guest";
  text: string;
}

export const SPEAKER_LABELS: Record<PodcastLineView["speaker"], string> = { host: "Host", guest: "Guest" };

/* One language's episode as the Podcast tab sees it (props, so plain data). */
export interface PodcastEpisodeView extends PodcastState {
  /* Whether there are notes to talk about (published, for a lesson). */
  hasSource: boolean;
  audioUrl: string | null;
  durationSec: number | null;
  lines: PodcastLineView[];
  error: string | null;
  /* The run to follow while it's being made (or its failure). */
  job: {
    runId: string;
    token: string;
    initial: { status: JobState; stage: string | null; progress: number; message: string | null; error: string | null };
  } | null;
}

export type PodcastEpisodes = Record<PodcastLanguage, PodcastEpisodeView>;
