"use client";

import { useSyncExternalStore } from "react";
import { DateTile } from "@/components/ui";

/* A date tile for a moment, in the reader's own time zone (feature 21).
   The server renders the UTC day; the browser swaps in the local one
   straight after hydration, like LocalDate. */

const noop = () => () => {};

export function EventDateTile({ at, tone, size }: { at: number; tone?: "butter" | "oat" | "paper"; size?: "sm" | "md" }) {
  const inBrowser = useSyncExternalStore(noop, () => true, () => false);
  const d = new Date(at);
  const month = d.toLocaleString("en-GB", { month: "short", ...(inBrowser ? {} : { timeZone: "UTC" }) });
  const day = inBrowser ? d.getDate() : d.getUTCDate();
  return <DateTile month={month} day={day} tone={tone} size={size} />;
}
