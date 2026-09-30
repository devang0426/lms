import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { demoPickerProps } from "@/components/auth/demo-picker-props";
import {
  AssistantIllustration,
  HeroIllustration,
  PodcastIllustration,
  SpaceIllustration,
  StudyIllustration,
  TranscriptIllustration,
} from "@/components/landing/illustrations";
import { ContactLinks, PUBLIC_WIDTH } from "@/components/landing/site-chrome";
import { TryDemo } from "@/components/landing/try-demo";
import { Button, coverClass, Eyebrow } from "@/components/ui";
import { listPublicCatalog, type PublicCourse } from "@/lib/db/catalog";
import { institute } from "@/lib/institute";
import { cn } from "@/lib/utils/cn";
import { formatLength, plural } from "@/lib/utils/format";

/* The public landing page (feature 34). proxy.ts sends signed-out
   visitors on "/" here, and signed-in ones on to their home.

   Static: built at `next build` and regenerated at most once an hour, in
   the background, for the course list. No request makes a database call.
   The institute's details and demo mode are read when it's built. */
export const revalidate = 3600;

export function generateMetadata(): Metadata {
  const { name } = institute();
  const title = `${name} · Studyhall`;
  const description = `Studyhall at ${name}: lectures with a clickable transcript, an assistant that cites the exact moment, flashcards, quizzes and podcasts.`;
  return {
    title,
    description,
    alternates: { canonical: "/welcome" },
    openGraph: { type: "website", url: "/welcome", siteName: name, title, description, locale: "en_GB" },
    twitter: { card: "summary_large_image", title, description },
  };
}

/* The course list, or null to leave the section out. A build that can't
   reach the database still builds the page, and the next hourly
   regeneration fills the list in. A failed regeneration throws, so the
   last good page keeps being served. */
async function coursesThisTerm(): Promise<{ courses: PublicCourse[]; total: number } | null> {
  try {
    return await listPublicCatalog();
  } catch (err) {
    if (process.env.NEXT_PHASE !== "phase-production-build") throw err;
    console.warn("Building /welcome without its course list: the database couldn't be read.", err);
    return null;
  }
}

interface Feature {
  title: string;
  body: string;
  picture: ReactNode;
  wide?: boolean;
}

const FEATURES: Feature[] = [
  {
    title: "An assistant that cites the exact moment",
    body: "Ask about a topic and the answer comes from your course, with a link to the moment in the lecture where it was taught. Click it and the video jumps there. Questions outside the course are politely declined.",
    picture: <AssistantIllustration />,
    wide: true,
  },
  {
    title: "Lectures with a clickable transcript",
    body: "Every lecture has chapters and a transcript that follows along. Click any line to jump to it, and pin your own notes to the second.",
    picture: <TranscriptIllustration />,
  },
  {
    title: "Flashcards and quizzes",
    body: "Cards come back just before you'd forget them, each linked to its moment in the lecture. Quizzes show your mastery topic by topic.",
    picture: <StudyIllustration />,
  },
  {
    title: "Podcasts of your lessons",
    body: "Listen to a lesson as a two-voice conversation, in English or Hinglish.",
    picture: <PodcastIllustration />,
  },
  {
    title: "A private study space",
    body: "Upload your own notes or slides to get private notes, flashcards, a quiz and a chat that can draw on your courses too.",
    picture: <SpaceIllustration />,
  },
];

const sectionTitle = "m-0 font-serif text-[36px] leading-[1.05] font-normal tracking-[-0.01em] md:text-[48px]";

