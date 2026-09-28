import Link from "next/link";
import { Button, EmptyState, Eyebrow } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-5">
      <div className="flex flex-col items-center">
        <Eyebrow>404 · Not found</Eyebrow>
        <EmptyState
          title={
            <>
              This page has <em>wandered off.</em>
            </>
          }
          description="The link may be old, or the page may have moved. Head back home and pick up where you left off."
          action={
            <Button asChild>
              <Link href="/">Back to home</Link>
            </Button>
          }
        />
      </div>
    </main>
  );
}
