import { Check, ChevronDown } from "lucide-react";
import Link from "next/link";
import { z } from "zod";
import {
  Button,
  CatalogCard,
  Chip,
  EmptyState,
  Icon,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  SearchField,
} from "@/components/ui";
import { requireAreaRole } from "@/lib/auth";
import { CATALOG_SORTS, catalogFacets, listCatalog, type CatalogSort } from "@/lib/db/catalog";
import { formatLength, plural } from "@/lib/utils/format";

export const metadata = { title: "Explore · Studyhall" };

/* Course catalog (wireframe 03). Every filter lives in the URL, so links
   are shareable and the back button steps through filter changes. */

const paramsSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  subject: z.string().max(60).optional().catch(undefined),
  level: z.string().max(40).optional().catch(undefined),
  sort: z.enum(CATALOG_SORTS).optional().catch(undefined),
});
type CatalogParams = z.infer<typeof paramsSchema>;

const sortLabels: Record<CatalogSort, string> = { newest: "Newest", title: "A–Z", shortest: "Shortest" };

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function catalogHref(current: CatalogParams, patch: Partial<CatalogParams>): string {
  const next = { ...current, ...patch };
  const params = new URLSearchParams();
  for (const key of ["q", "subject", "level", "sort"] as const) {
    const v = next[key];
    if (v && !(key === "sort" && v === "newest")) params.set(key, v);
  }
  const qs = params.toString();
  return qs ? `/catalog?${qs}` : "/catalog";
}

export default async function CatalogPage({ searchParams }: PageProps<"/catalog">) {
  const user = await requireAreaRole("student", "admin");
  const raw = await searchParams;
  const params = paramsSchema.parse({
    q: first(raw.q) || undefined,
    subject: first(raw.subject) || undefined,
    level: first(raw.level) || undefined,
    sort: first(raw.sort) || undefined,
  });
  const sort = params.sort ?? "newest";

  const [courses, facets] = await Promise.all([listCatalog(user, { ...params, sort }), catalogFacets()]);
  const filtered = Boolean(params.q || params.subject || params.level);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-6 lg:gap-10">
        <div className="flex flex-col gap-2.5">
          <h1 className="m-0 font-serif text-[40px] leading-none font-normal md:text-[56px]">
            Find your next <em className="text-terracotta">thing.</em>
          </h1>
          <p className="m-0 text-body text-ink-soft">
            Browse every course this term. Filter by subject or level.
          </p>
        </div>
        <form action="/catalog" method="get" role="search" className="w-full lg:w-[420px]">
          {params.subject && <input type="hidden" name="subject" value={params.subject} />}
          {params.level && <input type="hidden" name="level" value={params.level} />}
          {params.sort && <input type="hidden" name="sort" value={params.sort} />}
          <SearchField
            size="lg"
            name="q"
            defaultValue={params.q}
            placeholder="What do you want to learn?"
            aria-label="Search the catalog"
          />
        </form>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-5">
        <nav aria-label="Subjects" className="-mx-5 flex gap-2 overflow-x-auto px-5 md:mx-0 md:flex-wrap md:px-0">
          <Chip asChild active={!params.subject}>
            <Link href={catalogHref(params, { subject: undefined })} scroll={false}>
              All
            </Link>
          </Chip>
          {facets.subjects.map((s) => (
            <Chip key={s} asChild active={params.subject === s}>
              <Link href={catalogHref(params, { subject: s })} scroll={false}>
                {s}
              </Link>
            </Chip>
          ))}
        </nav>
        <div className="flex items-center gap-2.5">
          <FilterMenu
            label={`Level: ${params.level ?? "Any"}`}
            options={[
              { label: "Any", href: catalogHref(params, { level: undefined }), active: !params.level },
              ...facets.levels.map((l) => ({ label: l, href: catalogHref(params, { level: l }), active: params.level === l })),
            ]}
          />
          <FilterMenu
            label={`Sort: ${sortLabels[sort]}`}
            options={CATALOG_SORTS.map((s) => ({
              label: sortLabels[s],
              href: catalogHref(params, { sort: s }),
              active: sort === s,
            }))}
          />
        </div>
      </div>

      {courses.length === 0 ? (
        <EmptyState
          title={filtered ? "Nothing matches that" : "The catalog is empty"}
          description={
            filtered
              ? "Try another word, or clear the filters to see every course."
              : "Courses appear here once instructors publish them for this term."
          }
          action={
            filtered ? (
              <Button asChild variant="secondary" size="md">
                <Link href="/catalog">Clear filters</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <p className="-mt-2 mb-0 text-meta text-ink-soft" aria-live="polite">
            {plural(courses.length, "course")}
            {params.q ? ` for “${params.q}”` : ""}
          </p>
          <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {courses.map((c) => (
              <CatalogCard
                key={c.course.id}
                href={`/courses/${c.course.id}`}
                title={c.course.title}
                eyebrow={[c.course.subject || c.course.code, c.course.level].filter(Boolean).join(" · ")}
                cover={c.course.coverTint}
                badge={c.enrolled ? undefined : "Not enrolled"}
                meta={[c.instructorName, plural(c.lessonCount, "lesson"), formatLength(c.durationSec)]
                  .filter(Boolean)
                  .join(" · ")}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function FilterMenu({ label, options }: { label: string; options: { label: string; href: string; active: boolean }[] }) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="dropdown" size="sm">
          {label}
          <Icon icon={ChevronDown} size={14} strokeWidth={2} />
        </Button>
      </MenuTrigger>
      <MenuContent align="end">
        {options.map((o) => (
          <MenuItem key={o.label} asChild>
            <Link href={o.href} scroll={false} aria-current={o.active ? "true" : undefined} className="no-underline">
              <span className="grow">{o.label}</span>
              {o.active && <Icon icon={Check} size={14} className="text-terracotta" />}
            </Link>
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}
