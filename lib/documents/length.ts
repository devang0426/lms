/* How long a recording or YouTube video may be (feature 25, S2). Both are
   transcribed with Whisper (unless YouTube has captions) and then drafted
   from, so the cost grows with the length. Lesson videos have their own
   cap, VIDEO_MAX_MINUTES (lib/video/probe.ts). Pure: the ingest task and
   the tests share it. */

export const DEFAULT_DOCUMENT_MAX_MINUTES = 90;

/* DOCUMENT_MAX_MINUTES, in seconds. Set it in the Trigger.dev dashboard
   too: the ingest task reads it there. */
export function documentMaxSec(env: Record<string, string | undefined> = process.env): number {
  const minutes = Number(env.DOCUMENT_MAX_MINUTES);
  return (Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_DOCUMENT_MAX_MINUTES) * 60;
}

/* The refusal when the source runs over, else null. An unknown length (0)
   isn't refused here: the transcription step checks again by its pieces. */
export function tooLongMessage(kind: "audio" | "youtube", durationSec: number, maxSec: number): string | null {
  if (!(durationSec > maxSec)) return null;
  const limit = `${Math.round(maxSec / 60)} minutes`;
  return kind === "audio"
    ? `This recording is ${lengthLabel(durationSec)} long. The longest we can take is ${limit}: trim it, or split it into parts and add each one.`
    : `This video is ${lengthLabel(durationSec)} long. The longest we can take is ${limit}: pick a shorter video, or upload part of it as a recording.`;
}

/* "95 minutes", "3 h 5 min". */
function lengthLabel(sec: number): string {
  const minutes = Math.round(sec / 60);
  if (minutes < 120) return `${minutes} minutes`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} hours`;
}
