"use client";

import { useSyncExternalStore } from "react";

/* A date in the reader's own time zone (feature 20: due dates, hand-in
   and grading times). The server doesn't know the zone, so it renders UTC
   (labelled), and the browser swaps in local time straight after
   hydration — the same approach as the home greeting. */

const noop = () => () => {};

const WITH_TIME: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" };
const DATE_ONLY: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" };
/* Next to a date tile (feature 21's calendar), which already shows the day. */
const TIME_ONLY: Intl.DateTimeFormatOptions = { weekday: "short", hour: "2-digit", minute: "2-digit" };

export function LocalDate({ at, dateOnly = false, timeOnly = false }: { at: number; dateOnly?: boolean; timeOnly?: boolean }) {
  const inBrowser = useSyncExternalStore(noop, () => true, () => false);
  const d = new Date(at);
  const opts = dateOnly ? DATE_ONLY : timeOnly ? TIME_ONLY : WITH_TIME;
  const text = d.toLocaleString("en-GB", inBrowser ? opts : { ...opts, timeZone: "UTC", ...(dateOnly ? {} : { timeZoneName: "short" }) });
  return <time dateTime={d.toISOString()}>{text}</time>;
}
