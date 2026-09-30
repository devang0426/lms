import { describe, expect, it } from "vitest";
import { confirmsCourse, courseDeleteContents, courseDeleteRefusal, type CourseDeleteFacts } from "./delete";

const empty: CourseDeleteFacts = { activeStudents: 0, handedIn: 0, pendingInvitations: 0, modules: 0, lessons: 0 };

describe("courseDeleteRefusal", () => {
  it("allows a course nobody depends on", () => {
    expect(courseDeleteRefusal(empty)).toBeNull();
    expect(courseDeleteRefusal({ ...empty, modules: 4, lessons: 12 })).toBeNull();
  });

  it("refuses while students are enrolled", () => {
    expect(courseDeleteRefusal({ ...empty, activeStudents: 1 })).toBe(
      "1 student is enrolled, so this course can't be deleted. Unpublish it instead.",
    );
    expect(courseDeleteRefusal({ ...empty, activeStudents: 3 })).toMatch(/^3 students are enrolled/);
  });

  it("refuses once work has been handed in, even with nobody enrolled now", () => {
    expect(courseDeleteRefusal({ ...empty, handedIn: 2 })).toMatch(/handed in work.*Unpublish it instead/);
  });

  it("refuses while an invitation is pending", () => {
    expect(courseDeleteRefusal({ ...empty, pendingInvitations: 1 })).toBe(
      "1 invitation to this course is waiting to be accepted. Withdraw it under Admin → Users first.",
    );
    expect(courseDeleteRefusal({ ...empty, pendingInvitations: 2 })).toMatch(/2 invitations .* are waiting .* Withdraw them/);
  });

  it("names enrolled students first when several reasons apply", () => {
    expect(courseDeleteRefusal({ ...empty, activeStudents: 1, handedIn: 1, pendingInvitations: 1 })).toMatch(/enrolled/);
  });
});

describe("courseDeleteContents", () => {
  it("counts the modules and lessons that go", () => {
    expect(courseDeleteContents({ modules: 1, lessons: 3 })[0]).toMatch(/^1 module and 3 lessons, with their videos/);
    expect(courseDeleteContents({ modules: 0, lessons: 0 })[0]).toBe("The course itself (it has no modules or lessons)");
  });
});

describe("confirmsCourse", () => {
  it("matches the course code, ignoring spaces and case", () => {
    expect(confirmsCourse("MATH 201", "MATH 201")).toBe(true);
    expect(confirmsCourse(" math201 ", "MATH 201")).toBe(true);
    expect(confirmsCourse("MATH 20", "MATH 201")).toBe(false);
    expect(confirmsCourse("", "MATH 201")).toBe(false);
    expect(confirmsCourse("", "")).toBe(false);
  });
});
