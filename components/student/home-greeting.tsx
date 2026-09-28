"use client";

import { useSyncExternalStore } from "react";
import { Eyebrow } from "@/components/ui";
import { greetingFor } from "@/lib/utils/format";

/* The greeting and date follow the student's own clock, which the server
   doesn't know. The server renders a neutral "Welcome back"; the browser
   swaps in "Good morning" and today's date straight after hydration. */

const noop = () => () => {};
const localKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}`;
};

export function HomeGreeting({ name, compact = false }: { name: string; compact?: boolean }) {
  const key = useSyncExternalStore(noop, localKey, () => null);
  const now = key ? new Date() : null;

  const date = now
    ? new Intl.DateTimeFormat("en-GB", compact
        ? { weekday: "short", day: "numeric", month: "short" }
        : { weekday: "long", day: "numeric", month: "long" })
        .formatToParts(now)
        .filter((p) => p.type !== "literal")
        .map((p) => p.value)
        .join(" ")
        .replace(/^(\S+) /, "$1 · ")
    : " ";
  const greeting = now ? greetingFor(now.getHours()) : "Welcome back";
  const shown = compact && now ? greeting.replace(/^Good /, "").replace(/^./, (c) => c.toUpperCase()) : greeting;

  return (
    <div className={compact ? "flex flex-col gap-1" : "flex flex-col gap-1.5"}>
      <Eyebrow size={compact ? 11 : 12} className="min-h-[1lh]">
        {date}
      </Eyebrow>
      <h1
        className={
          compact
            ? "m-0 font-serif text-[36px] leading-[1.05] font-normal"
            : "m-0 font-serif text-[40px] leading-[1.05] font-normal lg:text-[48px]"
        }
      >
        {shown}, <em>{name}</em>
      </h1>
    </div>
  );
}
