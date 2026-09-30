import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { podcastSource } from "@/lib/ai/generation/podcast";
import { PODCAST_PROMPTS_VERSION } from "@/lib/ai/prompts";
import type { Block, PodcastLine } from "@/lib/ai/types";
import { PODCAST_LANGUAGES, type PodcastLanguage, type PodcastLength } from "@/lib/study/podcast";
import { db, type BatchRows } from "./client";
import { lessons, notes, podcasts, type PodcastRow } from "./schema";

/* Lesson podcasts (feature 17). A podcast is made from the lesson's
   *published* notes, so it never says anything students can't read.
   Callers check access: the player and its action only ask after
   getLessonForUser has passed, and the task runs as the system. A private
   note's podcast (feature 19) is made from the note, and every read of it
   is scoped to the note's owner. */

export interface LessonPodcast {
  row: PodcastRow | null;
  /* Fingerprint of the published notes; null when none are published. */
  source: { hash: string; promptsVersion: number } | null;
}

async function publishedNoteBlocks(lessonId: string): Promise<Block[] | null> {
  const [note] = await db
    .select({ blocks: notes.blocks })
    .from(notes)
    .where(and(eq(notes.lessonId, lessonId), eq(notes.status, "published")))
    .limit(1);
  return note?.blocks ?? null;
}

/* The Podcast tab's statements for a batch (feature 29): the published
   notes and this length's episode in every language. */
export function lessonPodcastQueries(lessonId: string, length: PodcastLength) {
  return [
    db
      .select({ blocks: notes.blocks })
      .from(notes)
      .where(and(eq(notes.lessonId, lessonId), eq(notes.status, "published")))
      .limit(1),
    db
      .select()
      .from(podcasts)
      .where(and(eq(podcasts.lessonId, lessonId), eq(podcasts.length, length))),
  ] as const;
}

export function toLessonPodcasts([noteRows, podcastRows]: BatchRows<ReturnType<typeof lessonPodcastQueries>>): Record<PodcastLanguage, LessonPodcast> {
  const src = noteRows[0] ? podcastSource(noteRows[0].blocks) : null;
  const source = src && { hash: src.hash, promptsVersion: PODCAST_PROMPTS_VERSION };
  return Object.fromEntries(
    PODCAST_LANGUAGES.map((l) => [l.value, { row: podcastRows.find((r) => r.language === l.value) ?? null, source }]),
  ) as Record<PodcastLanguage, LessonPodcast>;
}

/* The stored podcast and the current source, in one round trip. */
export async function getLessonPodcast(lessonId: string, length: PodcastLength, language: PodcastLanguage = "en"): Promise<LessonPodcast> {
  const [noteRows, podcastRows] = await db.batch([
    db
      .select({ blocks: notes.blocks })
      .from(notes)
      .where(and(eq(notes.lessonId, lessonId), eq(notes.status, "published")))
      .limit(1),
    db
      .select()
      .from(podcasts)
      .where(and(eq(podcasts.lessonId, lessonId), eq(podcasts.length, length), eq(podcasts.language, language)))
      .limit(1),
  ]);
  const src = noteRows[0] ? podcastSource(noteRows[0].blocks) : null;
  return { row: podcastRows[0] ?? null, source: src && { hash: src.hash, promptsVersion: PODCAST_PROMPTS_VERSION } };
}

/* Start a generation, atomically: at most one runs per (lesson, length, language),
   and an up-to-date podcast is never made again. `allowStale` (staff)
   also replaces audio made from older notes or prompts. Returns the row
   id, or null when someone else got there first or it's already current. */
export async function claimLessonPodcast(input: {
  lessonId: string;
  length: PodcastLength;
  language: PodcastLanguage;
  userId: string;
  sourceHash: string;
  allowStale: boolean;
}): Promise<string | null> {
  const stale = input.allowStale
    ? sql`(podcasts.source_hash is distinct from ${input.sourceHash} or podcasts.prompts_version is distinct from ${PODCAST_PROMPTS_VERSION})`
    : sql`false`;
  const [row] = await db
    .insert(podcasts)
    .values({ lessonId: input.lessonId, length: input.length, language: input.language, status: "generating", requestedBy: input.userId })
    .onConflictDoUpdate({
      target: [podcasts.lessonId, podcasts.length, podcasts.language],
      set: { status: "generating", error: null, requestedBy: input.userId, updatedAt: new Date() },
      setWhere: sql`podcasts.status <> 'generating' and (podcasts.audio_url is null or ${stale})`,
    })
    .returning({ id: podcasts.id });
  return row?.id ?? null;
}

