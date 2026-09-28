"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";

/* The lesson player owns currentTime (code-standards.md → Video). Every
   other piece — transcript, chapters, notes, later citation chips — reads
   the time from here and moves the video only through seek(sec). */

interface PlayerContextValue {
  videoRef: RefObject<HTMLVideoElement | null>;
  /* Current time in seconds, updated a few times a second while playing. */
  time: number;
  duration: number;
  seek: (sec: number, opts?: { play?: boolean }) => void;
  /* Called by <VideoPlayer> only. */
  report: (time: number, duration?: number) => void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

/* Time updates at most this often (timeupdate can fire at 60 Hz). */
const TICK_MS = 250;

export function PlayerProvider({ initialDuration = 0, children }: { initialDuration?: number; children: ReactNode }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(initialDuration);
  const lastTick = useRef(0);
  const lastTime = useRef(0);

  const report = useCallback((t: number, d?: number) => {
    if (d !== undefined && Number.isFinite(d) && d > 0) setDuration(d);
    const now = performance.now();
    // Always pass a jump (seek) through; throttle steady playback.
    if (now - lastTick.current < TICK_MS && Math.abs(t - lastTime.current) < 1) return;
    lastTick.current = now;
    lastTime.current = t;
    setTime(t);
  }, []);

  const seek = useCallback((sec: number, opts?: { play?: boolean }) => {
    const el = videoRef.current;
    if (!el) return;
    const max = Number.isFinite(el.duration) ? el.duration : Infinity;
    el.currentTime = Math.min(Math.max(0, sec), max);
    lastTime.current = el.currentTime;
    setTime(el.currentTime);
    if (opts?.play !== false && el.paused) el.play().catch(() => {});
  }, []);

  const value = useMemo(() => ({ videoRef, time, duration, seek, report }), [time, duration, seek, report]);
  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

/* For pieces that also work away from the player (the assistant's citation
   chips): null when there is no player on the page. */
export function useOptionalPlayer(): PlayerContextValue | null {
  return useContext(PlayerContext);
}

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used inside <PlayerProvider>.");
  return ctx;
}
