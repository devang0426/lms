"use client";

import { useEffect } from "react";
import { Button, EmptyState, Eyebrow, Logo } from "@/components/ui";
import { fontVariables } from "./fonts";
import "./globals.css";

/* When the root layout itself fails (feature 30). It replaces the whole
   document, so it brings its own <html>, fonts and styles, and no Clerk or
   toasts. "Back to home" is a full page load: the app starts over. The Ref
   is the digest on the server's log line. */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en" className={`${fontVariables} h-full`}>
      <body className="min-h-full bg-page font-sans text-body text-ink antialiased">
        <title>Something went wrong · Studyhall</title>
        <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-5">
          <Logo size="md" />
          <EmptyState
            title={
              <>
                Something went <em>sideways.</em>
              </>
            }
            description="Studyhall didn't load properly. Try again, and if it keeps happening, let your instructor or the university admin know."
            action={
              <div className="flex flex-col items-center gap-3">
                <div className="flex flex-wrap justify-center gap-2">
                  <Button onClick={() => retry()}>Try again</Button>
                  <Button asChild variant="quiet">
                    {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a full load, since the layout failed */}
                    <a href="/">Back to home</a>
                  </Button>
                </div>
                {error.digest && <Eyebrow>Ref · {error.digest}</Eyebrow>}
              </div>
            }
          />
        </main>
      </body>
    </html>
  );
}
