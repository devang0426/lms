import { createHash } from "node:crypto";
import type { DocumentStatus, Role } from "@/lib/db/schema";
import { isInFolder, UPLOAD_KINDS, uploadFolder, uploadPayloadSchema, type UploadPayload } from "./upload-kinds";

/* Decides whether a user may upload `pathname` with this clientPayload.
   Used before a Blob client token is issued, and again by the local-dev
   confirm action. Pure apart from the injected staff lookup, so it is unit
   tested (authorize.test.ts). */

export interface UploadViewer {
  id: string;
  role: Role;
}

export interface UploadDeps {
  isLessonStaff: (lessonId: string, viewer: UploadViewer) => Promise<boolean>;
  /* A student who can see the assignment and may hand in work now. */
  canSubmitTo: (assignmentId: string, viewer: UploadViewer) => Promise<boolean>;
  /* The viewer's own private upload (feature 19), or null if it isn't
     theirs: its status, and whether a file is attached yet. */
  privateDocument: (documentId: string, viewer: UploadViewer) => Promise<PrivateDocumentState | null>;
}

export interface PrivateDocumentState {
  status: DocumentStatus;
  hasFile: boolean;
}

/* Feature 24 (S5): a private upload is only for a note still waiting for
   its one file. Otherwise a student could keep uploading to a note they
   already own: files never attached, counted or deleted, which is free
   file hosting. */
export function waitingForFile(doc: PrivateDocumentState): boolean {
  return doc.status === "uploading" && !doc.hasFile;
}

export type UploadDecision =
  | {
      ok: true;
      payload: UploadPayload;
      allowedContentTypes: string[];
      maximumSizeInBytes: number;
      /* Signed into the client token and handed back on completion. */
      tokenPayload: string;
    }
  | { ok: false; reason: string };

export interface TokenPayload {
  kind: UploadPayload["kind"];
  userId: string;
  payload: UploadPayload;
}

/* Uploads per person per hour (feature 23), checked before a token is
   issued (not on the local-dev confirm, which follows a finished upload).
   Counted from completed uploads. A private note costs one upload and is
   also limited per hour on its own; a submission can carry five files. */
export const UPLOAD_RATE = { windowMinutes: 60, student: 30, staff: 120 } as const;

/* How a completed upload is logged (one blob.upload audit row per file):
   the row the hourly limit counts. Both Blob's callback and the confirm
   action record an upload, so the row is looked up before it's written;
   the lookup is per file path (feature 24, S5), so every file counts. A
   private upload's row carries only its document id and a hash of the
   path, no file name: admins read the audit log. */
export function uploadRecordKey(payload: UploadPayload, pathname: string): { entityId: string; file: string | null } {
  if (payload.kind !== "private-document") return { entityId: pathname, file: null };
  return { entityId: payload.documentId, file: createHash("sha256").update(pathname).digest("hex").slice(0, 32) };
}

export function uploadRateCheck(role: Role, recentUploads: number): { ok: true } | { ok: false; reason: string } {
  const cap = role === "student" ? UPLOAD_RATE.student : UPLOAD_RATE.staff;
  if (recentUploads < cap) return { ok: true };
  return { ok: false, reason: `That's ${recentUploads} uploads in the last hour, the most allowed. Try again a little later.` };
}

/* `stage` is "token" before a Blob client token is issued, and "confirm"
   when the local-dev confirm action re-checks a finished upload. A file
   being confirmed may already be attached by Blob's own callback, so only
   the token stage asks whether a private note still waits for its file;
   recordUpload deletes a second file either way. */
export async function authorizeUpload(
  input: { viewer: UploadViewer | null; pathname: string; clientPayload: string | null; stage?: "token" | "confirm" },
  deps: UploadDeps,
): Promise<UploadDecision> {
  if (!input.viewer) return { ok: false, reason: "Sign in to upload files." };

  let raw: unknown;
  try {
    raw = JSON.parse(input.clientPayload ?? "");
  } catch {
    return { ok: false, reason: "The upload request was malformed." };
  }
  const parsed = uploadPayloadSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "The upload request was malformed." };
  const payload = parsed.data;
  const viewer = input.viewer;

  switch (payload.kind) {
    case "dev-test":
      if (viewer.role !== "admin") return { ok: false, reason: "Only admins can use the test uploader." };
      break;
    case "lesson-video":
      if (!(await deps.isLessonStaff(payload.lessonId, viewer))) {
        return { ok: false, reason: "Only this course's instructors can upload its videos." };
      }
      break;
    case "lesson-document":
      if (!(await deps.isLessonStaff(payload.lessonId, viewer))) {
        return { ok: false, reason: "Only this course's instructors can add documents to its lessons." };
      }
      break;
    case "submission-file":
      if (!(await deps.canSubmitTo(payload.assignmentId, viewer))) {
        return { ok: false, reason: "This assignment isn't taking work from you right now." };
      }
      break;
    case "private-document": {
      // The owner must be the current user, and the file goes in their own folder (below).
      const doc = await deps.privateDocument(payload.documentId, viewer);
      if (!doc) return { ok: false, reason: "That upload isn't yours." };
      if ((input.stage ?? "token") === "token" && !waitingForFile(doc)) {
        return { ok: false, reason: "This note already has its file. Start a new note to upload another." };
      }
      break;
    }
    default: {
      const never: never = payload;
      return { ok: false, reason: `Unknown upload kind ${JSON.stringify(never)}.` };
    }
  }

  if (!isInFolder(input.pathname, uploadFolder(payload, viewer.id))) {
    return { ok: false, reason: "That file can't be uploaded to this location." };
  }

  const rules = UPLOAD_KINDS[payload.kind];
  const tokenPayload: TokenPayload = { kind: payload.kind, userId: viewer.id, payload };
  return {
    ok: true,
    payload,
    allowedContentTypes: [...rules.contentTypes],
    maximumSizeInBytes: rules.maxBytes,
    tokenPayload: JSON.stringify(tokenPayload),
  };
}
