import { ArrowRight, BookOpen, Calendar, Compass, House, MessageCircle, Play, Plus, TrendingUp, User } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  Accordion,
  AccordionRow,
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  CatalogCard,
  Chip,
  CompactCourseCard,
  CourseCard,
  DataTable,
  DateTile,
  EmptyState,
  Eyebrow,
  Field,
  Icon,
  Input,
  ListRow,
  Logo,
  NavItem,
  Person,
  ProgressBar,
  ProgressRing,
  SearchField,
  Skeleton,
  SkeletonCard,
  SkeletonRegion,
  SkeletonText,
  StatCard,
  StepIndicator,
  TabBar,
  Textarea,
} from "@/components/ui";
import { InteractiveDemos } from "./interactive";

export const metadata = { title: "UI kit · Studyhall" };

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-6 border-t border-line pt-10">
      <div className="flex items-baseline gap-4">
        <h2 className="m-0 font-serif text-[36px] font-normal">{title}</h2>
        {note && <span className="text-small text-ink-soft">{note}</span>}
      </div>
      {children}
    </section>
  );
}

type CourseRow = { id: string; title: string; status: "Published" | "Draft" | "Scheduled"; learners: string; completion: number | null; note?: string };

const courseRows: CourseRow[] = [
  { id: "1", title: "Foundations of Visual Design", status: "Published", learners: "128", completion: 64 },
  { id: "2", title: "Design Critique Studio", status: "Draft", learners: "—", completion: null, note: "6 of 10 lessons built" },
  { id: "3", title: "Colour for Screens", status: "Scheduled", learners: "—", completion: null, note: "Opens 6 Oct" },
];

