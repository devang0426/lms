import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { authorizeUpload, type TokenPayload } from "@/lib/storage/authorize";
import { recordUpload, uploadDeps } from "@/lib/storage/blob";

/* Vercel Blob client uploads (feature 09). Two kinds of request arrive
   here:
   1. The browser asks for a client token. onBeforeGenerateToken checks the
      Clerk session, the role / course staff (from clientPayload), the
      pathname, the content type and the size limit.
   2. Blob calls back when the upload finishes (signed by Blob, no user
      session), so proxy.ts lets this path through signed-out. The upload
      bytes never pass through this function. */
export async function POST(request: Request): Promise<NextResponse> {
  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const viewer = await getCurrentUser();
        const decision = await authorizeUpload({ viewer, pathname, clientPayload }, uploadDeps);
        if (!decision.ok) throw new UploadRefused(decision.reason);
        return {
          allowedContentTypes: decision.allowedContentTypes,
          maximumSizeInBytes: decision.maximumSizeInBytes,
          addRandomSuffix: true,
          tokenPayload: decision.tokenPayload,
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        if (!tokenPayload) return;
        await recordUpload(JSON.parse(tokenPayload) as TokenPayload, blob);
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof UploadRefused) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error("[blob upload]", err);
    return NextResponse.json({ error: "The upload couldn't be started. Try again." }, { status: 400 });
  }
}

class UploadRefused extends Error {}
