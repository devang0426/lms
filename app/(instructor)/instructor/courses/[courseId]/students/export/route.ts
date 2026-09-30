import { getCurrentUser } from "@/lib/auth";
import { courseLearners } from "@/lib/db/learners";
import { learnersCsv, learnersFileName } from "@/lib/progress/learners";

/* A course's Learners table as CSV (feature 31), for its staff only;
   anyone else gets a 404. The staff check is in the query. Formula-safe
   through lib/coursework/csv.ts. Like the gradebook export, the path has
   no ".csv" (proxy.ts skips file-like paths, and the session is needed):
   the name comes from Content-Disposition. */

export async function GET(_request: Request, ctx: RouteContext<"/instructor/courses/[courseId]/students/export">): Promise<Response> {
  const { courseId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  const now = new Date();
  const data = await courseLearners(courseId, user, now);
  if (!data) return new Response("Not found", { status: 404 });

  return new Response(learnersCsv(data), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${learnersFileName(data.course.code, now)}"`,
      "cache-control": "private, no-store",
    },
  });
}
