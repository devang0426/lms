"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { cn } from "@/lib/utils/cn";
import { isPageNavigation } from "@/lib/utils/page-navigation";

/* The pending bar (feature 29): a slim Terracotta line across the top of
   the window from the moment an in-app link is clicked until the next page,
   or its loading skeleton, is on screen. So a click always gets an answer,
   even before a route's skeleton has been prefetched.

   Next's useLinkStatus() can't drive it: it reports one <Link>'s pending
   state only to components inside that link, and skips it once the route
   is prefetched. So the bar listens for link clicks on the document, and
   the URL changing ends it. It appears after 120 ms, so a quick navigation
   shows nothing. */

/* waiting: clicked, not shown yet; loading: shown; done: fading out. */
type Phase = "idle" | "waiting" | "loading" | "done";

const SHOW_AFTER_MS = 120;
const FADE_MS = 300;
const GIVE_UP_MS = 15_000;

function Bar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [phase, setPhase] = useState<Phase>("idle");
  const url = `${pathname}?${searchParams.toString()}`;

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement)) return;
      if (isPageNavigation(event, { href: link.href, target: link.target, download: link.hasAttribute("download") }, window.location)) {
        // A second click while the bar shows keeps it showing.
        setPhase((p) => (p === "loading" ? p : "waiting"));
      }
    };
    // Capture: a <Link> handles the click itself and stops the default.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // The new URL is showing: a quick navigation ends unseen, a slow one
  // finishes the bar and fades it.
  const [shownUrl, setShownUrl] = useState(url);
  if (url !== shownUrl) {
    setShownUrl(url);
    if (phase === "waiting") setPhase("idle");
    if (phase === "loading") setPhase("done");
  }

  useEffect(() => {
    if (phase === "idle") return;
    const next: Phase = phase === "waiting" ? "loading" : "idle";
    const after = phase === "waiting" ? SHOW_AFTER_MS : phase === "done" ? FADE_MS : GIVE_UP_MS;
    const timer = setTimeout(() => setPhase((p) => (p === phase ? next : p)), after);
    return () => clearTimeout(timer);
  }, [phase]);

  if (phase === "idle" || phase === "waiting") return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px]">
      <div
        className={cn(
          "h-full origin-left bg-terracotta",
          phase === "loading"
            ? "animate-pending-bar motion-reduce:animate-none motion-reduce:opacity-60"
            : "scale-x-100 opacity-0 transition-[transform,opacity] duration-300",
        )}
      />
    </div>
  );
}

/* useSearchParams needs a Suspense boundary on statically rendered pages. */
export function PendingBar() {
  return (
    <Suspense fallback={null}>
      <Bar />
    </Suspense>
  );
}
