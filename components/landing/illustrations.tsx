import { FileText, Lock, Play } from "lucide-react";
import type { ReactNode } from "react";
import { Badge, Icon } from "@/components/ui";
import { cn } from "@/lib/utils/cn";

/* Small drawings of the app's own screens for the landing page (feature
   34), built from the same tokens and patterns as the real components:
   the transcript's Butter current line, the Clay citation chip, the
   flashcard, the mastery bars, the private note card. They're drawn in
   HTML rather than screenshots, so they stay sharp, weigh nothing and
   don't show anyone's data. Each is one image to a screen reader
   (role="img" with a label); the text inside is decoration. */

function Frame({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div role="img" aria-label={label} className={cn("relative flex h-[188px] flex-col overflow-hidden rounded-2xl bg-oat p-4", className)}>
      {children}
    </div>
  );
}

/* The Clay video-time chip (ui-context.md → feature 12 and 14). */
function TimeChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-clay px-2.5 font-mono text-[11px] text-clay-ink">
      <Icon icon={Play} size={10} strokeWidth={2.2} className="fill-current" />
      {children}
    </span>
  );
}

function VideoBlock({ className }: { className?: string }) {
  return (
    <div className={cn("relative flex flex-col justify-end rounded-xl bg-media p-3", className)}>
      <span className="absolute top-1/2 left-1/2 flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-paper text-ink shadow-raised">
        <Icon icon={Play} size={16} className="fill-current" />
      </span>
      <div className="flex items-center gap-2 font-mono text-[10px] text-cream">
        <span>12:48</span>
        <span className="relative h-1 grow rounded-full bg-cream/25">
          <span className="absolute inset-y-0 left-0 w-[46%] rounded-full bg-butter" />
        </span>
        <span>27:10</span>
      </div>
    </div>
  );
}

