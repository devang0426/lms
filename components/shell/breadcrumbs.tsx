import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Icon } from "@/components/ui";

export interface Crumb {
  label: string;
  /* Omitted for a level with no page of its own (a module) and for the
     current page, which is always the last crumb. */
  href?: string;
}

/* "Course › Module › Lesson › Review" above a page header (feature 27;
   feature 28 puts them on the other staff pages). */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="m-0 flex list-none flex-wrap items-center gap-x-1.5 gap-y-1 p-0 text-small text-ink-soft">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${i}-${item.label}`} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && <Icon icon={ChevronRight} size={14} className="shrink-0" />}
              {item.href && !last ? (
                <Link href={item.href} className="text-ink-soft no-underline hover:text-ink">
                  {item.label}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className={last ? "text-ink" : undefined}>
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
