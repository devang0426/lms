import "server-only";

import { handInWork, type HandInResult } from "@/lib/db/assignments";
import type { Viewer } from "@/lib/db/courses";
import type { SubmissionFile } from "@/lib/db/schema";
import { deleteBlobs, headBlob } from "@/lib/storage/blob";
import { isInFolder, submissionFolder, SUBMISSION_TYPES, UPLOAD_KINDS } from "@/lib/storage/upload-kinds";

/* Handing in work (feature 20), web side. The browser has already put
   the files in Blob (upload kind "submission-file"); here each one is
   checked against the store before it joins the submission, so a student
   can only attach their own uploads for this assignment. Size and type
   come from Blob, not from the browser. */

export interface FileRef {
  url: string;
  pathname: string;
  name: string;
}

function urlMatchesPath(url: string, pathname: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && decodeURIComponent(u.pathname) === `/${pathname}`;
  } catch {
    return false;
  }
}

async function verifyFiles(refs: FileRef[], assignmentId: string, userId: string): Promise<SubmissionFile[] | null> {
  const folder = submissionFolder(assignmentId, userId);
  const rules = UPLOAD_KINDS["submission-file"];
  const checked = await Promise.all(
    refs.map(async (ref) => {
      if (!isInFolder(ref.pathname, folder) || !urlMatchesPath(ref.url, ref.pathname)) return null;
      // A URL that isn't in our store makes Blob throw; that's a bad ref, not a crash.
      const blob = await headBlob(ref.url).catch(() => null);
      if (!blob || blob.pathname !== ref.pathname) return null;
      if (!(SUBMISSION_TYPES as readonly string[]).includes(blob.contentType) || blob.size > rules.maxBytes) return null;
      return { url: blob.url, pathname: blob.pathname, name: ref.name.trim().slice(0, 200) || "file", contentType: blob.contentType, size: blob.size };
    }),
  );
  return checked.every((f) => f !== null) ? checked : null;
}

export type HandInOutcome = HandInResult | { ok: false; reason: "bad_files" };

export async function handIn(
  viewer: Viewer,
  input: { assignmentId: string; text: string; keep: number[]; files: FileRef[] },
): Promise<HandInOutcome> {
  const add = await verifyFiles(input.files, input.assignmentId, viewer.id);
  if (!add) return { ok: false, reason: "bad_files" };
  const result = await handInWork(viewer, input.assignmentId, { text: input.text, keep: input.keep, add });
  // A replaced submission's dropped files aren't referenced any more.
  if (result.ok && result.replaced.length > 0) {
    await deleteBlobs(result.replaced.map((f) => f.url)).catch((err) => console.error("[hand-in] couldn't delete replaced files", err));
  }
  return result;
}
