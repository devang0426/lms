/* The reader's time zone cookie (feature 25). Pure: shared by the browser,
   which sets it, and the server, which reads it (lib/utils/reader-zone). */

export const TIME_ZONE_COOKIE = "tz";

/* An IANA zone Intl knows, e.g. "Asia/Kolkata". */
export function validTimeZone(value: string): boolean {
  if (value.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(value)) return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
