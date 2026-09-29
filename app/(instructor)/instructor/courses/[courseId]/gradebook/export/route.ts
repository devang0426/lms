import { getCurrentUser } from "@/lib/auth";
import { buildGradebook, categoryWeights, gradebookCsv, gradebookFileName } from "@/lib/coursework/gradebook";
import { getCourseForUser } from "@/lib/db/courses";
import { gradebookData } from "@/lib/db/grades";

/* The gradebook as CSV (feature 20), for the course's staff only; anyone
   else gets a 404. The path has no ".csv" on purpose: proxy.ts skips
   paths that look like static files, and the Clerk session is needed
   here. The file name comes from Content-Disposition instead. */

export async function GET(_request: Request, ctx: RouteContext<"/instructor/courses/[courseId]/gradebook/export">): Promise<Response> {
  const { courseId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  const found = await getCourseForUser(courseId, user);
  if (!found || found.access !== "staff") return new Response("Not found", { status: 404 });

  const data = await gradebookData(courseId);
  const now = new Date();
  const rows = buildGradebook({
    students: data.students,
    items: data.items,
    facts: data.facts,
    weights: categoryWeights(data.weightRows),
    now: now.getTime(),
  });
  return new Response(gradebookCsv(data.items, rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${gradebookFileName(found.course.code, now)}"`,
      "cache-control": "private, no-store",
    },
  });
}
