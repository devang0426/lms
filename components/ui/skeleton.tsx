import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/* Loading placeholders (feature 29): Oat shapes where content is about to
   land, with a gentle pulse that stops under prefers-reduced-motion. The
   shapes are decorative; <SkeletonRegion> around them tells assistive
   tech that the area is loading. Each loading.tsx composes these into the
   shape of its page, so nothing jumps when the page arrives. */

export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return <div aria-hidden className={cn("rounded-lg bg-oat motion-safe:animate-skeleton", className)} {...props} />;
}

/* Lines of body text; the last one is shorter, like a paragraph's. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden className={cn("flex flex-col gap-2.5", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn("h-3.5 rounded-full", i === lines - 1 && lines > 1 ? "w-3/5" : "w-full")} />
      ))}
    </div>
  );
}

/* A flat card (Paper, hairline border, rounded-card) holding a title line
   and text, or whatever skeleton shapes are passed in. */
export function SkeletonCard({ lines = 2, className, children }: { lines?: number; className?: string; children?: ReactNode }) {
  return (
    <div aria-hidden className={cn("flex flex-col gap-4 rounded-card border border-line bg-paper p-6", className)}>
      {children ?? (
        <>
          <Skeleton className="h-4.5 w-2/5 rounded-full" />
          <SkeletonText lines={lines} />
        </>
      )}
    </div>
  );
}

/* The live region a loading screen sits in: announced once as "Loading…"
   (or `label`), busy until the page replaces it. */
export function SkeletonRegion({ label = "Loading…", className, children }: { label?: string; className?: string; children: ReactNode }) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
