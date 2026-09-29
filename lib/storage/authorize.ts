import type { Role } from "@/lib/db/schema";
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
  /* The document is the viewer's own private upload (feature 19). */
  ownsDocument: (documentId: string, viewer: UploadViewer) => Promise<boolean>;
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

export function uploadRateCheck(role: Role, recentUploads: number): { ok: true } | { ok: false; reason: string } {
  const cap = role === "student" ? UPLOAD_RATE.student : UPLOAD_RATE.staff;
  if (recentUploads < cap) return { ok: true };
  return { ok: false, reason: `That's ${recentUploads} uploads in the last hour, the most allowed. Try again a little later.` };
}

export async function authorizeUpload(
  input: { viewer: UploadViewer | null; pathname: string; clientPayload: string | null },
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
    case "private-document":
      // The owner must be the current user, and the file goes in their own folder (below).
      if (!(await deps.ownsDocument(payload.documentId, viewer))) {
        return { ok: false, reason: "That upload isn't yours." };
      }
      break;
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
