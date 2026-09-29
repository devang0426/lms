import { getCurrentUser } from "@/lib/auth";
import { notificationFeed } from "@/lib/db/notifications";

/* The bell's feed (feature 21): the signed-in user's newest notifications
   and unread count. Read by the bell on load, on navigation and on focus;
   never cached. Only ever the caller's own rows. */

export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const feed = await notificationFeed(user.id);
  return Response.json(feed, { headers: { "Cache-Control": "private, no-store" } });
}
