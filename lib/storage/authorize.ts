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
