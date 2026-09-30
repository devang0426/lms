"use client";

import { useEffect } from "react";
import { TIME_ZONE_COOKIE, validTimeZone } from "@/lib/utils/time-zone";

/* Tells the server the reader's time zone, once per browser (feature 25):
   a message the server writes, like "It resets at 15:07", then shows the
   reader's own clock. Pages that render dates still use LocalDate. An IANA
   zone ("Asia/Kolkata") is a valid cookie value as it is. */
export function TimeZoneCookie() {
  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!zone || !validTimeZone(zone)) return;
    if (document.cookie.split("; ").includes(`${TIME_ZONE_COOKIE}=${zone}`)) return;
    const secure = location.protocol === "https:" ? "; secure" : "";
    document.cookie = `${TIME_ZONE_COOKIE}=${zone}; path=/; max-age=31536000; samesite=lax${secure}`;
  }, []);
  return null;
}
