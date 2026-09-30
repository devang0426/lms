import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "@/components/landing/site-chrome";
import { institute, siteUrl } from "@/lib/institute";

/* The public pages (feature 34): the landing page, privacy and terms.
   Static: nothing here reads the session or a request, so the pages are
   built once (the landing page's course list regenerates hourly) and
   proxy.ts lets signed-out visitors through. */

export function generateMetadata(): Metadata {
  // Share images and canonical links need absolute URLs.
  return { metadataBase: new URL(siteUrl("/")) };
}

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const inst = institute();
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader institute={inst} />
      <main id="main" className="flex grow flex-col">
        {children}
      </main>
      <SiteFooter institute={inst} />
    </div>
  );
}
