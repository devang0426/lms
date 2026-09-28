"use server";

import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { authorizeUpload, type TokenPayload } from "@/lib/storage/authorize";
import { headBlob, recordUpload, uploadDeps } from "@/lib/storage/blob";
import { fail, ok, type ActionResult } from "@/lib/utils/action-result";

/* Local-dev fallback for Blob's onUploadCompleted callback, which can't
   reach localhost. The browser calls this after upload() resolves. It
   re-checks that the blob exists in our store and that this user was
   allowed to put it there, then records it (idempotently). */

const confirmSchema = z.object({ url: z.url(), clientPayload: z.string().max(2000) });

export async function confirmUpload(
  input: z.input<typeof confirmSchema>,
): Promise<ActionResult<{ pathname: string; size: number }>> {
  const parsed = confirmSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", "That upload couldn't be confirmed.");

  const viewer = await getCurrentUser();
  if (!viewer) return fail("unauthorized", "Your session has ended. Sign in again.");

  const blob = await headBlob(parsed.data.url);
  if (!blob) return fail("not_found", "The uploaded file wasn't found. Try uploading it again.");

  const decision = await authorizeUpload(
    { viewer, pathname: blob.pathname, clientPayload: parsed.data.clientPayload },
    uploadDeps,
  );
  if (!decision.ok) return fail("unauthorized", decision.reason);

  await recordUpload(JSON.parse(decision.tokenPayload) as TokenPayload, {
    url: blob.url,
    pathname: blob.pathname,
    contentType: blob.contentType,
    size: blob.size,
  });
  return ok({ pathname: blob.pathname, size: blob.size });
}
