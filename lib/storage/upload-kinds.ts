import { z } from "zod";

/* Blob pathname conventions (architecture.md → Storage Model) and the
   rules for each kind of browser upload. Pure and shared: the upload UI
   builds pathnames with these, and the server re-checks them before it
   issues a token. Add a kind here when a feature needs a new upload. */

export const blobPaths = {
  videoSource: (lessonId: string) => `videos/${lessonId}/source.mp4`,
  videoPoster: (lessonId: string) => `videos/${lessonId}/poster.jpg`,
  videoCaptions: (lessonId: string) => `videos/${lessonId}/captions.vtt`,
  doc: (lessonId: string, name: string) => `docs/${lessonId}/${safeFileName(name)}`,
  podcast: (lessonId: string, length: string) => `podcasts/${lessonId}/${length}.mp3`,
  submission: (assignmentId: string, userId: string, name: string) =>
    `${submissionFolder(assignmentId, userId)}${safeFileName(name)}`,
  private: (userId: string, name: string) => `${privateFolder(userId)}${safeFileName(name)}`,
  devTest: (userId: string, name: string) => `dev/${userId}/${safeFileName(name)}`,
};

/* A student's private space (feature 19): their uploads and note podcasts. */
export function privateFolder(userId: string): string {
  return `private/${userId}/`;
}

/* Only this student's files for this assignment live here. */
export function submissionFolder(assignmentId: string, userId: string): string {
  return `submissions/${assignmentId}/${userId}/`;
}

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

/* Upload types per document kind (feature 18). */
export const DOCUMENT_TYPES = {
  pdf: ["application/pdf"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  audio: ["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/aac", "audio/wav", "audio/x-wav", "audio/webm", "audio/ogg"],
} as const;

export type UploadedDocumentKind = keyof typeof DOCUMENT_TYPES;

/* What a student may hand in with an assignment (feature 20). */
export const SUBMISSION_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
  "text/plain",
] as const;
export const MAX_SUBMISSION_FILES = 5;

export function documentKindFor(contentType: string): UploadedDocumentKind | null {
  for (const kind of Object.keys(DOCUMENT_TYPES) as UploadedDocumentKind[]) {
    if ((DOCUMENT_TYPES[kind] as readonly string[]).includes(contentType)) return kind;
  }
  return null;
}

/* A document's type from its name: some browsers leave file.type empty
   for .docx and .m4a. */
export function documentTypeFromName(name: string): string {
  const ext = name.toLowerCase().split(".").pop();
  return (
    {
      pdf: "application/pdf",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      mp3: "audio/mpeg",
      m4a: "audio/mp4",
      wav: "audio/wav",
      ogg: "audio/ogg",
      webm: "audio/webm",
    }[ext ?? ""] ?? ""
  );
}

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
  /* A document for a lesson (feature 18): PDF, Word, or a recording. */
  "lesson-document": {
    contentTypes: [...DOCUMENT_TYPES.pdf, ...DOCUMENT_TYPES.docx, ...DOCUMENT_TYPES.audio],
    maxBytes: 200 * MB,
    multipart: true,
  },
  /* A file a student hands in with an assignment (feature 20). */
  "submission-file": {
    contentTypes: SUBMISSION_TYPES,
    maxBytes: 25 * MB,
    multipart: false,
  },
  /* A student's own material for their private space (feature 19): the
     same files a lesson takes. */
  "private-document": {
    contentTypes: [...DOCUMENT_TYPES.pdf, ...DOCUMENT_TYPES.docx, ...DOCUMENT_TYPES.audio],
    maxBytes: 200 * MB,
    multipart: true,
  },
} as const;

export type UploadKind = keyof typeof UPLOAD_KINDS;

/* The upload's `clientPayload`, as JSON. */
export const uploadPayloadSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("dev-test") }),
  /* videoId: the videos row prepared for this upload (prepareVideoUpload). */
  z.object({ kind: z.literal("lesson-video"), lessonId: z.uuid(), videoId: z.uuid() }),
  /* documentId: the documents row prepared for this upload (prepareDocumentUpload). */
  z.object({ kind: z.literal("lesson-document"), lessonId: z.uuid(), documentId: z.uuid() }),
  z.object({ kind: z.literal("submission-file"), assignmentId: z.uuid() }),
  /* documentId: the student's own documents row, made with their note (prepareNoteUpload). */
  z.object({ kind: z.literal("private-document"), documentId: z.uuid() }),
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
    case "lesson-document":
      return `docs/${payload.lessonId}/`;
    case "submission-file":
      return submissionFolder(payload.assignmentId, userId);
    case "private-document":
      return privateFolder(userId);
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
