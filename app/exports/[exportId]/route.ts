import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { ownedReadyExport } from "@/lib/db/data-export";

/* Download a data export (feature 33). The Profile page links here, never
   to the file: only the person it belongs to gets a redirect to it, and
   only until it expires (7 days). Anyone else, or after expiry, gets a
   404, so an export can't even be confirmed to exist. Blob serves it as
   an attachment with ?download=1. */

export async function GET(_request: Request, ctx: RouteContext<"/exports/[exportId]">): Promise<Response> {
  const { exportId } = await ctx.params;
  if (!z.uuid().safeParse(exportId).success) return new Response("Not found", { status: 404 });
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });

  const file = await ownedReadyExport(exportId, user.id);
  if (!file?.blobUrl) return new Response("Not found", { status: 404 });

  const url = new URL(file.blobUrl);
  url.searchParams.set("download", "1");
  return new Response(null, { status: 307, headers: { location: url.toString(), "cache-control": "private, no-store" } });
}
