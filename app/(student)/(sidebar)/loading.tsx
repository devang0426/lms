import { Skeleton, SkeletonCard, SkeletonRegion } from "@/components/ui";

/* Student sidebar pages (feature 29): the shell's navigation stays, and
   this stands in for the page (a header, a wide card beside a narrow one,
   then a row of course cards) until it streams in. */
export default function StudentPageLoading() {
  return (
    <SkeletonRegion className="flex flex-col gap-7 md:gap-8">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-24 rounded-full" />
        <Skeleton className="h-10 w-72 max-w-full md:h-12" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <SkeletonCard lines={3} className="min-h-[190px]" />
        <SkeletonCard lines={3} className="hidden min-h-[190px] md:flex" />
      </div>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-40" />
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <SkeletonCard key={i} className="p-0">
              <Skeleton className="h-[120px] rounded-t-card rounded-b-none" />
              <div className="flex flex-col gap-3 px-5 pb-5">
                <Skeleton className="h-3 w-20 rounded-full" />
                <Skeleton className="h-4.5 w-4/5 rounded-full" />
                <Skeleton className="h-1.5 w-full rounded-full" />
              </div>
            </SkeletonCard>
          ))}
        </div>
      </div>
    </SkeletonRegion>
  );
}
