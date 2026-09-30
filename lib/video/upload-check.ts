import { UPLOAD_KINDS } from "@/lib/storage/upload-kinds";

/* The MP4 check for a lecture upload (feature 27), shared by the browser
   (before a byte is sent) and prepareVideoUpload / startLectureUpload (before
   the videos row is made), so the two can't disagree. Pure.

   Browsers name the type from the extension and the OS, so a real MP4 can
   arrive as "", "application/octet-stream" or "video/x-m4v" (Windows often
   does this). A name ending in .mp4 is enough here: ffprobe checks the
   real container and codecs after the upload, and HEVC can hide inside an
   .mp4 anyway. */

export const VIDEO_REQUIREMENTS = "MP4 (H.264 video, AAC audio), up to 2 GB and 60 minutes";

const EXPORT_HINT = "Please export as MP4 (H.264) — in most editors that's the default 'MP4' preset.";

export interface VideoFileInfo {
  name: string;
  type: string;
  size: number;
}

export function looksLikeMp4(file: Pick<VideoFileInfo, "name" | "type">): boolean {
  return file.type === "video/mp4" || file.name.trim().toLowerCase().endsWith(".mp4");
}

/* What's wrong with this file, in words a teacher can act on, or null. */
export function videoFileProblem(file: VideoFileInfo): string | null {
  const name = file.name.trim().toLowerCase();
  if (file.type === "video/quicktime" || name.endsWith(".mov")) return `This is a QuickTime (.mov) file. ${EXPORT_HINT}`;
  if (!looksLikeMp4(file)) return `This isn't an MP4 file. ${EXPORT_HINT}`;
  if (file.size <= 0) return "This file is empty. Choose the exported MP4 again.";
  if (file.size > UPLOAD_KINDS["lesson-video"].maxBytes) return "This video is over 2 GB. Export it at 720p or a lower bitrate.";
  return null;
}

/* "Week_3 - Eigenvalues.mp4" → "Week 3 - Eigenvalues": the lesson title
   the upload dialog suggests. */
export function titleFromVideoName(name: string): string {
  return (
    name
      .replace(/\.[^./\\]+$/, "")
      .replace(/_+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200) || "Lecture"
  );
}
