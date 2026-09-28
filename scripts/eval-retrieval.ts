/* Retrieval evaluation (feature 13). Run: npm run eval:retrieval
   Costs a fraction of a cent (one small embedding per question).

   Reads scripts/demo-assets/eval.json and searches the demo course as the
   demo student, the way the assistant will. Prints, per question, the top
   three chunks and the best similarity, then:
   - hit@3: on-syllabus questions with a top-3 chunk within 15 s of where
     the answer is taught (target: at least 8 of 10);
   - the similarity gap between on- and off-syllabus questions, used to
     pick ASSISTANT_MIN_SIMILARITY;
   - the access check: a user who isn't enrolled gets 0 results.
   Exits 1 when an acceptance target is missed. */

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { searchChunks, type SearchResult } from "@/lib/ai/retrieval/search";
import { countLessonChunks } from "@/lib/db/chunks";
import { db } from "@/lib/db/client";
import { contentChunks, courses, lessons, modules, terms, transcriptSegments, users, videos } from "@/lib/db/schema";
import { DEMO_ACCOUNTS } from "@/lib/demo/accounts";
import { formatTime } from "@/lib/time";

const EVAL_PATH = "scripts/demo-assets/eval.json";
const TOLERANCE_SEC = 15;
const TOP = 3;
const HIT_TARGET = 8;

const evalSet = z.object({
  courseCode: z.string(),
  lessonTitle: z.string(),
  onSyllabus: z.array(
    z.object({
      question: z.string().min(1),
      /* Where the answer is taught; a list = any of these moments. */
      startSec: z.union([z.number().min(0), z.array(z.number().min(0)).min(1)]),
    }),
  ),
  offSyllabus: z.array(z.object({ question: z.string().min(1) })),
});

/* 0 when t is inside the chunk, else how far outside it is. */
function distance(t: number, r: SearchResult): number {
  const start = r.chunk.startSec ?? 0;
  const end = r.chunk.endSec ?? start;
  return t < start ? start - t : t > end ? t - end : 0;
}

const fmt = (n: number) => n.toFixed(3);
const range = (r: SearchResult) => `${formatTime(r.chunk.startSec ?? 0)}–${formatTime(r.chunk.endSec ?? 0)}`;

