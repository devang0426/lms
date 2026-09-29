import type { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { submissionForViewer } from "@/lib/db/assignments";

/* Open or download a file handed in with a submission (feature 20). Pages
   link here, never to the file: the student who handed it in and the
   course's staff get a redirect to it; anyone else gets a 404, so another
   student's submission can't even be confirmed to exist. */

const params = z.object({ submissionId: z.uuid(), index: z.coerce.number().int().min(0).max(20) });

export async function GET(request: NextRequest, ctx: RouteContext<"/submissions/[submissionId]/files/[index]">): Promise<Response> {
  const parsed = params.safeParse(await ctx.params);
  if (!parsed.success) return new Response("Not found", { status: 404 });
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });

  const submission = await submissionForViewer(parsed.data.submissionId, user);
  const file = submission?.files[parsed.data.index];
  if (!file) return new Response("Not found", { status: 404 });

  const url = new URL(file.url);
  // Vercel Blob serves the file as an attachment with ?download=1.
  if (request.nextUrl.searchParams.get("download") === "1") url.searchParams.set("download", "1");
  return new Response(null, { status: 307, headers: { location: url.toString(), "cache-control": "private, no-store" } });
}
