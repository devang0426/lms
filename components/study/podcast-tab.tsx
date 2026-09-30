"use client";

import { AudioLines, RotateCcw } from "lucide-react";
import { useState, useTransition } from "react";
import { generatePodcast } from "@/app/(student)/(focus)/courses/[courseId]/lessons/[lessonId]/podcast-actions";
import { generateNotePodcast } from "@/app/(student)/(sidebar)/space/[noteId]/actions";
import { JobProgress } from "@/components/jobs/job-progress";
import { Badge, Button, Card, ChipGroup, EmptyState, Eyebrow, Icon } from "@/components/ui";
import { PODCAST_STAGES } from "@/lib/jobs/stages";
import { PODCAST_LANGUAGES, SPEAKER_LABELS, type PodcastEpisodes, type PodcastEpisodeView, type PodcastLanguage } from "@/lib/study/podcast";
import { formatTime } from "@/lib/time";
import { settle } from "@/lib/utils/action-result";
import { cn } from "@/lib/utils/cn";

/* The lesson player's Podcast tab (feature 17). Nothing is made until
   someone presses Generate; then everyone in the course hears the same
   cached episode. While it's being made, JobProgress follows the run and
   refreshes the page when it ends. A private note's tab (feature 19) is
   its owner's alone, and the owner may remake it like staff.

   Two languages sit side by side behind a switch: English, and Hinglish
   (Hindi in Devanagari mixed with English terms). Each is its own episode,
   made on demand and cached separately. */

export interface PodcastTabProps {
  target: { lessonId: string } | { noteId: string };
  staff: boolean;
  episodes: PodcastEpisodes;
}

export function PodcastTab({ target, staff, episodes }: PodcastTabProps) {
  // Start on a language that already has an episode, English first.
  const [language, setLanguage] = useState<PodcastLanguage>(
    () => PODCAST_LANGUAGES.find((l) => episodes[l.value].hasAudio)?.value ?? "en",
  );
  const episode = episodes[language];
  const meta = PODCAST_LANGUAGES.find((l) => l.value === language)!;

  if (!episode.hasSource && !PODCAST_LANGUAGES.some((l) => episodes[l.value].hasAudio)) {
    const owner = "noteId" in target;
    return (
      <Card padded={false} className="border-dashed">
        <EmptyState
          title="No podcast yet"
          description={
            owner
              ? "The podcast is made from your notes. It can be made once they're written."
              : staff
                ? "The podcast is made from the lesson's study notes. Publish them on the review screen first."
                : "A podcast can be made once this lesson's study notes are published."
          }
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <ChipGroup
        label="Podcast language"
        options={PODCAST_LANGUAGES.map((l) => ({ value: l.value, label: l.label }))}
        value={language}
        onValueChange={(v) => setLanguage(v as PodcastLanguage)}
      />
      {/* Keyed by language, so switching never carries one episode's state into the other. */}
      <Episode key={language} target={target} staff={staff} language={language} htmlLang={meta.htmlLang} episode={episode} />
    </div>
  );
}

function Episode({
  target,
  staff,
  language,
  htmlLang,
  episode,
}: {
  target: PodcastTabProps["target"];
  staff: boolean;
  language: PodcastLanguage;
  htmlLang: string;
  episode: PodcastEpisodeView;
}) {
  const { phase, hasAudio, stale, canGenerate, audioUrl, durationSec, lines, error, job } = episode;
  const [pending, start] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const owner = "noteId" in target;
  const hinglish = language === "hinglish";

  const generate = () =>
    new Promise<void>((resolve) =>
      start(async () => {
        setActionError(null);
        const res =
          "noteId" in target
            ? await settle(generateNotePodcast({ noteId: target.noteId, length: "short", language }))
            : await settle(generatePodcast({ lessonId: target.lessonId, length: "short", language }));
        if (!res.ok) setActionError(res.error.message);
        resolve();
      }),
    );

  const running = job && (phase === "generating" || !hasAudio);
  const what = hinglish ? "Hinglish podcast" : "podcast";

  return (
    <div className="flex flex-col gap-5">
      {running && (
        <JobProgress
          key={job.runId}
          runId={job.runId}
          accessToken={job.token}
          stages={PODCAST_STAGES}
          title={hasAudio ? `Remaking the ${what}` : `Making the ${what}`}
          initial={job.initial}
          retry={canGenerate ? generate : undefined}
        />
      )}

      {!hasAudio && !running && (
        <Card padded={false} className="border-dashed">
          <EmptyState
            title={owner ? "Listen to this note" : "Listen to this lesson"}
            description={
              (hinglish
                ? "A short two-voice conversation in Hinglish: Hindi, with the technical terms in English. "
                : "A short two-voice conversation. ") +
              (owner
                ? "It's made from your notes and takes a few minutes; after that it stays here for you to replay."
                : "It's made from the study notes and takes a few minutes the first time; after that, everyone in the course hears the same episode.")
            }
            action={
              canGenerate && (
                <Button
                  variant="secondary"
                  size="md"
                  loading={pending}
                  leading={<Icon icon={AudioLines} size={16} />}
                  onClick={() => void generate()}
                >
                  {hinglish ? "Generate Hinglish podcast (short)" : "Generate podcast (short)"}
                </Button>
              )
            }
          />
        </Card>
      )}

      {hasAudio && audioUrl && (
        <Card className="gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <Eyebrow>
                Podcast · {hinglish ? "Hinglish" : "English"} · short{durationSec ? ` · ${formatTime(durationSec)}` : ""}
              </Eyebrow>
              <p className="m-0 text-small text-ink-soft">A conversation between a host and a curious guest.</p>
            </div>
            {stale && <Badge tone="warning">Notes changed since</Badge>}
          </div>
          {/* Native controls: keyboard, seeking and speed come with them. */}
          <audio controls preload="metadata" src={audioUrl} className="w-full">
            Your browser can&apos;t play this audio.
          </audio>
          {stale && (staff || owner) && canGenerate && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-butter-tint px-4 py-3">
              <span className="text-small text-butter-ink">
                {owner ? "Your notes were rewritten after this episode was made." : "The study notes were edited after this episode was made."}
              </span>
              <Button
                variant="secondary"
                size="sm"
                loading={pending}
                leading={<Icon icon={RotateCcw} size={16} />}
                onClick={() => void generate()}
              >
                Remake podcast
              </Button>
            </div>
          )}
        </Card>
      )}

      {(actionError || (error && phase === "failed" && !running)) && (
        <p role="alert" className="m-0 rounded-xl bg-clay px-4 py-3 text-small text-clay-ink">
          {actionError ?? error}
        </p>
      )}

      {hasAudio && lines.length > 0 && (
        <section aria-label="Podcast transcript" className="flex flex-col gap-3">
          <h2 className="m-0 text-h3 font-semibold">Transcript</h2>
          <ol lang={htmlLang} className="m-0 flex list-none flex-col gap-3 p-0">
            {lines.map((line, i) => (
              <li key={i} className="flex gap-4">
                <span
                  lang="en"
                  className={cn(
                    "w-12 shrink-0 pt-0.5 font-mono text-meta uppercase",
                    line.speaker === "host" ? "text-ink-soft" : "text-sage-ink",
                  )}
                >
                  {SPEAKER_LABELS[line.speaker]}
                </span>
                <p className="m-0 text-[15px] leading-relaxed text-ink">{line.text}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
