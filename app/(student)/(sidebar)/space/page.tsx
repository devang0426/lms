import { PlaceholderPage } from "@/components/shell/page-header";

export const metadata = { title: "My space · Studyhall" };

export default function MySpacePage() {
  return (
    <PlaceholderPage
      eyebrow="My space"
      title={<>My <em>space</em></>}
      message="Upload your own notes and sources and study them privately here."
      feature="19"
    />
  );
}
