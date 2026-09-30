"use client";

import { useSelectedLayoutSegment } from "next/navigation";
import { Breadcrumbs, type Crumb } from "./breadcrumbs";

/* The course top bar's breadcrumb (feature 28): "My courses › MATH 201",
   with "› Assistant" on the course's assistant page. The layout decides
   the root (My courses, Teaching or Explore); the segment below it says
   which page is open. */
export function CourseBreadcrumbs({ root, courseId, code }: { root: Crumb; courseId: string; code: string }) {
  const segment = useSelectedLayoutSegment();
  const items: Crumb[] = [root, { label: code, href: `/courses/${courseId}` }];
  if (segment === "assistant") items.push({ label: "Assistant" });
  return <Breadcrumbs items={items} />;
}
