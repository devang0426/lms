import type { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getDocumentForViewer } from "@/lib/db/documents";

/* Open or download a lesson document (feature 18). Resources links and
   citation chips point here, never at the file: the access check runs
   first (the lesson must be visible to the viewer, and students only get
   ready documents), then a redirect to the file. The browser keeps the
   link's #page=7 / #t=768 across the redirect, so the PDF opens at the
   cited page. A web-page or YouTube document redirects to its source. */

export async function GET(request: NextRequest, ctx: RouteContext<"/documents/[documentId]">): Promise<Response> {
  const { documentId } = await ctx.params;
  if (!z.uuid().safeParse(documentId).success) return new Response("Not found", { status: 404 });
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });

  const doc = await getDocumentForViewer(documentId, user);
  const target = doc?.blobUrl ?? doc?.url;
  if (!doc || !target) return new Response("Not found", { status: 404 });

  const url = new URL(target);
  // Vercel Blob serves the file as an attachment with ?download=1.
  if (doc.blobUrl && request.nextUrl.searchParams.get("download") === "1") url.searchParams.set("download", "1");
  return new Response(null, { status: 307, headers: { location: url.toString(), "cache-control": "private, no-store" } });
}
