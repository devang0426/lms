import { PlaceholderPage } from "@/components/shell/page-header";

export const metadata = { title: "Calendar · Studyhall" };

export default function CalendarPage() {
  return (
    <PlaceholderPage
      eyebrow="Calendar"
      title={<>Calendar</>}
      message="Due dates and course events will be listed here."
      feature="21"
    />
  );
}
