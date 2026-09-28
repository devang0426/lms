import { PlaceholderPage } from "@/components/shell/page-header";

export const metadata = { title: "Discussions · Studyhall" };

export default function DiscussionsPage() {
  return (
    <PlaceholderPage
      eyebrow="Discussions"
      title={<>Discussions</>}
      message="Course discussions and questions for your instructor will appear here."
      feature="21"
    />
  );
}
