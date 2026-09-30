import { Skeleton, SkeletonCard, SkeletonRegion } from "@/components/ui";

/* Admin pages (feature 29): a header, a filter row and a table, inside the
   sidebar shell, until the page streams in. */
export default function AdminLoading() {
  return (
    <SkeletonRegion className="flex flex-col gap-7 md:gap-8">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-20 rounded-full" />
        <Skeleton className="h-10 w-64 max-w-full md:h-12" />
      </div>
      <div className="flex flex-wrap gap-2">
        {["w-20", "w-24", "w-16", "w-24"].map((w, i) => (
          <Skeleton key={i} className={`h-9 rounded-full ${w}`} />
        ))}
      </div>
      <SkeletonCard className="gap-0 p-0">
        <Skeleton className="h-11 rounded-t-card rounded-b-none" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-6 border-t border-line px-[22px] py-4">
            <Skeleton className="size-8 shrink-0 rounded-full" />
            <Skeleton className="h-4 w-1/3 rounded-full" />
            <Skeleton className="h-4 w-1/5 rounded-full" />
            <Skeleton className="ml-auto h-6 w-20 rounded-full" />
          </div>
        ))}
      </SkeletonCard>
    </SkeletonRegion>
  );
}
