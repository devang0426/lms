import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { loadCourseNotes, MAX_EXPORT_LESSONS } from "@/lib/db/course-notes";
import { combinedFileName, exportCombinedHtml, exportCombinedMarkdown, type CombinedNotes } from "@/lib/export";

/* A course's published lesson notes in one file (feature 36), for its
   enrolled students and staff; anyone else gets a 404.
   ?format=md|doc|print and ?lessons=<id>,<id> (every lesson with notes
   when left out). md and doc download as attachments; print is a page
   that opens the print dialog, where the browser saves a PDF. The path
   has no file extension on purpose: proxy.ts skips paths that look like
   static files, and the Clerk session is needed here. */

const input = z.object({
  format: z.enum(["md", "doc", "print"]),
  lessons: z
    .string()
    .transform((s) => s.split(",").filter(Boolean))
    .pipe(z.array(z.uuid()).min(1).max(MAX_EXPORT_LESSONS))
    .optional(),
});

export async function GET(request: Request, ctx: RouteContext<"/courses/[courseId]/notes/export">): Promise<Response> {
  const { courseId } = await ctx.params;
  const params = new URL(request.url).searchParams;
  const parsed = input.safeParse({ format: params.get("format"), lessons: params.get("lessons") ?? undefined });
  if (!parsed.success) return new Response("Bad request", { status: 400 });
  const { format, lessons } = parsed.data;

  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  const found = await loadCourseNotes(courseId, user, lessons ?? null);
  if (!found || found.lessons.length === 0) return new Response("Not found", { status: 404 });

  const notes: CombinedNotes = { courseTitle: found.course.title, courseCode: found.course.code, lessons: found.lessons };
  const headers = { "cache-control": "private, no-store" };
  switch (format) {
    case "md":
      return new Response(exportCombinedMarkdown(notes), {
        headers: { ...headers, "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename="${combinedFileName(notes, "md")}"` },
      });
    case "doc":
      return new Response(exportCombinedHtml(notes, "word"), {
        headers: { ...headers, "content-type": "application/msword; charset=utf-8", "content-disposition": `attachment; filename="${combinedFileName(notes, "doc")}"` },
      });
    case "print":
      return new Response(exportCombinedHtml(notes, "print"), { headers: { ...headers, "content-type": "text/html; charset=utf-8" } });
    default: {
      const never: never = format;
      return never;
    }
  }
}
