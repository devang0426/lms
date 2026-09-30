import { Skeleton, SkeletonCard, SkeletonRegion } from "@/components/ui";

/* Lesson editor (feature 29): the back link, the header with its status
   badge, the video card and the drafts card, until the editor streams in. */
export default function LessonEditorLoading() {
  return (
    <SkeletonRegion className="flex flex-col gap-7 md:gap-8">
      <Skeleton className="h-3.5 w-44 rounded-full" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-3 w-40 rounded-full" />
          <Skeleton className="h-10 w-96 max-w-full md:h-12" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-24 rounded-full" />
          <Skeleton className="h-10 w-44 rounded-full" />
        </div>
      </div>
      <SkeletonCard>
        <Skeleton className="h-4.5 w-24 rounded-full" />
        <div className="aspect-video w-full max-w-[880px] rounded-card bg-media" aria-hidden />
        <div className="flex gap-8">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-8 w-20" />
          ))}
        </div>
      </SkeletonCard>
      <SkeletonCard lines={1} />
      <SkeletonCard lines={2} />
    </SkeletonRegion>
  );
}
