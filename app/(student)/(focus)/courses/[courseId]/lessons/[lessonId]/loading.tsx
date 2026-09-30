import { Skeleton, SkeletonRegion } from "@/components/ui";

/* Lesson player (feature 29): the focus header, the video, the title row,
   the tab row and transcript lines, and the course contents column, in
   the places the player puts them. */
export default function LessonLoading() {
  return (
    <SkeletonRegion label="Loading the lesson…" className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-[68px] shrink-0 items-center justify-between gap-4 border-b border-line bg-paper px-4 md:px-6">
        <div className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-2.5 w-40 rounded-full" />
            <Skeleton className="h-3.5 w-56 rounded-full" />
          </div>
        </div>
        <Skeleton className="h-9 w-32 rounded-full" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-6 px-5 py-6 md:px-10 md:py-8">
          <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-6">
            <div className="aspect-video w-full rounded-card bg-media" aria-hidden />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3 w-36 rounded-full" />
              <Skeleton className="h-9 w-3/5 md:h-10" />
            </div>
            <div className="flex gap-6 border-b border-line pb-3">
              {["w-20", "w-16", "w-24", "w-20", "w-14"].map((w, i) => (
                <Skeleton key={i} className={`h-4 rounded-full ${w}`} />
              ))}
            </div>
            <div className="flex flex-col gap-3">
              {["w-11/12", "w-4/5", "w-full", "w-3/4", "w-5/6", "w-2/3"].map((w, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-3 w-10 shrink-0 rounded-full" />
                  <Skeleton className={`h-3.5 rounded-full ${w}`} />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-4 border-t border-line bg-oat px-5 py-7 lg:w-[380px] lg:border-t-0 lg:border-l lg:px-6">
          <Skeleton className="h-5 w-40 bg-line" />
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-11 rounded-xl bg-line/60" />
          ))}
        </div>
      </div>
    </SkeletonRegion>
  );
}
