"use client";

import { useEffect, useRef, type RefObject } from "react";
import { saveWatchProgress } from "@/app/(student)/(focus)/courses/[courseId]/lessons/[lessonId]/actions";
import { MAX_RANGES, mergeRanges, type Range } from "@/lib/video/watch";

/* Records what the student actually watched (feature 11). Continuous
   playback extends the open range; a seek or pause closes it. Progress is
   sent to a server action at most once every 15 s, and as a beacon on
   pagehide or when the player unmounts (client-side navigation). The
   server re-merges the ranges and decides completion. */

const SAVE_EVERY_MS = 15_000;
const BEACON_URL = "/api/progress";

export function useWatchProgress({
  videoRef,
  lessonId,
  enabled,
  initialRanges,
  onCompleted,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  lessonId: string;
  enabled: boolean;
  initialRanges: Range[];
  onCompleted: () => void;
}) {
  const initial = useRef(initialRanges);
  const completed = useRef(onCompleted);
  useEffect(() => {
    completed.current = onCompleted;
  }, [onCompleted]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !enabled) return;

    let closed: Range[] = mergeRanges(initial.current);
    let open: Range | null = null;
    let dirty = false;
    let lastSent = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const closeOpen = () => {
      if (open && open[1] > open[0]) closed = mergeRanges([...closed, open]);
      open = null;
    };
    const snapshot = () => ({
      lessonId,
      positionSec: el.currentTime,
      ranges: mergeRanges(open ? [...closed, open] : closed).slice(0, MAX_RANGES),
    });

    const send = async () => {
      if (!dirty) return;
      dirty = false;
      lastSent = Date.now();
      const result = await saveWatchProgress(snapshot()).catch(() => null);
      if (result?.ok && result.data.newlyCompleted) completed.current();
    };
    // Throttle: one save per 15 s window, scheduled at the window's end.
    const requestSave = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        void send();
      }, Math.max(0, lastSent + SAVE_EVERY_MS - Date.now()));
    };
    const beacon = () => {
      if (!dirty) return;
      dirty = false;
      const body = new Blob([JSON.stringify(snapshot())], { type: "text/plain" });
      navigator.sendBeacon?.(BEACON_URL, body);
    };

    const onTime = () => {
      if (el.paused || el.seeking) return;
      const t = el.currentTime;
      // Allow for throttled timeupdate events at high playback speeds.
      const slack = 3 * Math.max(1, el.playbackRate);
      if (open && t >= open[1] && t - open[1] <= slack) open[1] = t;
      else {
        closeOpen();
        open = [t, t];
      }
      dirty = true;
      requestSave();
    };
    const onBreak = () => {
      closeOpen();
      dirty = true;
      requestSave();
    };

    el.addEventListener("timeupdate", onTime);
    el.addEventListener("seeking", onBreak);
    el.addEventListener("pause", onBreak);
    el.addEventListener("ended", onBreak);
    window.addEventListener("pagehide", beacon);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("seeking", onBreak);
      el.removeEventListener("pause", onBreak);
      el.removeEventListener("ended", onBreak);
      window.removeEventListener("pagehide", beacon);
      clearTimeout(timer);
      closeOpen();
      beacon();
    };
  }, [videoRef, lessonId, enabled]);
}
