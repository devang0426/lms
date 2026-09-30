import { notFound } from "next/navigation";
import type { ReactNode } from "react";

/* The /dev check pages (UI kit, tokens, jobs) exist only in `next dev`
   (feature 24, S13): a production build answers 404 for all of them.
   /dev/jobs is also admin-only. */
export default function DevLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV !== "development") notFound();
  return children;
}