/* Development only: app/dev/layout.tsx answers 404 in a production build. */
export default function UiKitPage() {
  return (
    <main className="mx-auto flex max-w-[1200px] flex-col gap-12 px-4 py-12 sm:px-12">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-3">
          <Logo size="lg" />
          <h1 className="m-0 font-serif text-h1 font-normal">
            UI kit · <em>feature 04</em>
          </h1>
          <p className="m-0 max-w-[640px] text-small text-ink-soft">
            Every primitive in <code className="font-mono">components/ui</code>, in every variant. Tab through the page to
            check focus rings.
          </p>
        </div>
        <Link href="/" className="text-small">
          ← Token preview
        </Link>
      </header>

      <Section title="Buttons" note="Pill; Terracotta only for the one action that matters">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Enroll now</Button>
          <Button variant="secondary">Preview</Button>
          <Button variant="tertiary">Save for later</Button>
          <Button variant="quiet">Previous</Button>
          <Button variant="success" leading={<Icon icon={TrendingUp} size={16} />}>Mark complete</Button>
          <Button variant="link">View all</Button>
          <Button variant="icon" aria-label="Play"><Icon icon={Play} /></Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">sm · 42</Button>
          <Button size="md">md · 44</Button>
          <Button size="lg">lg · 48</Button>
          <Button size="xl">xl · 52</Button>
          <Button loading>Saving</Button>
          <Button disabled variant="secondary">Disabled</Button>
          <Button asChild variant="primary" trailing={<Icon icon={ArrowRight} size={16} />}>
            <Link href="/dev/ui">Resume lesson (link)</Link>
          </Button>
          <Button size="md" leading={<Icon icon={Plus} size={16} />}>New course</Button>
        </div>
      </Section>

      <Section title="Inputs" note="12px radius · Clay focus ring · errors in Terracotta">
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Email" htmlFor="kit-email">
            <Input id="kit-email" type="email" placeholder="you@school.edu" />
          </Field>
          <Field label="Password" htmlFor="kit-pass" action={<a href="#">Forgot?</a>}>
            <Input id="kit-pass" type="password" placeholder="••••••••" />
          </Field>
          <Field label="Course code" htmlFor="kit-code" error="That code is already in use." >
            <Input id="kit-code" defaultValue="MATH 201" invalid aria-describedby="kit-code-error" />
          </Field>
          <Field label="Title" htmlFor="kit-title" hint="Shown to students on the catalog.">
            <Input id="kit-title" placeholder="Foundations of Visual Design" aria-describedby="kit-title-hint" />
          </Field>
          <Field label="Your notes" htmlFor="kit-notes" className="md:col-span-2">
            <Textarea id="kit-notes" placeholder="Write a note at 04:12…" />
          </Field>
          <SearchField placeholder="Search courses, lessons…" />
          <SearchField size="lg" placeholder="What do you want to learn?" aria-label="Search the catalog" />
        </div>
      </Section>

      <Section title="Chips & badges">
        <div className="flex flex-wrap items-center gap-2">
          <Chip active>All</Chip>
          <Chip>Design</Chip>
          <Chip>Development</Chip>
          <Chip asChild><Link href="/dev/ui?subject=science">Science (link)</Link></Chip>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="success">Completed</Badge>
          <Badge tone="warning">Due Friday</Badge>
          <Badge tone="new">New</Badge>
          <Badge tone="neutral">Draft</Badge>
          <Badge tone="success" size="md">Published</Badge>
          <Badge tone="warning" size="sm">Due 26 Sep</Badge>
          <span className="rounded-xl bg-clay p-2"><Badge tone="onImage" size="md">New</Badge></span>
        </div>
      </Section>

      <Section title="Cards">
        <div className="grid gap-5 md:grid-cols-3">
          <CourseCard href="/dev/ui" cover="sage" eyebrow="Development · 18 lessons" title="Intro to Python" progress={34} meta="34% · next: Loops and ranges" />
          <CourseCard href="/dev/ui" cover="clay" eyebrow="Business · 9 lessons" title="Business Writing" progress={78} meta="78% · next: Writing the ask" />
          <CourseCard href="/dev/ui" cover="stripe" eyebrow="Design · 12 lessons" title="Foundations of Visual Design" progress={62} meta="62% · 5 lessons left" />
        </div>
        <div className="grid gap-5 sm:grid-cols-2 md:grid-cols-4">
          <CatalogCard href="/dev/ui" cover="clay" badge="New" eyebrow="Design · Beginner" title="Foundations of Visual Design" meta="[Instructor] · 12 lessons · 3h 40m" />
          <CatalogCard href="/dev/ui" cover="sage" eyebrow="Development · Beginner" title="Intro to Python" meta="[Instructor] · 18 lessons · 6h" />
          <CatalogCard href="/dev/ui" cover="butter" eyebrow="Science · Intermediate" title="Everyday Statistics" meta="[Instructor] · 14 lessons · 4h 15m" />
          <CatalogCard href="/dev/ui" cover="stripe" eyebrow="Business · All levels" title="Business Writing" meta="[Instructor] · 9 lessons · 2h 30m" />
        </div>
        <div className="grid gap-3 md:max-w-[390px]">
          <CompactCourseCard href="/dev/ui" cover="sage" title="Intro to Python" progress={34} />
          <CompactCourseCard href="/dev/ui" cover="clay" title="Business Writing" progress={78} />
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          <Card>
            <CardHeader title="Coming up" action={<a href="#">Calendar</a>} />
            <ListRow leading={<DateTile month="Sep" day={26} tone="butter" />} title="Moodboard assignment" subtitle="Visual Design · due 11:59 pm" />
            <ListRow leading={<DateTile month="Sep" day={29} />} title="Live session: Q&A" subtitle="Intro to Python · 6:00 pm" />
            <ListRow leading={<DateTile month="Oct" day={2} />} title="Quiz 2" subtitle="Business Writing · 20 min" divider={false} />
          </Card>
          <Card variant="sunken">
            <CardHeader title="You'll be able to" />
            <p className="m-0 pt-3 text-[15px] leading-[1.45]">Sunken (Oat) callout panel.</p>
          </Card>
          <Card variant="attention" className="gap-1.5 p-4">
            <Eyebrow className="text-butter-ink">This week</Eyebrow>
            <span className="text-small">4 of 6 study hours toward your goal</span>
          </Card>
          <Card variant="raised" className="md:col-span-3">
            <span className="text-small text-ink-soft">Raised card (menus, popovers)</span>
          </Card>
        </div>
      </Section>

      <Section title="Progress">
        <div className="grid items-center gap-8 md:grid-cols-3">
          <div className="flex flex-col gap-3">
            <ProgressBar value={62} size={6} />
            <ProgressBar value={58} size={8} />
            <ProgressBar value={34} size={5} />
            <div className="rounded-xl bg-clay p-3"><ProgressBar value={58} trackClassName="bg-paper/70" /></div>
          </div>
          <ProgressRing value={70} caption="weekly goal" />
          <div className="flex items-center gap-4">
            <StepIndicator state="done" />
            <StepIndicator state="current" />
            <StepIndicator state="upcoming" />
          </div>
        </div>
      </Section>

      <Section title="Stats & tables">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Active learners" value="128" delta="+12 this week" deltaTone="success" />
          <StatCard label="Avg. completion" value="54%" delta="across all courses" />
          <StatCard label="Waiting for grading" value="7" delta="oldest: 3 days" attention />
          <StatCard label="Unanswered questions" value="2" delta="in discussions" />
        </div>
        <Card padded={false} className="overflow-hidden">
          <CardHeader title="Courses" action={<a href="#">Manage all</a>} className="px-[22px] py-[18px]" />
          <DataTable<CourseRow>
            rows={courseRows}
            rowKey={(r) => r.id}
            columns={[
              {
                key: "course",
                header: "Course",
                width: "2.4fr",
                cell: (r) => (
                  <span className="flex items-center gap-3">
                    <span className="size-10 shrink-0 rounded-tile bg-clay" />
                    <span className="font-medium">{r.title}</span>
                  </span>
                ),
              },
              {
                key: "status",
                header: "Status",
                cell: (r) => (
                  <Badge size="md" tone={r.status === "Published" ? "success" : r.status === "Draft" ? "neutral" : "warning"}>
                    {r.status}
                  </Badge>
                ),
              },
              { key: "learners", header: "Learners", cell: (r) => r.learners },
              {
                key: "completion",
                header: "Completion",
                width: "1.4fr",
                cell: (r) =>
                  r.completion === null ? (
                    <span className="text-meta text-ink-soft">{r.note}</span>
                  ) : (
                    <span className="flex items-center gap-2.5">
                      <ProgressBar value={r.completion} />
                      <span className="font-mono text-label text-ink-soft">{r.completion}%</span>
                    </span>
                  ),
              },
            ]}
          />
        </Card>
      </Section>

      <Section title="Curriculum">
        <div className="flex max-w-[720px] flex-col gap-2.5">
          <Accordion index="01" title="Seeing like a designer" meta="4 lessons · 52m" defaultOpen>
            <AccordionRow leading={<StepIndicator state="done" />} title="Why visual design matters" trailing={<span className="font-medium text-sage">Free preview</span>} />
            <AccordionRow leading={<StepIndicator state="current" />} title="Hierarchy and attention" trailing="14m" />
            <AccordionRow leading={<StepIndicator state="upcoming" />} title="Reading: the grid" trailing="8m" />
          </Accordion>
          <Accordion index="02" title="Colour and mood" meta="4 lessons · 1h 10m" />
        </div>
      </Section>

      <Section title="Navigation & identity">
        <div className="grid gap-8 md:grid-cols-[248px_1fr_390px]">
          <nav aria-label="Sample" className="flex flex-col gap-1 rounded-card bg-oat p-3">
            <NavItem href="/dev/ui" icon={House} active>Home</NavItem>
            <NavItem href="/dev/ui" icon={Compass}>Explore</NavItem>
            <NavItem href="/dev/ui" icon={BookOpen}>My courses</NavItem>
            <NavItem href="/dev/ui" icon={Calendar}>Calendar</NavItem>
            <NavItem href="/dev/ui" icon={MessageCircle}>Discussions</NavItem>
          </nav>
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-5">
              <Logo size="sm" />
              <Logo size="md" />
              <Logo size="lg" />
              <Logo size="md" wordmark={false} />
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <Avatar name="Aanya Sharma" size={34} />
              <Avatar name="Prof. Meera Rao" size={36} />
              <Avatar name="Devang" size={40} />
              <Person name="Aanya Sharma" role="Learner" />
            </div>
            <div className="flex flex-col gap-1">
              <Eyebrow>Design · 12 lessons</Eyebrow>
              <Eyebrow size={12}>Friday · 25 September</Eyebrow>
            </div>
          </div>
          <div className="overflow-hidden rounded-card border border-line">
            <TabBar
              items={[
                { href: "/dev/ui", label: "Home", icon: House, active: true },
                { href: "/dev/ui", label: "Explore", icon: Compass },
                { href: "/dev/ui", label: "Courses", icon: BookOpen },
                { href: "/dev/ui", label: "Profile", icon: User },
              ]}
            />
          </div>
        </div>
      </Section>

      <Section title="Empty state">
        <Card>
          <EmptyState
            title={<>Nothing due. <em>Enjoy it.</em></>}
            description="New assignments and quizzes will show up here as your instructors post them."
            action={<Button variant="secondary" size="md">Browse courses</Button>}
          />
        </Card>
      </Section>

      <Section title="Loading" note="Oat shapes with a gentle pulse, still under reduced motion · each loading.tsx composes them">
        <SkeletonRegion className="grid gap-6 md:grid-cols-3">
          <div className="flex flex-col gap-3">
            <Eyebrow>Blocks</Eyebrow>
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="aspect-video w-full rounded-card" />
            <Skeleton className="size-10 rounded-full" />
          </div>
          <div className="flex flex-col gap-3">
            <Eyebrow>Text lines</Eyebrow>
            <SkeletonText lines={4} />
          </div>
          <div className="flex flex-col gap-3">
            <Eyebrow>Card</Eyebrow>
            <SkeletonCard lines={3} />
          </div>
        </SkeletonRegion>
      </Section>

      <Section title="Interactive" note="Chip group · Tabs · Dialog · Menu · Toast">
        <InteractiveDemos />
      </Section>
    </main>
  );
}
