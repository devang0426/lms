"use client";

import { upload } from "@vercel/blob/client";
import { useState } from "react";
import { confirmUpload } from "@/app/api/blob/upload/actions";
import { UPLOAD_KINDS, type UploadPayload } from "@/lib/storage/upload-kinds";

/* Browser → Vercel Blob upload with progress (feature 09). The bytes go
   straight to Blob; /api/blob/upload only issues the token. Afterwards
   confirmUpload() records the file, since Blob's own callback can't reach
   localhost. Feature 10's video uploader uses this with "lesson-video".
   `start` also resolves with the final state, for callers that upload
   several files in turn (feature 20's hand-in form). */

export type UploadState =
  | { phase: "idle" }
  | { phase: "uploading"; percent: number }
  | { phase: "done"; url: string; pathname: string; size: number }
  | { phase: "error"; message: string };

export function useBlobUpload() {
  const [state, setState] = useState<UploadState>({ phase: "idle" });

  async function start(file: File, pathname: string, payload: UploadPayload): Promise<UploadState> {
    const settle = (next: UploadState) => {
      setState(next);
      return next;
    };
    const rules = UPLOAD_KINDS[payload.kind];
    if (!(rules.contentTypes as readonly string[]).includes(file.type)) {
      return settle({ phase: "error", message: `That file type isn't allowed here (${file.type || "unknown"}).` });
    }
    if (file.size > rules.maxBytes) {
      return settle({ phase: "error", message: `That file is over the ${Math.round(rules.maxBytes / 1024 / 1024)} MB limit.` });
    }

    setState({ phase: "uploading", percent: 0 });
    const clientPayload = JSON.stringify(payload);
    try {
      const blob = await upload(pathname, file, {
        access: "public",
        handleUploadUrl: "/api/blob/upload",
        clientPayload,
        contentType: file.type,
        multipart: rules.multipart,
        onUploadProgress: ({ percentage }) => setState({ phase: "uploading", percent: Math.round(percentage) }),
      });
      const confirmed = await confirmUpload({ url: blob.url, clientPayload });
      if (!confirmed.ok) return settle({ phase: "error", message: confirmed.error.message });
      return settle({ phase: "done", url: blob.url, pathname: confirmed.data.pathname, size: confirmed.data.size });
    } catch (err) {
      // The route's 403 message ("Only admins can…") comes through here.
      const message = err instanceof Error && err.message ? err.message.replace(/^Vercel Blob: /, "") : "The upload failed.";
      return settle({ phase: "error", message });
    }
  }

  return { state, start, reset: () => setState({ phase: "idle" }) };
}