async function main() {
  const spec = evalSet.parse(JSON.parse(await readFile(EVAL_PATH, "utf8")));

  const [course] = await db
    .select({ id: courses.id, title: courses.title })
    .from(courses)
    .innerJoin(terms, eq(terms.id, courses.termId))
    .where(and(eq(courses.code, spec.courseCode), eq(terms.isCurrent, true)))
    .limit(1);
  if (!course) throw new Error(`No course ${spec.courseCode} in the current term. Run npm run db:seed.`);
  const [lesson] = await db
    .select({ id: lessons.id })
    .from(lessons)
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .where(and(eq(modules.courseId, course.id), eq(lessons.title, spec.lessonTitle)))
    .limit(1);
  if (!lesson) throw new Error(`No lesson "${spec.lessonTitle}" in ${spec.courseCode}.`);
  const userId = await demoUser("student");
  const failures: string[] = [];

  // ---- Coverage: the chunks span the whole lecture.
  const chunkCount = await countLessonChunks(lesson.id);
  if (chunkCount === 0) throw new Error("The lecture has no chunks. Publish it (or run npm run db:seed) first.");
  const [cover] = await db
    .select({
      from: sql<number>`min(${contentChunks.startSec})`.mapWith(Number),
      to: sql<number>`max(${contentChunks.endSec})`.mapWith(Number),
    })
    .from(contentChunks)
    .where(eq(contentChunks.lessonId, lesson.id));
  const [speech] = await db
    .select({
      from: sql<number>`min(${transcriptSegments.startSec})`.mapWith(Number),
      to: sql<number>`max(${transcriptSegments.endSec})`.mapWith(Number),
      duration: sql<number>`max(${videos.durationSec})`.mapWith(Number),
    })
    .from(transcriptSegments)
    .innerJoin(videos, and(eq(videos.id, transcriptSegments.videoId), eq(videos.status, "ready")))
    .where(eq(transcriptSegments.lessonId, lesson.id));
  const covers = cover.from <= speech.from && cover.to >= speech.to;
  console.log(`\n${course.title} · "${spec.lessonTitle}"`);
  console.log(
    `Chunks: ${chunkCount}, covering ${formatTime(cover.from)}–${formatTime(cover.to)} ` +
      `(speech ${formatTime(speech.from)}–${formatTime(speech.to)}, video ${formatTime(speech.duration)}) ${covers ? "✓" : "✗"}`,
  );
  if (!covers) failures.push("chunks don't cover the whole lecture");

  // ---- On-syllabus: hit@3 within 15 s.
  console.log(`\nOn-syllabus (hit = a top-${TOP} chunk within ${TOLERANCE_SEC} s of where it's taught)`);
  const onTop: number[] = [];
  let hits = 0;
  for (const [i, q] of spec.onSyllabus.entries()) {
    const expected = Array.isArray(q.startSec) ? q.startSec : [q.startSec];
    const results = await searchChunks({ userId, scope: { courseId: course.id }, query: q.question, k: 8 });
    const top = results.slice(0, TOP);
    const best = Math.min(...top.flatMap((r) => expected.map((t) => distance(t, r))), Infinity);
    const hit = best <= TOLERANCE_SEC;
    if (hit) hits++;
    const topSim = Math.max(0, ...results.map((r) => r.similarity));
    onTop.push(topSim);
    console.log(
      `${hit ? "✓" : "✗"} ${String(i + 1).padStart(2)}. top sim ${fmt(topSim)}  fts ${results.some((r) => r.ftsRank !== null) ? "hit " : "none"}  ` +
        `${q.question}\n      top ${TOP}: ${top.map((r) => `${range(r)} (${fmt(r.similarity)})`).join(", ") || "—"}` +
        (hit ? "" : `  · nearest ${Number.isFinite(best) ? `${best.toFixed(0)} s away` : "—"}`),
    );
  }
  console.log(`hit@${TOP}: ${hits}/${spec.onSyllabus.length} (target ${HIT_TARGET}) ${hits >= HIT_TARGET ? "✓" : "✗"}`);
  if (hits < HIT_TARGET) failures.push(`hit@${TOP} is ${hits}/${spec.onSyllabus.length}`);

  // ---- Off-syllabus: top similarity (and whether full-text search matched).
  console.log("\nOff-syllabus");
  const offTop: number[] = [];
  let offFts = 0;
  for (const [i, q] of spec.offSyllabus.entries()) {
    const results = await searchChunks({ userId, scope: { courseId: course.id }, query: q.question, k: 8 });
    const topSim = Math.max(0, ...results.map((r) => r.similarity));
    const fts = results.some((r) => r.ftsRank !== null);
    if (fts) offFts++;
    offTop.push(topSim);
    console.log(`   ${String(i + 1).padStart(2)}. top sim ${fmt(topSim)}  fts ${fts ? "HIT " : "none"}  ${q.question}`);
  }

  // ---- The threshold.
  const onMin = Math.min(...onTop);
  const offMax = Math.max(...offTop);
  const configured = Number(process.env.ASSISTANT_MIN_SIMILARITY);
  console.log("\nThreshold (ASSISTANT_MIN_SIMILARITY)");
  console.log(`   lowest on-syllabus top sim  ${fmt(onMin)}`);
  console.log(`   highest off-syllabus top sim ${fmt(offMax)}`);
  if (onMin > offMax) {
    console.log(`   gap ${fmt(onMin - offMax)} → midpoint ${fmt((onMin + offMax) / 2)}`);
  } else {
    console.log("   ✗ no gap: some off-syllabus question scores as high as an on-syllabus one");
    failures.push("on- and off-syllabus similarities overlap");
  }
  if (Number.isFinite(configured)) {
    const offOk = offMax < configured;
    const onOk = onMin >= configured;
    console.log(
      `   configured ${fmt(configured)}: off-syllabus all below ${offOk ? "✓" : "✗"}, on-syllabus all at or above ${onOk ? "✓" : "✗"}`,
    );
    if (!offOk) failures.push("an off-syllabus question scores above ASSISTANT_MIN_SIMILARITY");
    if (!onOk) failures.push("an on-syllabus question scores below ASSISTANT_MIN_SIMILARITY");
  } else {
    console.log("   ASSISTANT_MIN_SIMILARITY isn't set in .env.local");
  }
  if (offFts > 0) {
    console.log(`   ✗ ${offFts} off-syllabus question(s) matched full-text search, which the relevance gate lets through`);
    failures.push("an off-syllabus question matched full-text search");
  }

  // ---- Access: nobody outside the course gets anything.
  console.log("\nAccess");
  const probe = spec.onSyllabus[0].question;
  const outsider = await outsiderUserId(course.id);
  // A made-up id works too, but its ai_usage row then fails the user foreign
  // key (logged, not thrown), so a real outsider is preferred.
  const [outsiderLabel, outsiderId] = outsider ? ["real user not enrolled", outsider] : ["unknown user id", randomUUID()];
  const checks: [string, string, Parameters<typeof searchChunks>[0]["scope"], "none" | "some"][] = [
    ["enrolled student, course", userId, { courseId: course.id }, "some"],
    ["enrolled student, lesson", userId, { lessonId: lesson.id }, "some"],
    ["enrolled student, someone else's private space", userId, { ownerId: randomUUID() }, "none"],
    [`${outsiderLabel}, course`, outsiderId, { courseId: course.id }, "none"],
    [`${outsiderLabel}, lesson`, outsiderId, { lessonId: lesson.id }, "none"],
  ];
  for (const [label, who, scope, want] of checks) {
    const n = (await searchChunks({ userId: who, scope, query: probe, k: 8 })).length;
    const ok = want === "none" ? n === 0 : n > 0;
    console.log(`   ${ok ? "✓" : "✗"} ${label}: ${n} result(s)`);
    if (!ok) failures.push(`access: ${label} got ${n}`);
  }

  console.log(failures.length ? `\nFAILED: ${failures.join("; ")}` : "\nAll retrieval targets met.");
  process.exit(failures.length ? 1 : 0);
}

async function demoUser(key: "admin" | "student"): Promise<string> {
  const email = DEMO_ACCOUNTS.find((a) => a.key === key)!.email;
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (!row) throw new Error(`Demo ${key} missing. Run npm run db:seed.`);
  return row.id;
}

/* A signed-up student with no enrollment or staff role in the course. */
async function outsiderUserId(courseId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      sql`${users.role} <> 'admin'
        and not exists (select 1 from course_staff cs where cs.course_id = ${courseId} and cs.user_id = users.id)
        and not exists (select 1 from enrollments e join sections s on s.id = e.section_id
          where s.course_id = ${courseId} and e.user_id = users.id and e.status = 'active')`,
    )
    .limit(1);
  return row?.id ?? null;
}

main().catch((err) => {
  console.error("Retrieval eval failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