export default async function WelcomePage() {
  const inst = institute();
  const demo = demoPickerProps();
  const catalog = await coursesThisTerm();

  return (
    <>
      <div className="px-3 pt-3 md:px-5 md:pt-5">
        <section aria-labelledby="hero-title" className="relative overflow-hidden rounded-panel bg-clay">
          <div aria-hidden className="absolute -top-[120px] -right-[140px] size-[420px] rounded-full bg-butter opacity-55" />
          <div aria-hidden className="absolute right-[160px] -bottom-[110px] hidden size-[220px] rounded-full bg-sage-tint md:block" />
          <div className={cn(PUBLIC_WIDTH, "relative grid items-center gap-12 py-14 md:py-20 lg:grid-cols-[1.1fr_1fr]")}>
            <div className="flex flex-col gap-6">
              <Eyebrow size={12} className="text-clay-ink">
                {inst.name}
              </Eyebrow>
              <h1
                id="hero-title"
                className="m-0 font-serif text-[46px] leading-[0.98] font-normal tracking-[-0.02em] md:text-[68px] xl:text-[80px]"
              >
                Lectures you can <em className="text-terracotta">ask questions of.</em>
              </h1>
              {inst.tagline && <p className="m-0 max-w-[480px] text-[17px] leading-[1.55] text-ink-soft">{inst.tagline}</p>}
              <div className="flex flex-wrap gap-3">
                <Button asChild size="xl">
                  <Link href="/sign-in">Sign in</Link>
                </Button>
                {demo && <TryDemo {...demo} />}
              </div>
            </div>
            <div className="hidden md:block">
              <HeroIllustration />
            </div>
          </div>
        </section>
      </div>

      <section id="features" aria-labelledby="features-title" className={cn(PUBLIC_WIDTH, "flex scroll-mt-6 flex-col gap-8 pt-20")}>
        <div className="flex max-w-[640px] flex-col gap-3">
          <Eyebrow size={12}>What students get</Eyebrow>
          <h2 id="features-title" className={sectionTitle}>
            Study tools that know <em>your course.</em>
          </h2>
        </div>
        <ul className="m-0 grid list-none grid-cols-1 gap-5 p-0 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <li
              key={f.title}
              className={cn("flex flex-col gap-4 rounded-card border border-line bg-paper p-4", f.wide && "md:col-span-2")}
            >
              {f.picture}
              <div className="flex flex-col gap-1.5 px-1 pb-1">
                <h3 className="m-0 text-h3 font-semibold">{f.title}</h3>
                <p className="m-0 text-small text-ink-soft">{f.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {catalog && catalog.courses.length > 0 && (
        <section id="courses" aria-labelledby="courses-title" className={cn(PUBLIC_WIDTH, "flex scroll-mt-6 flex-col gap-8 pt-20")}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex max-w-[640px] flex-col gap-3">
              <Eyebrow size={12}>Courses</Eyebrow>
              <h2 id="courses-title" className={sectionTitle}>
                Taught <em>this term.</em>
              </h2>
            </div>
            <p className="m-0 text-small text-ink-soft">Lessons open once you&apos;re enrolled.</p>
          </div>
          <ul className="m-0 grid list-none grid-cols-1 gap-x-5 gap-y-10 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {catalog.courses.map((c, i) => (
              <li key={i}>
                <CourseTile course={c} />
              </li>
            ))}
          </ul>
          {catalog.total > catalog.courses.length && (
            <p className="m-0 text-small text-ink-soft">
              And {plural(catalog.total - catalog.courses.length, "more course")}. Sign in to explore them all.
            </p>
          )}
        </section>
      )}

      <section id="join" aria-labelledby="join-title" className={cn(PUBLIC_WIDTH, "scroll-mt-6 pt-20")}>
        {/* Paper, not the Oat callout: Terracotta links on Oat fall below AA contrast. */}
        <div className="grid gap-10 rounded-card border border-line bg-paper p-6 md:p-10 lg:grid-cols-[1fr_1.2fr]">
          <div className="flex flex-col gap-4">
            <Eyebrow size={12}>How to join</Eyebrow>
            <h2 id="join-title" className={sectionTitle}>
              Your institute <em>enrolls you.</em>
            </h2>
            <p className="m-0 text-body text-ink-soft">Check your email for an invitation, or contact the office.</p>
            <ContactLinks institute={inst} className="pt-1" />
          </div>
          <ol className="m-0 flex list-none flex-col p-0">
            <JoinStep n="01" title={`${inst.name} enrolls you`}>
              The office adds you to your courses. There&apos;s no sign-up form to fill in.
            </JoinStep>
            <JoinStep n="02" title="Check your email for an invitation">
              Accept it to set up your account.
            </JoinStep>
            <JoinStep n="03" title="Sign in">
              Your courses are on your home page, ready to start.
            </JoinStep>
          </ol>
        </div>
      </section>
    </>
  );
}

function CourseTile({ course }: { course: PublicCourse }) {
  const meta = [course.instructorName, plural(course.lessonCount, "lesson"), formatLength(course.durationSec)].filter(Boolean).join(" · ");
  return (
    <article className="flex flex-col gap-3">
      <div aria-hidden className={cn("h-[120px] rounded-[18px]", coverClass[course.coverTint])} />
      <h3 className="m-0 font-serif text-[24px] leading-[1.1] font-normal">{course.title}</h3>
      {course.summary && <p className="m-0 line-clamp-3 text-small text-ink-soft">{course.summary}</p>}
      <p className="m-0 text-meta text-ink-soft">{meta}</p>
    </article>
  );
}

function JoinStep({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-4 border-b border-line py-5 first:pt-0 last:border-b-0 last:pb-0">
      <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-oat font-mono text-[13px] text-ink-soft">
        {n}
      </span>
      <div className="flex flex-col gap-1">
        <h3 className="m-0 text-h3 font-semibold">{title}</h3>
        <p className="m-0 text-small text-ink-soft">{children}</p>
      </div>
    </li>
  );
}
