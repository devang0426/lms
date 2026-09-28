"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import {
  addLesson,
  addModule,
  deleteLesson,
  deleteModule,
  moveLesson,
  moveModule,
  renameLesson,
  renameModule,
  setLessonPublished,
  setModulePublished,
} from "@/app/(instructor)/instructor/courses/actions";
import { Button, EmptyState, Eyebrow, Icon, Input, Select } from "@/components/ui";
import type { Lesson, LessonKind, Module } from "@/lib/db/schema";
import type { ActionResult } from "@/lib/utils/action-result";
import { InlineTitle } from "./inline-title";
import { RowControls } from "./row-controls";
import { StatusBadge } from "./status-badge";
import { useAction } from "./use-action";

export type BuilderModule = Module & { lessons: Lesson[] };

const kindLabels: Record<LessonKind, string> = {
  video: "Video",
  reading: "Reading",
  quiz: "Quiz",
  assignment: "Assignment",
};
const lessonKinds = Object.keys(kindLabels) as LessonKind[];

/* Modules and lessons as ordered lists: rename, add, delete, move up and
   down, and a publish toggle on each. */
export function CurriculumEditor({ courseId, modules }: { courseId: string; modules: BuilderModule[] }) {
  return (
    <div className="flex flex-col gap-4">
      {modules.length === 0 ? (
        <div className="rounded-card border border-dashed border-line bg-paper">
          <EmptyState title="No modules yet" description="Modules group lessons, e.g. “Week 1 · Vectors”. Add the first one below." />
        </div>
      ) : (
        modules.map((m, i) => (
          <ModuleCard key={m.id} courseId={courseId} module={m} index={i} isFirst={i === 0} isLast={i === modules.length - 1} />
        ))
      )}
      <AddForm
        placeholder="New module title"
        buttonLabel="Add module"
        action={(title) => addModule({ courseId, title })}
      />
    </div>
  );
}

function ModuleCard({
  courseId,
  module: m,
  index,
  isFirst,
  isLast,
}: {
  courseId: string;
  module: BuilderModule;
  index: number;
  isFirst: boolean;
  isLast: boolean;
}) {
  const { pending, run } = useAction();
  const published = m.status === "published";

  return (
    <section aria-label={m.title} className="flex flex-col rounded-2xl border border-line bg-paper">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3.5 md:px-5">
        <span className="flex min-w-0 grow items-center gap-3">
          <span className="font-mono text-label text-ink-soft">{String(index + 1).padStart(2, "0")}</span>
          <InlineTitle
            value={m.title}
            label={m.title}
            pending={pending}
            className="text-[16px] font-semibold"
            onSave={(title, done) => run(() => renameModule({ id: m.id, title }), done)}
          />
        </span>
        <span className="flex items-center gap-2">
          <StatusBadge status={m.status} size="sm" />
          <Button
            variant={published ? "quiet" : "success"}
            size="xs"
            disabled={pending}
            onClick={() => run(() => setModulePublished({ id: m.id, published: !published }))}
          >
            {published ? "Unpublish" : "Publish"}
          </Button>
          <RowControls
            label={m.title}
            isFirst={isFirst}
            isLast={isLast}
            pending={pending}
            onMove={(direction) => run(() => moveModule({ id: m.id, direction }))}
            onDelete={() => run(() => deleteModule({ id: m.id }))}
            deleteWarning={`This also deletes its ${m.lessons.length} lesson${m.lessons.length === 1 ? "" : "s"}. It can't be undone.`}
          />
        </span>
      </header>

      <ol className="m-0 flex list-none flex-col border-t border-line p-0">
        {m.lessons.length === 0 && (
          <li className="px-5 py-4 text-small text-ink-soft md:pl-[52px]">No lessons in this module yet.</li>
        )}
        {m.lessons.map((l, i) => (
          <LessonRow key={l.id} courseId={courseId} lesson={l} isFirst={i === 0} isLast={i === m.lessons.length - 1} />
        ))}
      </ol>

      <div className="border-t border-line px-4 py-3 md:px-5 md:pl-[52px]">
        <AddForm
          placeholder="New lesson title"
          buttonLabel="Add lesson"
          withKind
          action={(title, kind) => addLesson({ moduleId: m.id, title, kind })}
        />
      </div>
    </section>
  );
}

function LessonRow({
  courseId,
  lesson: l,
  isFirst,
  isLast,
}: {
  courseId: string;
  lesson: Lesson;
  isFirst: boolean;
  isLast: boolean;
}) {
  const { pending, run } = useAction();
  const published = l.status === "published";

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line px-4 py-2 last:border-b-0 md:px-5 md:pl-[52px]">
      <span className="flex min-w-0 grow items-center gap-3 text-small">
        <Eyebrow className="w-[74px] shrink-0">{kindLabels[l.kind]}</Eyebrow>
        <InlineTitle
          value={l.title}
          label={l.title}
          pending={pending}
          className="text-[15px]"
          onSave={(title, done) => run(() => renameLesson({ id: l.id, title }), done)}
        />
      </span>
      <span className="flex items-center gap-2">
        <StatusBadge status={l.status} size="sm" />
        <Button asChild variant="quiet" size="xs">
          <Link href={`/instructor/courses/${courseId}/lessons/${l.id}`}>
            {l.kind === "video" && l.status === "draft" ? "Upload video" : "Open"}
          </Link>
        </Button>
        <Button
          variant={published ? "quiet" : "success"}
          size="xs"
          disabled={pending || l.status === "processing"}
          onClick={() => run(() => setLessonPublished({ id: l.id, published: !published }))}
        >
          {published ? "Unpublish" : "Publish"}
        </Button>
        <RowControls
          label={l.title}
          isFirst={isFirst}
          isLast={isLast}
          pending={pending}
          onMove={(direction) => run(() => moveLesson({ id: l.id, direction }))}
          onDelete={() => run(() => deleteLesson({ id: l.id }))}
          deleteWarning="Students lose access to it straight away. It can't be undone."
        />
      </span>
    </li>
  );
}

function AddForm({
  placeholder,
  buttonLabel,
  withKind = false,
  action,
}: {
  placeholder: string;
  buttonLabel: string;
  withKind?: boolean;
  action: (title: string, kind: LessonKind) => Promise<ActionResult>;
}) {
  const { pending, run } = useAction();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<LessonKind>("video");

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    run(() => action(title.trim(), kind), () => setTitle(""));
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        maxLength={200}
        className="h-10 min-w-0 flex-1 basis-[200px]"
      />
      {withKind && (
        <Select
          value={kind}
          onChange={(e) => setKind(e.target.value as LessonKind)}
          aria-label="Lesson type"
          className="h-10 w-auto"
        >
          {lessonKinds.map((k) => (
            <option key={k} value={k}>
              {kindLabels[k]}
            </option>
          ))}
        </Select>
      )}
      <Button type="submit" variant="tertiary" size="sm" className="h-10" loading={pending} leading={<Icon icon={Plus} size={16} />}>
        {buttonLabel}
      </Button>
    </form>
  );
}
