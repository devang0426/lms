import "server-only";

import { auditInsert } from "@/lib/db/audit";
import { claimLessonPodcast, claimNotePodcast, getLessonPodcast, getNotePodcast, markPodcastFailed, type LessonPodcast } from "@/lib/db/podcasts";
import type { Job, User } from "@/lib/db/schema";
import { getJobAccessToken, latestJobFor, startJob } from "@/lib/jobs";
import { TERMINAL_JOB_STATES } from "@/lib/jobs/stages";
import {
  PODCAST_LANGUAGES,
  podcastState,
  type PodcastAccess,
  type PodcastEpisodes,
  type PodcastEpisodeView,
  type PodcastLanguage,
  type PodcastLength,
  type PodcastState,
} from "@/lib/study/podcast";
import { fail, ok, type ActionResult } from "@/lib/utils/action-result";

/* Lesson podcasts (feature 17): what the player's Podcast tab shows, and
   starting a generation. Both run only after getLessonForUser has let the
   viewer into the lesson; `access` is what it returned. A private note's
   podcast (feature 19) works the same for its owner, whose reads are
   scoped to them and whose runs go in their own copy of the queue. */

const entity = (podcastId: string) => ({ type: "podcast", id: podcastId });

/* The Podcast tab: every language's episode (English, and Hinglish). */
export async function getPodcastTabs(lessonId: string, access: PodcastAccess, length: PodcastLength = "short"): Promise<PodcastEpisodes> {
  return byLanguage(async (language) => episodeView(await getLessonPodcast(lessonId, length, language), access));
}

/* The note page's Podcast tab: the owner's own note only. */
export async function getNotePodcastTabs(noteId: string, ownerId: string, length: PodcastLength = "short"): Promise<PodcastEpisodes> {
  return byLanguage(async (language) => episodeView(await getNotePodcast(noteId, ownerId, length, language), "owner"));
}

async function byLanguage(load: (language: PodcastLanguage) => Promise<PodcastEpisodeView>): Promise<PodcastEpisodes> {
  const views = await Promise.all(PODCAST_LANGUAGES.map((l) => load(l.value)));
  return Object.fromEntries(PODCAST_LANGUAGES.map((l, i) => [l.value, views[i]])) as PodcastEpisodes;
}

async function episodeView({ row, source }: LessonPodcast, access: PodcastAccess): Promise<PodcastEpisodeView> {
  let status = row?.status ?? null;
  let error = row?.error ?? null;
  let job: { job: Job; token: string } | null = null;

  if (row && (status === "generating" || status === "failed")) {
    const latest = await latestJobFor(entity(row.id), "generate-podcast");
    // A run that died before the task started never ran its failure hook.
    if (status === "generating" && latest && TERMINAL_JOB_STATES.includes(latest.status) && latest.status !== "completed") {
      error = latest.error ?? "The podcast stopped before it was finished.";
      await markPodcastFailed(row.id, error);
      status = "failed";
    }
    if (latest && !(status === "failed" && row.audioUrl)) job = { job: latest, token: await getJobAccessToken(latest) };
  }

  const state = podcastState(row && { ...row, status: status! }, source, access);
  return {
    ...state,
    hasSource: source !== null,
    audioUrl: row?.audioUrl ?? null,
    durationSec: row?.durationSec ?? null,
    lines: (row?.script ?? []).map((l) => ({ speaker: l.speaker, text: l.text })),
    error,
    job: job && {
      runId: job.job.triggerRunId,
      token: job.token,
      initial: { status: job.job.status, stage: job.job.stage, progress: job.job.progress, message: job.job.message, error: job.job.error },
    },
  };
}

/* Start one, if the rules in lib/study/podcast allow it. The claim is a
   single conditional upsert, so two students pressing Generate at once
   start one run. */
export async function requestLessonPodcast(
  user: Pick<User, "id">,
  lessonId: string,
  access: PodcastAccess,
  length: PodcastLength,
  language: PodcastLanguage = "en",
): Promise<ActionResult> {
  const { row, source } = await getLessonPodcast(lessonId, length, language);
  if (!source) return fail("invalid", "The podcast is made from the lesson notes, and they aren't published yet.");
  const state = podcastState(row, source, access);
  if (!state.canGenerate) return fail("conflict", conflictMessage(state));

  const podcastId = await claimLessonPodcast({ lessonId, length, language, userId: user.id, sourceHash: source.hash, allowStale: access === "staff" });
  if (!podcastId) return fail("conflict", "Someone else just started this podcast. It will appear here when it's ready.");

  if (!(await startPodcastRun(podcastId, user.id))) return fail("invalid", "The podcast couldn't be started. Try again in a minute.");
  await auditInsert({ actorId: user.id, action: "podcast.generate", entityType: "lesson", entityId: lessonId, data: { length, language } });
  return ok();
}

/* The same for a private note, whose owner the caller has checked. */
export async function requestNotePodcast(
  user: Pick<User, "id">,
  noteId: string,
  length: PodcastLength,
  language: PodcastLanguage = "en",
): Promise<ActionResult> {
  const { row, source } = await getNotePodcast(noteId, user.id, length, language);
  if (!source) return fail("invalid", "The podcast is made from your notes, and they aren't written yet.");
  const state = podcastState(row, source, "owner");
  if (!state.canGenerate) return fail("conflict", conflictMessage(state));

  const podcastId = await claimNotePodcast({ noteId, length, language, userId: user.id, sourceHash: source.hash });
  if (!podcastId) return fail("conflict", "This podcast is already being made. It will appear here when it's ready.");

  if (!(await startPodcastRun(podcastId, user.id, user.id))) return fail("invalid", "The podcast couldn't be started. Try again in a minute.");
  await auditInsert({ actorId: user.id, action: "podcast.generate", entityType: "note", entityId: noteId, data: { length, language } });
  return ok();
}

/* False (and the claim released as failed) when the run couldn't start. */
async function startPodcastRun(podcastId: string, userId: string, concurrencyKey?: string): Promise<boolean> {
  try {
    await startJob({
      kind: "generate-podcast",
      entity: entity(podcastId),
      payload: { podcastId },
      createdBy: userId,
      // The claim already allows only one run; a new key lets a failed one be retried.
      idempotencyKey: `podcast:${podcastId}:${Date.now()}`,
      concurrencyKey,
    });
    return true;
  } catch (err) {
    console.error("[podcast] couldn't start the job", err);
    await markPodcastFailed(podcastId, "The podcast couldn't be started. Try again in a minute.");
    return false;
  }
}

function conflictMessage(state: PodcastState): string {
  if (state.phase === "generating") return "This podcast is already being made. It will appear here when it's ready.";
  if (state.stale) return "Only the course staff can remake a podcast after the notes change.";
  return "This podcast is already up to date.";
}