export function TranscriptIllustration() {
  const lines = [
    ["12:31", "So far every vector we tried changed direction."],
    ["12:48", "An eigenvector keeps its direction; only its length changes."],
    ["13:05", "That scale factor is the eigenvalue, lambda."],
  ] as const;
  return (
    <Frame label="A lecture video with its transcript. The line being spoken is highlighted, with its time beside it.">
      <VideoBlock className="h-[76px]" />
      <ul className="m-0 mt-2.5 flex list-none flex-col gap-1 p-0">
        {lines.map(([at, text], i) => (
          <li key={at} className={cn("flex gap-2.5 rounded-lg px-2 py-1 text-[12px] leading-snug", i === 1 ? "bg-butter-tint text-ink" : "text-ink-soft")}>
            <span className="font-mono text-[11px]">{at}</span>
            <span className="min-w-0 truncate">{text}</span>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

export function AssistantIllustration({ className }: { className?: string }) {
  return (
    <Frame
      label="A student asks the assistant to explain eigenvalues. The answer cites Lecture 3 at 12:48."
      className={cn("gap-3", className)}
    >
      <span className="self-end rounded-2xl rounded-br-md bg-paper px-3 py-2 text-[13px] text-ink">Explain eigenvalues</span>
      <div className="flex flex-col gap-2 rounded-2xl bg-paper p-3">
        <p className="m-0 text-[12px] leading-snug text-ink">
          An eigenvector keeps its direction when the matrix acts on it. The eigenvalue is how much it stretches.
        </p>
        <div className="flex flex-wrap gap-1.5">
          <TimeChip>Lecture 3 · 12:48</TimeChip>
          <TimeChip>Lecture 3 · 13:05</TimeChip>
        </div>
      </div>
    </Frame>
  );
}

export function StudyIllustration() {
  const topics = [
    ["Span", 86, "bg-sage"],
    ["Bases", 62, "bg-butter"],
    ["Eigenvalues", 40, "bg-terracotta/55"],
  ] as const;
  return (
    <Frame label="A flashcard asking what a basis is, and quiz mastery by topic: span 86%, bases 62%, eigenvalues 40%." className="gap-3">
      <div className="flex flex-col gap-1 rounded-2xl bg-paper px-3.5 py-3">
        <span className="font-mono text-[10px] tracking-[0.1em] text-ink-soft uppercase">Due today · 1 of 12</span>
        <span className="font-serif text-[20px] leading-tight text-ink">What is a basis?</span>
      </div>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {topics.map(([topic, pct, fill]) => (
          <li key={topic} className="grid grid-cols-[84px_1fr_32px] items-center gap-2 text-[12px] text-ink">
            <span>{topic}</span>
            <span className="relative h-1.5 rounded-full bg-paper">
              <span className={cn("absolute inset-y-0 left-0 rounded-full", fill)} style={{ width: `${pct}%` }} />
            </span>
            <span className="text-right font-mono text-[11px] text-ink-soft">{pct}%</span>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

export function PodcastIllustration() {
  const bars = [30, 55, 80, 45, 65, 90, 50, 70, 35, 60, 85, 40, 55, 75, 30, 50, 65, 45];
  return (
    <Frame label="A lesson as a two-voice podcast, with a play button and a waveform." className="gap-3">
      <div className="flex flex-col gap-1.5 text-[12px] leading-snug">
        <p className="m-0 flex gap-2 text-ink">
          <span className="font-mono text-[11px] text-sage-ink">A</span>
          So why does the direction stay the same?
        </p>
        <p className="m-0 flex gap-2 text-ink">
          <span className="font-mono text-[11px] text-clay-ink">B</span>
          Because the matrix only stretches that vector.
        </p>
      </div>
      <div className="mt-auto flex items-center gap-3 rounded-2xl bg-paper p-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink text-cream">
          <Icon icon={Play} size={14} className="fill-current" />
        </span>
        <span className="flex h-8 grow items-center gap-[3px]">
          {bars.map((h, i) => (
            <span key={i} className={cn("w-1 rounded-full", i < 7 ? "bg-sage" : "bg-line-strong")} style={{ height: `${h}%` }} />
          ))}
        </span>
        <span className="font-mono text-[11px] text-ink-soft">6:40</span>
      </div>
    </Frame>
  );
}

export function SpaceIllustration() {
  return (
    <Frame label="A private note made from an uploaded PDF: ready, with 27 flashcards and 24 questions. Only its owner can see it.">
      <div className="flex flex-col gap-2 rounded-2xl bg-paper p-3.5">
        <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.1em] text-ink-soft uppercase">
          <Icon icon={FileText} size={12} />
          PDF · 12 pages
        </span>
        <span className="font-serif text-[20px] leading-tight text-ink">My revision notes</span>
        <span className="flex items-center justify-between gap-2">
          <Badge tone="success" size="sm">
            Ready
          </Badge>
          <span className="text-[12px] text-ink-soft">27 cards · 24 questions</span>
        </span>
      </div>
      <span className="mt-auto flex items-center gap-1.5 text-[12px] text-ink-soft">
        <Icon icon={Lock} size={13} />
        Only you can see it. Not your instructors, not the admins.
      </span>
    </Frame>
  );
}

/* The hero's picture: a lecture paused at the moment an answer cites. */
export function HeroIllustration() {
  return (
    <div
      role="img"
      aria-label="A lecture video paused at 12:48, next to an assistant answer that cites that moment."
      className="relative mx-auto w-full max-w-[460px]"
    >
      <div className="rounded-3xl bg-paper p-3 shadow-raised">
        <VideoBlock className="aspect-video" />
        <div className="flex items-center justify-between gap-3 px-1 pt-3 pb-6">
          <span className="flex min-w-0 flex-col">
            <span className="font-mono text-[10px] tracking-[0.1em] text-ink-soft uppercase">Linear Algebra · Lecture 3</span>
            <span className="text-[14px] font-medium text-ink">Eigenvalues and eigenvectors</span>
          </span>
          <TimeChip>12:48</TimeChip>
        </div>
      </div>
      {/* Overlaps only the video card's bottom padding, so its title stays readable. */}
      <div className="relative -mt-5 -mr-3 ml-auto flex w-[78%] flex-col gap-2 rounded-2xl bg-paper p-3.5 shadow-raised">
        <span className="font-mono text-[10px] tracking-[0.1em] text-ink-soft uppercase">Course assistant</span>
        <p className="m-0 text-[13px] leading-snug text-ink">
          The eigenvalue is how much the matrix stretches a vector that keeps its direction.
        </p>
        <TimeChip>Lecture 3 · 12:48</TimeChip>
      </div>
    </div>
  );
}
