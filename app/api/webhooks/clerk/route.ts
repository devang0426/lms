import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { NextRequest } from "next/server";
import { deleteAccount } from "@/lib/account/erase";
import { syncUserFromClerk } from "@/lib/auth";
import { markUserDeleted, userByClerkId } from "@/lib/db/user-erase";
import { isProtectedDemoAccount } from "@/lib/demo/accounts";

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
      // Feature 33: mark the row deleted and start the erase (the same
      // run as an admin's Delete user, by its key). If the run can't be
      // queued this throws, the response is a 500 and Clerk sends the
      // event again; marking twice is harmless.
      const user = evt.data.id ? await userByClerkId(evt.data.id) : null;
      if (!user) break;
      if (isProtectedDemoAccount(user.email)) {
        // Demo accounts aren't erased in demo mode; the seed recreates them.
        await markUserDeleted(user.id, { actorId: user.id, via: "clerk" });
        break;
      }
      await deleteAccount(user.id, { actorId: user.id, via: "clerk" });
      break;
    }
  }

  return new Response("ok", { status: 200 });
}
