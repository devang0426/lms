import { PlaceholderPage } from "@/components/shell/page-header";
import { requireAreaRole } from "@/lib/auth";

export default async function InstructorOverviewPage() {
  const user = await requireAreaRole("instructor", "admin");
  const name = user.name.replace(/^(prof|dr)\.?\s+/i, "").split(/\s+/)[0];
  return (
    <PlaceholderPage
      eyebrow="Overview"
      title={
        <>
          Welcome back, <em>{name}</em>
        </>
      }
      message="Your stats, courses and the grading queue will live here."
      feature="22"
    />
  );
}
