import { PlaceholderPage } from "@/components/shell/page-header";

export const metadata = { title: "Progress · Studyhall" };

export default function ProgressPage() {
  return (
    <PlaceholderPage
      eyebrow="Progress"
      title={<>Your <em>progress</em></>}
      message="Lessons finished, study streaks and mastery will be charted here."
      feature="22"
    />
  );
}
