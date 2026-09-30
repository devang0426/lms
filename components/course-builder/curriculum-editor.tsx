"use client";

import { MoreHorizontal, Plus, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
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
import { Button, EmptyState, Eyebrow, Icon, Input, Label, Menu, MenuContent, MenuItem, MenuTrigger, Select } from "@/components/ui";
import { ADDABLE_LESSON_KINDS, LESSON_KIND_LABELS, type AddableLessonKind, type LessonFacts } from "@/lib/courses/lessons";
import type { Lesson, Module } from "@/lib/db/schema";
import { VIDEO_REQUIREMENTS } from "@/lib/video/upload-check";
import { InlineTitle } from "./inline-title";
import { ChangeTypeDialog, PublishLessonDialog } from "./lesson-dialogs";
import { RowControls } from "./row-controls";
import { StatusBadge } from "./status-badge";
import { UploadLectureDialog } from "./upload-lecture-dialog";
import { useAction } from "./use-action";

export type BuilderLesson = Lesson & { facts: LessonFacts };
export type BuilderModule = Module & { lessons: BuilderLesson[] };

const quietIcon = "border-transparent bg-transparent text-ink-soft";

/* Modules and lessons as ordered lists: rename, add, delete, move up and
   down, and publish. Feature 27 adds "Upload lecture" on each module, opens
   a new lesson straight away, confirms what a lesson's Publish puts live,
   and lets an empty lesson change type. */
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
      <AddModuleForm courseId={courseId} />
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
        <span className="flex flex-wrap items-center gap-2">
          <UploadLectureDialog courseId={courseId} moduleId={m.id} moduleTitle={m.title} />
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
          <li className="px-5 py-4 text-small text-ink-soft md:pl-[52px]">No lessons in this module yet. Upload a lecture, or add a lesson below.</li>
        )}
        {m.lessons.map((l, i) => (
          <LessonRow
            key={l.id}
            courseId={courseId}
            lesson={l}
            moduleDraft={!published}
            isFirst={i === 0}
            isLast={i === m.lessons.length - 1}
          />
        ))}
      </ol>

      <div className="border-t border-line px-4 py-3 md:px-5 md:pl-[52px]">
        <AddLessonForm courseId={courseId} moduleId={m.id} />
      </div>
    </section>
  );
}

function LessonRow({
  courseId,
  lesson: l,
  moduleDraft,
  isFirst,
  isLast,
}: {
  courseId: string;
  lesson: BuilderLesson;
  moduleDraft: boolean;
  isFirst: boolean;
  isLast: boolean;
}) {
  const { pending, run } = useAction();
  const [dialog, setDialog] = useState<"publish" | "type" | null>(null);
  const published = l.status === "published";
  const editor = `/instructor/courses/${courseId}/lessons/${l.id}`;
  // Any video lesson without a ready video, whatever its status (feature 27).
  const needsVideo = l.kind === "video" && !l.facts.readyVideo;
  const dialogProps = (which: "publish" | "type") => ({
    open: dialog === which,
    onOpenChange: (open: boolean) => setDialog(open ? which : null),
  });

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line px-4 py-2 last:border-b-0 md:px-5 md:pl-[52px]">
      <span className="flex min-w-0 grow items-center gap-3 text-small">
        <Eyebrow className="w-[74px] shrink-0">{LESSON_KIND_LABELS[l.kind]}</Eyebrow>
        <InlineTitle
          value={l.title}
          label={l.title}
          pending={pending}
          className="text-[15px]"
          onSave={(title, done) => run(() => renameLesson({ id: l.id, title }), done)}
        />
      </span>
      <span className="flex flex-wrap items-center gap-2">
        <StatusBadge status={l.status} size="sm" />
        {needsVideo ? (
          <Button asChild variant="secondary" size="xs">
            {/* asChild renders only the link, so the icon goes inside it. */}
            <Link href={editor}>
              <Icon icon={Upload} size={14} />
              Upload video
            </Link>
          </Button>
        ) : (
          <Button asChild variant="quiet" size="xs">
            <Link href={editor}>Open</Link>
          </Button>
        )}
        {published ? (
          <Button variant="quiet" size="xs" disabled={pending} onClick={() => run(() => setLessonPublished({ id: l.id, published: false }))}>
            Unpublish
          </Button>
        ) : (
          <Button variant="success" size="xs" disabled={pending} onClick={() => setDialog("publish")}>
            Publish
          </Button>
        )}
        {/* Not modal: a modal menu that opens a dialog can leave the page unclickable. */}
        <Menu modal={false}>
          <MenuTrigger asChild>
            <Button variant="icon" size="xs" className={quietIcon} aria-label={`More actions for ${l.title}`} disabled={pending}>
              <Icon icon={MoreHorizontal} size={16} />
            </Button>
          </MenuTrigger>
          <MenuContent align="end">
            <MenuItem onSelect={() => setDialog("type")}>Change type…</MenuItem>
          </MenuContent>
        </Menu>
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
      <PublishLessonDialog courseId={courseId} lesson={l} facts={l.facts} moduleDraft={moduleDraft} {...dialogProps("publish")} />
      <ChangeTypeDialog key={l.kind} lesson={l} facts={l.facts} {...dialogProps("type")} />
    </li>
  );
}

function AddModuleForm({ courseId }: { courseId: string }) {
  const { pending, run } = useAction();
  const [title, setTitle] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    run(() => addModule({ courseId, title: title.trim() }), () => setTitle(""));
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="New module title"
        aria-label="New module title"
        maxLength={200}
        className="h-10 min-w-0 flex-1 basis-[200px]"
      />
      <Button type="submit" variant="tertiary" size="sm" className="h-10" loading={pending} leading={<Icon icon={Plus} size={16} />}>
        Add module
      </Button>
    </form>
  );
}

/* A new lesson opens in its editor straight away (feature 27). */
function AddLessonForm({ courseId, moduleId }: { courseId: string; moduleId: string }) {
  const router = useRouter();
  const typeId = useId();
  const { pending, run } = useAction();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<AddableLessonKind>("video");

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    run(
      () => addLesson({ moduleId, title: title.trim(), kind }),
      ({ id }) => router.push(`/instructor/courses/${courseId}/lessons/${id}`),
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New lesson title"
          aria-label="New lesson title"
          maxLength={200}
          className="h-10 min-w-0 flex-1 basis-[200px]"
        />
        <span className="flex items-center gap-2">
          <Label htmlFor={typeId}>Type</Label>
          <Select id={typeId} value={kind} onChange={(e) => setKind(e.target.value as AddableLessonKind)} className="h-10 w-auto">
            {ADDABLE_LESSON_KINDS.map((k) => (
              <option key={k} value={k}>
                {LESSON_KIND_LABELS[k]}
              </option>
            ))}
          </Select>
        </span>
        <Button type="submit" variant="tertiary" size="sm" className="h-10" loading={pending} leading={<Icon icon={Plus} size={16} />}>
          Add lesson
        </Button>
      </div>
      {kind === "video" && <p className="m-0 text-meta text-ink-soft">You upload the video next: {VIDEO_REQUIREMENTS}.</p>}
    </form>
  );
}
