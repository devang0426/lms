/* Transcript segments → WebVTT captions (feature 10). Pure.
   Times stay in seconds everywhere else; they are only formatted here. */

export interface CaptionSegment {
  startSec: number;
  endSec: number;
  text: string;
}

/* 75.5 → "00:01:15.500" */
export function vttTimestamp(sec: number): string {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const rest = ms % 1000;
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(rest, 3)}`;
}

/* Cue text is HTML-like: escape markup, and never let a cue contain a
   blank line or "-->", which would end or corrupt the cue. */
function cueText(text: string): string {
  return text
    .replace(/-->/g, "→") // before escaping ">", or it slips through as --&gt;
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

export function segmentsToVtt(segments: CaptionSegment[]): string {
  const cues: string[] = [];
  for (const seg of [...segments].sort((a, b) => a.startSec - b.startSec)) {
    const text = cueText(seg.text);
    if (!text) continue;
    // A cue must end after it starts; Whisper occasionally emits zero-length ones.
    const end = Math.max(seg.endSec, seg.startSec + 0.5);
    cues.push(`${cues.length + 1}\n${vttTimestamp(seg.startSec)} --> ${vttTimestamp(end)}\n${text}`);
  }
  return `WEBVTT\n\n${cues.join("\n\n")}${cues.length ? "\n" : ""}`;
}
