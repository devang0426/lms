import Link from "next/link";
import { HeatStrip } from "@/components/analytics/heat-strip";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader, Chip, DataTable, EmptyState, Eyebrow, StatCard } from "@/components/ui";
import { groupTopics, heatStrip, refusalRate } from "@/lib/analytics";
import { requireAreaRole } from "@/lib/auth";
import { aiCostByFeature, lectureWatch, lessonChapters, questionFacts } from "@/lib/db/analytics";
import { listCoursesForStaff } from "@/lib/db/courses";
import { requestTime } from "@/lib/utils/clock";
import { formatLength } from "@/lib/utils/format";

export const metadata = { title: "Analytics · Studyhall" };

/* Teaching analytics (feature 22), per course the viewer teaches:
   - where students watch each lecture, and where they stop (the heat-strip,
     from watch_progress; merged ranges, so re-watching isn't counted);
   - the most-asked assistant topics, by the chapter each answer cited;
   - how often the assistant refused;
   - AI spend per feature (university-wide: usage isn't kept per course).
   Students only, and no names anywhere. ?course= picks the course. */

const MONTH_MS = 30 * 86_400_000;
const usd = (n: number) => `$${n.toFixed(n >= 1 ? 2 : 4)}`;

export default async function AnalyticsPage({ searchParams }: PageProps<"/instructor/analytics">) {
  const user = await requireAreaRole("instructor", "admin");
  const { course: wanted } = await searchParams;
  const taught = await listCoursesForStaff(user);
  const course = taught.find((t) => t.course.id === wanted)?.course ?? taught[0]?.course;

  if (!course) {
    return (
      <>
        <PageHeader eyebrow="Teaching" title="Analytics" />
        <Card padded={false} className="border-dashed">
          <EmptyState title="No courses yet" description="Analytics appear once you teach a course with students in it." />
        </Card>
      </>
    );
  }

  const [lectures, facts, chaptersByLesson, costs] = await Promise.all([
    lectureWatch(course.id),
    questionFacts(course.id),
    lessonChapters(course.id),
    aiCostByFeature(new Date(requestTime() - MONTH_MS)),
  ]);
  const topics = groupTopics(facts, chaptersByLesson);
  const rate = refusalRate(facts);
  const refused = facts.filter((f) => f.refused).length;
  const maxTopic = Math.max(1, ...topics.map((t) => t.questions));

  return (
    <>
      <PageHeader
        eyebrow={`Teaching · ${course.code}`}
        title={
          <>
            How <em>{course.title}</em> is going
          </>
        }
      />
      {taught.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Course">
          {taught.map(({ course: c }) => (
            <Chip key={c.id} asChild active={c.id === course.id} className="h-[34px] px-3.5">
              <Link href={`/instructor/analytics?course=${c.id}`} aria-current={c.id === course.id ? "true" : undefined} scroll={false}>
                {c.code}
              </Link>
            </Chip>
          ))}
        </div>
      )}

      <section aria-labelledby="watching" className="flex flex-col gap-4">
        <h2 id="watching" className="m-0 text-h2 font-semibold">
          Where students watch
        </h2>
        {lectures.length === 0 ? (
          <Card padded={false} className="border-dashed">
            <EmptyState title="No lectures yet" description="Once a lesson's video is processed, its heat-strip shows here." />
          </Card>
        ) : (
          lectures.map((l) => (
            <Card key={l.lessonId} className="gap-4">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div className="flex min-w-0 flex-col gap-1">
                  <Eyebrow>{l.moduleTitle}</Eyebrow>
                  <h3 className="m-0 text-h3 font-semibold">{l.title}</h3>
                </div>
                <span className="text-meta text-ink-soft">{formatLength(l.durationSec)}</span>
              </div>
              <HeatStrip counts={heatStrip(l.viewers, l.durationSec)} viewers={l.viewers.length} durationSec={l.durationSec} chapters={l.chapters} />
            </Card>
          ))
        )}
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[1.75fr_1fr]">
        <Card padded={false} className="overflow-hidden">
          <div className="flex flex-col gap-1 px-[22px] pt-5 pb-3">
            <CardHeader title="Most-asked topics" />
            <p className="m-0 text-meta text-ink-soft">Students&rsquo; questions to the assistant, by the chapter each answer cited.</p>
          </div>
          <DataTable
            rows={topics}
            rowKey={(t) => `${t.lessonId}|${t.chapterTitle ?? ""}`}
            empty="No answered questions yet."
            columns={[
              {
                key: "topic",
                header: "Topic",
                width: "2.4fr",
                cell: (t) => (
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-[15px] font-medium">{t.chapterTitle ?? t.lessonTitle}</span>
                    {t.chapterTitle && <span className="truncate text-meta text-ink-soft">{t.lessonTitle}</span>}
                  </span>
                ),
              },
              {
                key: "questions",
                header: "Questions",
                width: "1.2fr",
                cell: (t) => (
                  <span className="flex items-center gap-3">
                    <span className="h-1.5 rounded-full bg-sage" style={{ width: `${Math.max(6, (t.questions / maxTopic) * 100)}%` }} aria-hidden />
                    <span className="font-mono text-meta">{t.questions}</span>
                  </span>
                ),
              },
            ]}
          />
        </Card>
        <StatCard
          label="Refusal rate"
          value={rate === null ? "—" : `${Math.round(rate * 100)}%`}
          delta={rate === null ? "No questions yet" : `${refused} of ${facts.length} questions were outside the course`}
        />
      </div>

      <Card padded={false} className="overflow-hidden">
        <div className="flex flex-col gap-1 px-[22px] pt-5 pb-3">
          <CardHeader title="AI cost by feature" />
          <p className="m-0 text-meta text-ink-soft">The whole university&rsquo;s usage, logged per call. There are no quotas.</p>
        </div>
        <div className="overflow-x-auto">
          <DataTable
            className="min-w-[560px]"
            rows={costs}
            rowKey={(c) => c.feature}
            empty="No AI calls logged yet."
            columns={[
              { key: "feature", header: "Feature", width: "1.6fr", cell: (c) => <span className="font-mono text-meta">{c.feature}</span> },
              { key: "recent", header: "Last 30 days", width: "1.2fr", cell: (c) => `${usd(c.recentCostUsd)} · ${c.recentCalls} calls` },
              { key: "all", header: "All time", width: "1.2fr", cell: (c) => `${usd(c.costUsd)} · ${c.calls} calls` },
            ]}
          />
        </div>
      </Card>
    </>
  );
}