/* A private note's podcast and its source: the note itself, the owner's
   only (feature 19). */
export async function getNotePodcast(noteId: string, ownerId: string, length: PodcastLength, language: PodcastLanguage = "en"): Promise<LessonPodcast> {
  const [noteRows, podcastRows] = await db.batch([
    db
      .select({ blocks: notes.blocks })
      .from(notes)
      .where(and(eq(notes.id, noteId), eq(notes.ownerId, ownerId)))
      .limit(1),
    db
      .select({ podcast: podcasts })
      .from(podcasts)
      .innerJoin(notes, eq(notes.id, podcasts.noteId))
      .where(and(eq(podcasts.noteId, noteId), eq(podcasts.length, length), eq(podcasts.language, language), eq(notes.ownerId, ownerId)))
      .limit(1),
  ]);
  const src = noteRows[0] ? podcastSource(noteRows[0].blocks) : null;
  return { row: podcastRows[0]?.podcast ?? null, source: src && { hash: src.hash, promptsVersion: PODCAST_PROMPTS_VERSION } };
}

/* claimLessonPodcast for a private note. The owner may always remake a
   stale one; the caller has checked the note is theirs. */
export async function claimNotePodcast(input: {
  noteId: string;
  length: PodcastLength;
  language: PodcastLanguage;
  userId: string;
  sourceHash: string;
}): Promise<string | null> {
  const stale = sql`(podcasts.source_hash is distinct from ${input.sourceHash} or podcasts.prompts_version is distinct from ${PODCAST_PROMPTS_VERSION})`;
  const [row] = await db
    .insert(podcasts)
    .values({ noteId: input.noteId, length: input.length, language: input.language, status: "generating", requestedBy: input.userId })
    .onConflictDoUpdate({
      target: [podcasts.noteId, podcasts.length, podcasts.language],
      set: { status: "generating", error: null, requestedBy: input.userId, updatedAt: new Date() },
      setWhere: sql`podcasts.status <> 'generating' and (podcasts.audio_url is null or ${stale})`,
    })
    .returning({ id: podcasts.id });
  return row?.id ?? null;
}

/* Everything the task needs: what the episode is called and made from,
   and, for a private note, whose it is (its MP3 goes in their folder). */
export async function loadPodcastJob(podcastId: string) {
  const [row] = await db
    .select({
      podcast: podcasts,
      lessonTitle: lessons.title,
      note: { title: notes.title, ownerId: notes.ownerId, blocks: notes.blocks },
    })
    .from(podcasts)
    .leftJoin(lessons, eq(lessons.id, podcasts.lessonId))
    .leftJoin(notes, eq(notes.id, podcasts.noteId))
    .where(eq(podcasts.id, podcastId))
    .limit(1);
  if (!row) return null;
  if (row.podcast.noteId) {
    if (!row.note?.ownerId) return null;
    return { podcast: row.podcast, title: row.note.title, ownerId: row.note.ownerId, source: podcastSource(row.note.blocks) };
  }
  if (!row.podcast.lessonId || row.lessonTitle === null) return null;
  const blocks = await publishedNoteBlocks(row.podcast.lessonId);
  return { podcast: row.podcast, title: row.lessonTitle, ownerId: null, source: blocks ? podcastSource(blocks) : null };
}

/* The new episode replaces the old one in one write. */
export async function savePodcastEpisode(
  podcastId: string,
  episode: { script: PodcastLine[]; audioUrl: string; audioPathname: string; durationSec: number; sourceHash: string },
): Promise<void> {
  await db
    .update(podcasts)
    .set({ ...episode, status: "ready", error: null, promptsVersion: PODCAST_PROMPTS_VERSION })
    .where(eq(podcasts.id, podcastId));
}

/* A run that found the stored episode already up to date. */
export async function markPodcastReady(podcastId: string): Promise<void> {
  await db.update(podcasts).set({ status: "ready", error: null }).where(eq(podcasts.id, podcastId));
}

/* A failed generation keeps any older audio playable. */
export async function markPodcastFailed(podcastId: string, error: string): Promise<void> {
  await db
    .update(podcasts)
    .set({ status: "failed", error })
    .where(and(eq(podcasts.id, podcastId), eq(podcasts.status, "generating")));
}
