/* Watch progress rules (feature 11). Pure: the player builds ranges in the
   browser and the server re-merges and re-checks them against the video's
   real duration before saving. A range is [startSec, endSec]. */

export type Range = [number, number];

/* A lesson completes once this share of the video has been watched. */
export const COMPLETE_FRACTION = 0.9;
/* Resume from the saved position unless it is this close to the end. */
export const RESUME_END_MARGIN_SEC = 10;
/* Gaps smaller than this between ranges are treated as continuous. */
const JOIN_GAP_SEC = 1;
/* Stored rows stay small even after a lot of skipping around. */
export const MAX_RANGES = 200;

/* Sort, clamp to [0, duration] and merge overlapping or near-touching
   ranges. Invalid pairs (non-finite, empty, reversed) are dropped. */
export function mergeRanges(ranges: readonly Range[], durationSec = Infinity): Range[] {
  const clean = ranges
    .filter((r) => Array.isArray(r) && Number.isFinite(r[0]) && Number.isFinite(r[1]))
    .map(([a, b]): Range => [Math.max(0, a), Math.min(b, durationSec)])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);

  const out: Range[] = [];
  for (const [a, b] of clean) {
    const last = out[out.length - 1];
    if (last && a <= last[1] + JOIN_GAP_SEC) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

export function watchedSeconds(ranges: readonly Range[], durationSec = Infinity): number {
  return mergeRanges(ranges, durationSec).reduce((sum, [a, b]) => sum + (b - a), 0);
}

export function watchedFraction(ranges: readonly Range[], durationSec: number): number {
  if (!(durationSec > 0)) return 0;
  return Math.min(1, watchedSeconds(ranges, durationSec) / durationSec);
}

export function isWatchedEnough(ranges: readonly Range[], durationSec: number): boolean {
  return watchedFraction(ranges, durationSec) >= COMPLETE_FRACTION;
}

/* Where playback starts: a valid `?t=` wins; otherwise the saved
   position, unless that is within 10 s of the end (start over). */
export function resumePosition(input: {
  t: number | null;
  positionSec: number | null | undefined;
  durationSec: number | null | undefined;
}): number {
  const duration = input.durationSec && input.durationSec > 0 ? input.durationSec : Infinity;
  if (input.t !== null && Number.isFinite(input.t) && input.t >= 0) return Math.min(input.t, duration);
  const saved = input.positionSec ?? 0;
  if (!(saved > 0) || saved >= duration - RESUME_END_MARGIN_SEC) return 0;
  return saved;
}

/* Index of the transcript segment playing at `sec` (the last one that has
   started), or -1 before the first. Segments are sorted by startSec. */
export function activeIndex(starts: readonly number[], sec: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid] <= sec) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}
