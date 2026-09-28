import { getCurrentUser } from "@/lib/auth";
import { saveProgress } from "@/lib/video/progress";

/* The lesson player's last progress save, sent with navigator.sendBeacon
   on pagehide and when the player unmounts (feature 11). A server action
   can't be called as a beacon, and a normal fetch is cancelled as the page
   goes away. Same checks as the periodic server action (lib/video/progress). */

export async function POST(request: Request): Promise<Response> {
  // Beacons are same-origin; refuse anything posted from another site.
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return new Response(null, { status: 403 });

  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });

  let body: unknown;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return new Response(null, { status: 400 });
  }
  const result = await saveProgress(user, body);
  if (result.ok) return new Response(null, { status: 204 });
  return new Response(null, { status: result.error.code === "not_found" ? 404 : 400 });
}
