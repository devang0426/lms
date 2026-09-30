import { Skeleton, SkeletonCard, SkeletonRegion } from "@/components/ui";

/* Teaching pages (feature 29): a header, a row of stat cards and a table
   card, inside the sidebar shell, until the page streams in. */
export default function InstructorLoading() {
  return (
    <SkeletonRegion className="flex flex-col gap-7 md:gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-3 w-24 rounded-full" />
          <Skeleton className="h-10 w-80 max-w-full md:h-12" />
        </div>
        <Skeleton className="h-12 w-36 rounded-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <SkeletonCard key={i} className="gap-3 p-5">
            <Skeleton className="h-3.5 w-28 rounded-full" />
            <Skeleton className="h-10 w-16" />
            <Skeleton className="h-3 w-36 rounded-full" />
          </SkeletonCard>
        ))}
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-[1.75fr_1fr]">
        <SkeletonCard className="gap-0 p-0">
          <Skeleton className="m-[22px] mb-4 h-4.5 w-28 rounded-full" />
          <Skeleton className="h-10 rounded-none" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-6 border-t border-line px-[22px] py-4">
              <Skeleton className="h-4 w-2/5 rounded-full" />
              <Skeleton className="h-4 w-1/6 rounded-full" />
              <Skeleton className="h-2 grow rounded-full" />
            </div>
          ))}
        </SkeletonCard>
        <SkeletonCard lines={4} />
      </div>
    </SkeletonRegion>
  );
}
