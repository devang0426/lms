import "server-only";

import { cookies } from "next/headers";
import { TIME_ZONE_COOKIE, validTimeZone } from "./time-zone";

/* The signed-in reader's IANA time zone, which the browser keeps in a
   cookie (components/shell/time-zone-cookie.tsx), for times the server
   writes into messages ("It resets at 15:07"). Null outside a request, or
   before the browser has set it. */
export async function readerTimeZone(): Promise<string | null> {
  try {
    const value = (await cookies()).get(TIME_ZONE_COOKIE)?.value;
    return value && validTimeZone(value) ? value : null;
  } catch {
    return null;
  }
}
