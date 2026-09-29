"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canonicalYoutubeUrl } from "@/lib/ai/ingest/youtube";
import { getCurrentUser } from "@/lib/auth";
import { countRecentNotes, createPrivateNote, discardUnfinishedNote } from "@/lib/db/space";
import { startLinkIngest } from "@/lib/documents";
import { checkUrl, SafeFetchError } from "@/lib/net/safe-fetch";
import { noteTitleFromFileName } from "@/lib/space/view";
import { blobPaths, documentKindFor, UPLOAD_KINDS } from "@/lib/storage/upload-kinds";
import { fail, ok, type ActionResult } from "@/lib/utils/action-result";

/* "New note" in the private space (feature 19): from a file (PDF, Word or
   a recording, which the browser then uploads straight to Blob, into the
   student's own private/{userId}/ folder), a web page or a YouTube video.
   zod → signed in (students; admins can keep a space too) → the rate
   limit → the note and its source document, in one batch → a link starts
   its ingest run at once; a file's run starts when its upload lands
   (lib/storage recordUpload). */

/* New notes per student: each one is AI work the university pays for. */
const NEW_NOTE_LIMIT = { notes: 10, minutes: 60 };

async function spaceUser() {
  const user = await getCurrentUser();
  if (!user) return { error: fail("unauthorized", "Your session has ended. Sign in again.") };
  if (user.role === "instructor") return { error: fail("unauthorized", "The private space is for students.") };
  const recent = await countRecentNotes(user.id, NEW_NOTE_LIMIT.minutes);
  if (recent >= NEW_NOTE_LIMIT.notes) {
    return { error: fail("conflict", `That's ${NEW_NOTE_LIMIT.notes} new notes in an hour. Take a break and add more later.`) };
  }
  return { user };
}

const fileSchema = z.object({
  file: z.object({ name: z.string().min(1).max(300), size: z.number().int().positive(), type: z.string().max(120) }),
});

/* Before the browser uploads: check the file's declared type and size, and
   create the note and the document the upload is recorded against. */
export async function prepareNoteUpload(
  input: z.input<typeof fileSchema>,
): Promise<ActionResult<{ noteId: string; documentId: string; pathname: string }>> {
  const parsed = fileSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", "That file couldn't be read.");
  const { file } = parsed.data;
  const kind = documentKindFor(file.type);
  if (!kind) return fail("invalid", "Add a PDF, a Word document (.docx) or an audio recording (MP3, M4A, WAV).");
  if (file.size > UPLOAD_KINDS["private-document"].maxBytes) return fail("invalid", "That file is over 200 MB. Split it or compress it first.");

  const space = await spaceUser();
  if ("error" in space) return space.error!;
  const { noteId, document } = await createPrivateNote({
    ownerId: space.user.id,
    title: noteTitleFromFileName(file.name),
    source: { kind, status: "uploading", filename: file.name, contentType: file.type, sizeBytes: file.size },
  });
  return ok({ noteId, documentId: document.id, pathname: blobPaths.private(space.user.id, file.name) });
}

const linkSchema = z.object({
  url: z.string().trim().min(1, "Paste a link first.").max(2000),
  source: z.enum(["link", "youtube"]),
});

/* A web page (fetched later through the SSRF guard) or a YouTube video. */
export async function createNoteFromLink(input: z.input<typeof linkSchema>): Promise<ActionResult<{ noteId: string }>> {
  const parsed = linkSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", parsed.error.issues[0]?.message ?? "That link couldn't be read.");
  const youtube = canonicalYoutubeUrl(parsed.data.url);
  if (parsed.data.source === "youtube" && !youtube) return fail("invalid", "That doesn't look like a YouTube link.");
  let url: string;
  try {
    // The same checks the fetch makes, so an obviously bad link fails here.
    url = youtube ?? checkUrl(parsed.data.url).toString();
  } catch (err) {
    return fail("invalid", err instanceof SafeFetchError ? err.message : "That link couldn't be read.");
  }

  const space = await spaceUser();
  if ("error" in space) return space.error!;
  const { noteId, document } = await createPrivateNote({
    ownerId: space.user.id,
    title: youtube ? "YouTube video" : new URL(url).hostname,
    source: { kind: youtube ? "youtube" : "url", status: "processing", url },
  });
  await startLinkIngest(document, space.user.id);
  revalidatePath("/space");
  return ok({ noteId });
}

/* The browser couldn't finish an upload: its empty note goes, so a failed
   upload leaves nothing behind. Only a note still waiting for its file. */
export async function discardUnfinishedUpload(input: { noteId: string }): Promise<ActionResult> {
  const parsed = z.object({ noteId: z.uuid() }).safeParse(input);
  if (!parsed.success) return fail("invalid", "That note couldn't be found.");
  const user = await getCurrentUser();
  if (!user) return fail("unauthorized", "Your session has ended. Sign in again.");
  await discardUnfinishedNote(parsed.data.noteId, user.id);
  return ok();
}
