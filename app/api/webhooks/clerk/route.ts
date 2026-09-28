import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { syncUserFromClerk } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

/* Clerk → Neon user sync. Signed by Svix; verified with
   CLERK_WEBHOOK_SIGNING_SECRET. Subscribe to user.created, user.updated and
   user.deleted in the Clerk Dashboard (Webhooks). */
export async function POST(req: NextRequest) {
  let evt;
  try {
    evt = await verifyWebhook(req);
  } catch {
    return new Response("Webhook verification failed", { status: 400 });
  }

  switch (evt.type) {
    case "user.created":
    case "user.updated": {
      const d = evt.data;
      await syncUserFromClerk({
        id: d.id,
        firstName: d.first_name,
        lastName: d.last_name,
        username: d.username,
        imageUrl: d.image_url,
        primaryEmailAddressId: d.primary_email_address_id,
        emailAddresses: d.email_addresses.map((e) => ({ id: e.id, emailAddress: e.email_address })),
        publicMetadata: (d.public_metadata ?? {}) as Record<string, unknown>,
      });
      break;
    }
    case "user.deleted": {
      if (evt.data.id) {
        await db.update(users).set({ deletedAt: new Date() }).where(eq(users.clerkId, evt.data.id));
      }
      break;
    }
  }

  return new Response("ok", { status: 200 });
}
