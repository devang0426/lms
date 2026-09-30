import { describe, expect, it } from "vitest";
import { isActive, NAV, navItems, STUDENT_MORE, studentTabs } from "./nav-config";

/* Feature 28: one name per page, and every student page within two taps
   on a phone. Feature 31 brought Learners and Progress back. */

describe("nav", () => {
  it("has Learners for staff and Progress for students (feature 31)", () => {
    expect(NAV.instructor.items.map((i) => i.href)).toContain("/instructor/learners");
    expect(NAV.student.items.map((i) => i.href)).toContain("/progress");
    expect(STUDENT_MORE.map((i) => i.href)).toContain("/progress");
  });

  it("uses one name per page", () => {
    const labels = new Map<string, string>();
    for (const item of [...Object.values(NAV).flatMap((a) => a.items), ...studentTabs(), ...STUDENT_MORE]) {
      const seen = labels.get(item.href);
      if (seen) expect(item.label, item.href).toBe(seen);
      labels.set(item.href, item.label);
    }
    expect(labels.get("/courses")).toBe("My courses");
    expect(labels.get("/catalog")).toBe("Explore");
    expect(labels.get("/study")).toBe("Flashcards");
    expect(labels.get("/instructor/messages")).toBe("Questions");
  });

  it("puts every student page in the tab bar or its More sheet", () => {
    const onPhone = new Set([...studentTabs(), ...STUDENT_MORE].map((l) => l.href));
    for (const item of NAV.student.items) expect(onPhone.has(item.href), item.href).toBe(true);
    expect(onPhone.has("/profile")).toBe(true);
    expect(studentTabs().map((t) => t.label)).toEqual(["Home", "My courses", "Flashcards"]);
  });

  it("gives staff on the student pages a Home that says where it goes", () => {
    expect(navItems("student", true)[0]).toMatchObject({ href: "/instructor", label: "Teaching home" });
    expect(studentTabs(true)[0]).toMatchObject({ href: "/instructor", label: "Teaching home" });
    expect(navItems("student")[0]).toMatchObject({ href: "/", label: "Home" });
    expect(navItems("instructor", true)).toBe(NAV.instructor.items);
  });
});

describe("isActive", () => {
  it("matches a section and its sub-pages, and roots only exactly", () => {
    expect(isActive("/courses/abc", { href: "/courses" })).toBe(true);
    expect(isActive("/coursesx", { href: "/courses" })).toBe(false);
    expect(isActive("/instructor/courses", { href: "/instructor", exact: true })).toBe(false);
    expect(isActive("/", { href: "/", exact: true })).toBe(true);
  });
});
