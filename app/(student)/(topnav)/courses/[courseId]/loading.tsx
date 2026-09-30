import { Skeleton, SkeletonRegion, SkeletonText } from "@/components/ui";

/* Course detail (feature 29): the hero, the tab row and the curriculum's
   module rows, under the top nav, until the page streams in. */
export default function CourseLoading() {
  return (
    <SkeletonRegion className="flex flex-col gap-8">
      <section className="grid items-center gap-10 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
        <div className="flex min-w-0 flex-col gap-[18px]">
          <Skeleton className="h-3 w-32 rounded-full" />
          <Skeleton className="h-11 w-4/5 md:h-16" />
          <SkeletonText lines={2} className="max-w-[560px]" />
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-full" />
            <Skeleton className="h-3.5 w-36 rounded-full" />
          </div>
          <div className="mt-1.5 flex gap-3">
            <Skeleton className="h-14 w-40 rounded-full" />
            <Skeleton className="h-14 w-48 rounded-full" />
          </div>
        </div>
        <Skeleton className="h-[240px] rounded-3xl md:h-[340px]" />
      </section>
      <div className="flex gap-6 border-b border-line pb-3">
        {["w-24", "w-32", "w-20", "w-24"].map((w, i) => (
          <Skeleton key={i} className={`h-4 rounded-full ${w}`} />
        ))}
      </div>
      <div className="grid items-start gap-8 lg:grid-cols-[1.6fr_1fr] lg:gap-12">
        <div className="flex flex-col gap-2.5">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[58px] rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-[220px] rounded-card" />
      </div>
    </SkeletonRegion>
  );
}
