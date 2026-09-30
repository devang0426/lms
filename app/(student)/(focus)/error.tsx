"use client";

import { useParams } from "next/navigation";
import { ErrorHeader, ErrorView } from "@/components/shell/error-view";

/* The lesson player's error page (feature 30). Its header is drawn by the
   page from lesson data, so a failed page brings a slim one of its own,
   back to the course. */
export default function ErrorBoundary(props: { error: Error & { digest?: string }; retry: () => void }) {
  const { courseId } = useParams<{ courseId?: string }>();
  const back = courseId ? { href: `/courses/${courseId}`, label: "Back to course" } : { href: "/", label: "Back to home" };
  return (
    <>
      <ErrorHeader back={back} />
      <main className="flex flex-1 flex-col px-5">
        <ErrorView {...props} home={back} />
      </main>
    </>
  );
}
