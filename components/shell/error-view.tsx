"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Button, EmptyState, Eyebrow, Icon, Logo } from "@/components/ui";

export interface HomeLink {
  href: string;
  label: string;
}

/* For a shell whose navigation is drawn by its pages or by a layout that
   failed (the lesson player's focus header, the top-nav course shell): a
   slim bar with the way back, so the error page is never a dead end. */
export function ErrorHeader({ back }: { back: HomeLink }) {
  return (
    <header className="flex h-[68px] shrink-0 items-center gap-3 border-b border-line bg-paper px-4 md:px-6">
      <Button asChild variant="icon" size="sm" aria-label={back.label}>
        <Link href={back.href}>
          <Icon icon={ArrowLeft} />
        </Link>
      </Button>
      <Link href="/" aria-label="Studyhall home" className="text-ink no-underline hover:text-ink">
        <Logo size="sm" />
      </Link>
    </header>
  );
}

/* Shared body for error.tsx boundaries: "Try again" re-fetches and
   re-renders the part of the page that failed, and a link leads home
   (feature 30). Never shows the raw message: a server error only carries
   a digest, shown as the Ref, which is the `digest` on its log line
   (instrumentation.ts → onRequestError). */
export function ErrorView({
  error,
  retry,
  home = { href: "/", label: "Back to home" },
}: {
  error: Error & { digest?: string };
  retry: () => void;
  home?: HomeLink;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center py-12">
      <EmptyState
        title={
          <>
            Something went <em>sideways.</em>
          </>
        }
        description="This page didn't load properly. Try again, and if it keeps happening, let your instructor or the university admin know."
        action={
          <div className="flex flex-col items-center gap-3">
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => retry()}>Try again</Button>
              <Button asChild variant="quiet">
                <Link href={home.href}>{home.label}</Link>
              </Button>
            </div>
            {error.digest && <Eyebrow>Ref · {error.digest}</Eyebrow>}
          </div>
        }
      />
    </div>
  );
}
