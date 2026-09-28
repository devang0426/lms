import { z } from "zod";

/* Blob pathname conventions (architecture.md → Storage Model) and the
   rules for each kind of browser upload. Pure and shared: the upload UI
   builds pathnames with these, and the server re-checks them before it
   issues a token. Add a kind here when a feature needs a new upload. */

export const blobPaths = {
  videoSource: (lessonId: string) => `videos/${lessonId}/source.mp4`,
  videoPoster: (lessonId: string) => `videos/${lessonId}/poster.jpg`,
  videoCaptions: (lessonId: string) => `videos/${lessonId}/captions.vtt`,
  doc: (courseId: string, name: string) => `docs/${courseId}/${safeFileName(name)}`,
  podcast: (lessonId: string) => `podcasts/${lessonId}/episode.mp3`,
  submission: (assignmentId: string, userId: string, name: string) =>
    `submissions/${assignmentId}/${userId}/${safeFileName(name)}`,
  private: (userId: string, name: string) => `private/${userId}/${safeFileName(name)}`,
  devTest: (userId: string, name: string) => `dev/${userId}/${safeFileName(name)}`,
};

/* The seeded demo lecture's files (feature 12, scripts/export-lecture.ts).
   Shared by every database seeded from the fixture, so the app never
   deletes them — see deleteBlobs(). */
export const DEMO_LECTURE_PREFIX = "demo/lecture/";

export function isDemoLectureUrl(url: string): boolean {
  try {
    return new URL(url).pathname.startsWith(`/${DEMO_LECTURE_PREFIX}`);
  } catch {
    return false;
  }
}

const MB = 1024 * 1024;

export const UPLOAD_KINDS = {
  /* Admin-only smoke test from /dev/jobs. */
  "dev-test": {
    contentTypes: ["text/plain", "image/png", "image/jpeg", "application/pdf"],
    maxBytes: 10 * MB,
    multipart: false,
  },
  /* A lesson's lecture video (feature 10). MP4 only: no transcoding. */
  "lesson-video": {
    contentTypes: ["video/mp4"],
    maxBytes: 2048 * MB,
    multipart: true,
  },
} as const;

export type UploadKind = keyof typeof UPLOAD_KINDS;

/* The upload's `clientPayload`, as JSON. */
export const uploadPayloadSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("dev-test") }),
  /* videoId: the videos row prepared for this upload (prepareVideoUpload). */
  z.object({ kind: z.literal("lesson-video"), lessonId: z.uuid(), videoId: z.uuid() }),
]);
export type UploadPayload = z.infer<typeof uploadPayloadSchema>;

/* The folder an upload of this kind must land in. Blob appends a random
   suffix to the file name, so ownership is checked on the folder. */
export function uploadFolder(payload: UploadPayload, userId: string): string {
  switch (payload.kind) {
    case "dev-test":
      return `dev/${userId}/`;
    case "lesson-video":
      return `videos/${payload.lessonId}/`;
    default: {
      const never: never = payload;
      throw new Error(`Unknown upload kind: ${JSON.stringify(never)}`);
    }
  }
}

/* Blob's random suffix is mixed-case, so uppercase is allowed here. */
const SAFE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,120}$/;

/* Lowercase, ASCII, no spaces or slashes: "Week 1 Notes.PDF" → "week-1-notes.pdf". */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // accents: "é" → "e"
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[-.]+/, "")
    .replace(/-+/g, "-")
    .slice(0, 80);
  return cleaned || "file";
}

/* True when `pathname` is a single safe file directly inside `folder`. */
export function isInFolder(pathname: string, folder: string): boolean {
  if (!pathname.startsWith(folder)) return false;
  return SAFE_NAME.test(pathname.slice(folder.length));
}
