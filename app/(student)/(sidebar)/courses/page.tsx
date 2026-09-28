import Link from "next/link";
import { filterCourses, parseCourseFilter } from "@/components/student/course-view";
import { CourseFilterChips, CourseGrid } from "@/components/student/home-cards";
import { loadStudentCourses } from "@/components/student/load-courses";
import { PageHeader } from "@/components/shell/page-header";
import { Button, EmptyState } from "@/components/ui";
import { requireAreaRole } from "@/lib/auth";
import { plural } from "@/lib/utils/format";

export const metadata = { title: "My courses · Studyhall" };

export default async function MyCoursesPage({ searchParams }: PageProps<"/courses">) {
  const user = await requireAreaRole("student", "admin");
  const { show } = await searchParams;
  const filter = parseCourseFilter(show);
  const courses = await loadStudentCourses(user);
  const shown = filterCourses(courses, filter);

  return (
    <>
      <PageHeader
        eyebrow={plural(courses.length, "course")}
        title={<>My <em>courses</em></>}
        actions={<CourseFilterChips basePath="/courses" active={filter} />}
      />
      <CourseGrid
        courses={shown}
        empty={
          courses.length === 0 ? (
            <EmptyState
              title="No courses yet"
              description="Enrollment is by roster. Once you're added to a course and it's published, it shows up here."
              action={
                <Button asChild variant="secondary" size="md">
                  <Link href="/catalog">Browse the catalog</Link>
                </Button>
              }
            />
          ) : (
            <EmptyState
              title={filter === "completed" ? "Nothing finished yet" : "Everything's finished"}
              description={filter === "completed" ? "Courses you finish will collect here." : "Every course you're enrolled in is complete."}
            />
          )
        }
      />
    </>
  );
}
