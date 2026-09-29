import { describe, expect, it } from "vitest";
import { parseCsv, parseRoster } from "./index";

const HEADER = "email,name,role,course_code,section";

describe("parseCsv", () => {
  it("reads quoted fields, escaped quotes, line breaks, CRLF and a BOM", () => {
    const text = '﻿a,b\r\n"x, y","say ""hi"""\r\n"two\nlines",z\n\n';
    expect(parseCsv(text)).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
      ["two\nlines", "z"],
    ]);
  });

  it("keeps a last row with no newline and empty trailing cells", () => {
    expect(parseCsv("a,b\nc,")).toEqual([
      ["a", "b"],
      ["c", ""],
    ]);
  });
});

describe("parseRoster", () => {
  it("needs the exact header", () => {
    const res = parseRoster("email,name,course\nx@y.z,X,MATH 201");
    expect(res.ok).toBe(false);
    expect(parseRoster(`${HEADER}\n`)).toEqual({ ok: false, error: "The file has a header but no rows." });
  });

  it("accepts good rows and explains bad ones, by spreadsheet line", () => {
    const res = parseRoster(
      [
        HEADER,
        "Aanya@Uni.edu , Aanya Sharma, Student ,MATH 201,Section A",
        "not-an-email,Someone,student,MATH 201,Section A",
        "b@uni.edu,B,teacher,MATH 201,Section A",
        "c@uni.edu,C,student,MATH 201,",
        "d@uni.edu,D,instructor,MATH 201,",
        "e@uni.edu,E,student,MATH 201",
      ].join("\n"),
    );
    if (!res.ok) throw new Error(res.error);
    const [a, bad1, bad2, bad3, teacher, bad4] = res.rows;
    expect(a).toMatchObject({ line: 2, ok: true, row: { email: "aanya@uni.edu", name: "Aanya Sharma", role: "student", courseCode: "MATH 201", section: "Section A" } });
    expect(bad1).toMatchObject({ line: 3, ok: false, error: "“not-an-email” isn't an email address." });
    expect(bad2).toMatchObject({ ok: false, error: "Role must be student or instructor, not “teacher”." });
    expect(bad3).toMatchObject({ ok: false, error: "A student needs a section." });
    expect(teacher).toMatchObject({ ok: true, row: { role: "instructor", section: "" } });
    expect(bad4).toMatchObject({ line: 7, ok: false, error: "Expected 5 columns, found 4." });
  });

  it("flags a repeated person and course, and one person with two roles", () => {
    const res = parseRoster(
      [HEADER, "a@uni.edu,A,student,MATH 201,A", "A@uni.edu,A,student,math 201,B", "a@uni.edu,A,instructor,PHYS 101,"].join("\n"),
    );
    if (!res.ok) throw new Error(res.error);
    expect(res.rows[0].ok).toBe(true);
    expect(res.rows[1]).toMatchObject({ ok: false, error: "a@uni.edu is already listed for math 201 above." });
    expect(res.rows[2]).toMatchObject({ ok: false, error: "a@uni.edu is listed as a student above; one person has one role." });
  });

  it("refuses admins in a file", () => {
    const res = parseRoster(`${HEADER}\nboss@uni.edu,Boss,admin,MATH 201,`);
    if (!res.ok) throw new Error(res.error);
    expect(res.rows[0].ok).toBe(false);
  });
});
