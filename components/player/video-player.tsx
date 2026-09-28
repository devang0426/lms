"use client";

import { Captions, Maximize, Minimize, Pause, Play } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Icon, toast } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { formatTime, parseT } from "@/lib/time";
import { resumePosition, type Range } from "@/lib/video/watch";
import { usePlayer } from "./player-context";
import { useWatchProgress } from "./use-watch-progress";

/* Lesson video (wireframe 05): a native <video> with poster and caption
   track in the 540px dark media block, with mono controls — play, time,
   Butter scrubber with chapter markers, speed, CC, fullscreen. It owns
   currentTime; everything else seeks through the player context. */

export interface PlayerChapter {
  title: string;
  startSec: number;
}

const SPEEDS = [1, 1.25, 1.5, 1.75, 2, 0.75] as const;

const controlButton =
  "inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-transparent text-cream hover:bg-cream/10";

export function VideoPlayer({
  lessonId,
  src,
  poster,
  captionsUrl,
  chapters,
  savedPositionSec,
  initialRanges,
  trackProgress,
}: {
  lessonId: string;
  src: string;
  poster: string | null;
  captionsUrl: string | null;
  chapters: PlayerChapter[];
  savedPositionSec: number | null;
  initialRanges: Range[];
  trackProgress: boolean;
}) {
  const { videoRef, time, duration, seek, report } = usePlayer();
  const frameRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  // ?t= is read once, on load; later URL changes don't move the video.
  const [deepLink] = useState(() => parseT(searchParams.get("t")));
  const started = useRef(false);

  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(1);
  const [captions, setCaptions] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [failed, setFailed] = useState(false);

  useWatchProgress({
    videoRef,
    lessonId,
    enabled: trackProgress,
    initialRanges,
    onCompleted: () => toast.success("Lesson complete. Nicely done."),
  });

  const start = useCallback(() => {
    const el = videoRef.current;
    if (!el || started.current) return;
    started.current = true;
    const at = resumePosition({ t: deepLink, positionSec: savedPositionSec, durationSec: el.duration });
    if (at > 0) el.currentTime = at;
    report(el.currentTime, el.duration);
    // A deep link means "play from here". Browsers may block autoplay; the
    // position is set either way.
    if (deepLink !== null) el.play().catch(() => {});
  }, [videoRef, deepLink, savedPositionSec, report]);

  useEffect(() => {
    const el = videoRef.current;
    if (el && el.readyState >= 1) start();
  }, [videoRef, start]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    for (const track of Array.from(el.textTracks)) track.mode = captions ? "showing" : "hidden";
  }, [videoRef, captions]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === frameRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggle = () => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => {});
    else el.pause();
  };
  const nudge = (delta: number) => seek((videoRef.current?.currentTime ?? 0) + delta, { play: false });
  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed as (typeof SPEEDS)[number]) + 1) % SPEEDS.length];
    setSpeed(next);
    if (videoRef.current) videoRef.current.playbackRate = next;
  };
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else frameRef.current?.requestFullscreen().catch(() => {});
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const onControl = e.target instanceof HTMLButtonElement || (e.target as HTMLElement).role === "slider";
    switch (e.key) {
      case " ":
      case "k":
        if (onControl && e.key === " ") return;
        toggle();
        break;
      case "ArrowLeft":
      case "ArrowRight":
        if (onControl) return;
        nudge(e.key === "ArrowLeft" ? -5 : 5);
        break;
      case "j":
      case "l":
        nudge(e.key === "j" ? -10 : 10);
        break;
      case "c":
        if (captionsUrl) setCaptions((c) => !c);
        break;
      case "f":
        toggleFullscreen();
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  return (
    <div
      ref={frameRef}
      onKeyDown={onKeyDown}
      className="group/player flex w-full flex-col overflow-hidden rounded-card bg-media"
      aria-label="Lesson video"
      role="region"
    >
      <div className="relative min-h-0 flex-1">
        <video
          ref={videoRef}
          src={src}
          poster={poster ?? undefined}
          preload="metadata"
          playsInline
          crossOrigin="anonymous"
          onClick={toggle}
          onLoadedMetadata={start}
          onDurationChange={(e) => report(e.currentTarget.currentTime, e.currentTarget.duration)}
          onTimeUpdate={(e) => report(e.currentTarget.currentTime)}
          onSeeked={(e) => report(e.currentTarget.currentTime)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onError={() => setFailed(true)}
          className={cn("block aspect-video w-full cursor-pointer bg-media object-contain", fullscreen && "aspect-auto h-full")}
        >
          {captionsUrl && <track kind="captions" src={captionsUrl} srcLang="en" label="English" />}
        </video>

        {failed ? (
          <p role="alert" className="absolute inset-0 m-0 flex items-center justify-center p-6 text-center text-small text-cream">
            This video couldn&apos;t load. Check your connection, then reload the page.
          </p>
        ) : (
          !playing && (
            <button
              type="button"
              onClick={toggle}
              aria-label="Play"
              className="absolute top-1/2 left-1/2 flex size-16 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-paper text-terracotta shadow-raised hover:text-terracotta-hover"
            >
              <Icon icon={Play} size={24} fill="currentColor" />
            </button>
          )
        )}
      </div>

      <div className="flex items-center gap-2 px-3 py-2.5 font-mono text-meta text-cream sm:gap-3 sm:px-4">
        <button type="button" onClick={toggle} aria-label={playing ? "Pause" : "Play"} className={controlButton}>
          <Icon icon={playing ? Pause : Play} size={18} fill="currentColor" />
        </button>
        <span className="shrink-0 tabular-nums" aria-live="off">
          {formatTime(time)} <span className="text-cream/60">/ {formatTime(duration)}</span>
        </span>
        <Scrubber time={time} duration={duration} chapters={chapters} onSeek={(s) => seek(s, { play: false })} />
        <button
          type="button"
          onClick={cycleSpeed}
          aria-label={`Playback speed ${speed}×. Change speed`}
          className={cn(controlButton, "w-auto px-2.5 tabular-nums")}
        >
          {speed}×
        </button>
        {captionsUrl && (
          <button
            type="button"
            onClick={() => setCaptions((c) => !c)}
            aria-label="Captions"
            aria-pressed={captions}
            className={cn(controlButton, captions && "bg-cream/15 text-butter")}
          >
            <Icon icon={Captions} size={18} />
          </button>
        )}
        <button
          type="button"
          onClick={toggleFullscreen}
          aria-label={fullscreen ? "Exit full screen" : "Full screen"}
          className={cn(controlButton, "hidden sm:inline-flex")}
        >
          <Icon icon={fullscreen ? Minimize : Maximize} size={18} />
        </button>
      </div>
    </div>
  );
}

/* 4px scrubber: cream track at 25%, Butter fill, chapter markers. Drag,
   click or use the arrow keys (±5 s; Page Up/Down ±60 s; Home/End). */
function Scrubber({
  time,
  duration,
  chapters,
  onSeek,
}: {
  time: number;
  duration: number;
  chapters: PlayerChapter[];
  onSeek: (sec: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const shown = drag ?? time;
  const pct = duration > 0 ? Math.min(100, (shown / duration) * 100) : 0;

  const timeAt = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || duration <= 0) return 0;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * duration;
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (duration <= 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag(timeAt(e.clientX));
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (drag !== null) setDrag(timeAt(e.clientX));
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (drag === null) return;
    onSeek(timeAt(e.clientX));
    setDrag(null);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowLeft: -5, ArrowRight: 5, ArrowDown: -5, ArrowUp: 5, PageDown: -60, PageUp: 60 }[e.key];
    if (step !== undefined) onSeek(time + step);
    else if (e.key === "Home") onSeek(0);
    else if (e.key === "End") onSeek(duration);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(shown)}
      aria-valuetext={`${formatTime(shown)} of ${formatTime(duration)}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setDrag(null)}
      onKeyDown={onKeyDown}
      className="group/scrub relative flex h-6 min-w-0 flex-1 cursor-pointer touch-none items-center rounded-full"
    >
      <div ref={trackRef} className="relative h-1 w-full rounded-full bg-cream/25">
        <div className="absolute inset-y-0 left-0 rounded-full bg-butter" style={{ width: `${pct}%` }} />
        {duration > 0 &&
          chapters
            .filter((c) => c.startSec > 0 && c.startSec < duration)
            .map((c) => (
              <span
                key={`${c.startSec}-${c.title}`}
                title={`${formatTime(c.startSec)} · ${c.title}`}
                className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-media"
                style={{ left: `${(c.startSec / duration) * 100}%` }}
              />
            ))}
        <span
          className={cn(
            "absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-butter opacity-0 transition-opacity",
            "group-hover/scrub:opacity-100 group-focus-visible/scrub:opacity-100",
            drag !== null && "opacity-100",
          )}
          style={{ left: `${pct}%` }}
        />
      </div>
    </div>
  );
}
