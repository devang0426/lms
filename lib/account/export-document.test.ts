import { describe, expect, it } from "vitest";
import { buildExportDocument, exportFileName, exportLink, type ExportRows } from "./export-document";

const t = (iso: string) => new Date(`2026-09-${iso}Z`);
const now = t("30T12:00:00");

function rows(): ExportRows {
  return {
    profile: { id: "u1", name: "Aanya Sharma", email: "aanya@example.edu", role: "student", createdAt: t("01T09:00:00") },
    enrollments: [{ courseCode: "MATH 201", courseTitle: "Linear Algebra", section: "A", status: "active", enrolledAt: t("02T09:00:00") }],
    watchProgress: [
      { courseCode: "MATH 201", lesson: "Vectors", positionSec: 612.5, watchedRanges: [[0, 612.5]], completedAt: null, updatedAt: t("03T09:00:00") },
    ],
    lessonNotes: [{ courseCode: "MATH 201", lesson: "Vectors", atSec: 90, text: "Span = all combinations", createdAt: t("03T09:05:00") }],
    cardReviews: [
      {
        front: "What is a basis?",
        back: "An independent spanning set",
        courseCode: "MATH 201",
        lesson: "Vectors",
        note: null,
        state: "review",
        due: t("05T00:00:00"),
        stability: 3.2,
        difficulty: 5.1,
        reps: 2,
        lapses: 0,
        lastReview: t("02T10:00:00"),
      },
    ],
    quizAttempts: [
      {
        id: "att1",
        mode: "graded",
        courseCode: "MATH 201",
        lesson: "Vectors",
        note: null,
        gradedQuiz: "Quiz 1",
        startedAt: t("04T10:00:00"),
        submittedAt: t("04T10:10:00"),
        score: 0.5,
      },
      { id: "att2", mode: "practice", courseCode: null, lesson: null, note: "My slides", gradedQuiz: null, startedAt: t("04T11:00:00"), submittedAt: null, score: null },
    ],
    quizAnswers: [
      { attemptId: "att1", question: "2+2?", options: ["3", "4"], answer: "1", correct: true },
      { attemptId: "att1", question: "Is 0 a vector?", options: ["True", "False"], answer: "1", correct: false },
    ],
    submissions: [
      {
        id: "sub1",
        courseCode: "MATH 201",
        assignment: "Problem set 1",
        text: "See attached",
        files: [{ url: "https://x.public.blob.vercel-storage.com/submissions/a/u1/ps1-abc.pdf", pathname: "submissions/a/u1/ps1-abc.pdf", name: "ps1.pdf", contentType: "application/pdf", size: 1234 }],
        submittedAt: t("06T09:00:00"),
        late: false,
        status: "returned",
      },
    ],
    grades: [{ courseCode: "MATH 201", item: "Problem set 1", score: 8, maxScore: 10, feedback: "Good", gradedAt: t("07T09:00:00") }],
    discussions: [{ courseCode: "MATH 201", lesson: "Vectors", title: "Why span?", body: "…", status: "open", createdAt: t("08T09:00:00") }],
    replies: [{ courseCode: "MATH 201", thread: "Why span?", body: "Thanks!", isAnswer: false, createdAt: t("08T10:00:00") }],
    privateNotes: [
      {
        id: "n1",
        title: "My slides",
        blocks: [
          { id: "b1", type: "heading2", text: "Week 1" },
          { id: "b2", type: "paragraph", text: "Vectors add." },
        ],
        createdAt: t("09T09:00:00"),
        updatedAt: t("09T09:30:00"),
      },
    ],
    privateDocuments: [
      { id: "d1", noteId: "n1", kind: "pdf", title: "slides.pdf", filename: "slides.pdf", url: null, hasFile: true, createdAt: t("09T09:00:00") },
      { id: "d2", noteId: null, kind: "url", title: "A page", filename: null, url: "https://example.org/page", hasFile: false, createdAt: t("09T09:00:00") },
    ],
    chatThreads: [{ id: "th1", title: "Span", courseCode: "MATH 201", lesson: null, note: null, createdAt: t("10T09:00:00") }],
    chatTurns: [
      { threadId: "th1", role: "user", content: "What is span?", refused: false, citations: [], createdAt: t("10T09:00:00") },
      { threadId: "th1", role: "assistant", content: "All combinations [S1].", refused: false, citations: [], createdAt: t("10T09:00:05") },
      { threadId: "other", role: "user", content: "stray", refused: false, citations: [], createdAt: t("10T09:00:06") },
    ],
  };
}

describe("buildExportDocument", () => {
  const doc = buildExportDocument(rows(), { appUrl: "https://studyhall.example.edu", now });

  it("lists every category the spec names", () => {
    expect(Object.keys(doc)).toEqual(
      expect.arrayContaining([
        "profile",
        "enrollments",
        "watchProgress",
        "lessonNotes",
        "flashcardReviews",
        "quizAttempts",
        "submissions",
        "grades",
        "discussions",
        "privateNotes",
        "assistantChats",
      ]),
    );
    expect(doc.exportedAt).toBe(now.toISOString());
    expect(doc.profile).toMatchObject({ name: "Aanya Sharma", email: "aanya@example.edu", createdAt: "2026-09-01T09:00:00.000Z" });
  });

  it("puts each attempt's answers under it, without internal ids", () => {
    const [graded, practice] = doc.quizAttempts;
    expect(graded.answers).toHaveLength(2);
    expect(graded.answers[0]).toEqual({ question: "2+2?", options: ["3", "4"], answer: "1", correct: true });
    expect(graded).not.toHaveProperty("id");
    expect(practice.answers).toEqual([]);
    expect(practice.note).toBe("My slides");
  });

  it("links handed-in files through the access-checked route, never the Blob URL", () => {
    const [file] = doc.submissions[0].files;
    expect(file).toEqual({ name: "ps1.pdf", contentType: "application/pdf", size: 1234, link: "https://studyhall.example.edu/submissions/sub1/files/0" });
    expect(JSON.stringify(doc)).not.toContain("blob.vercel-storage.com");
  });

  it("writes private notes as Markdown with their sources", () => {
    const [note] = doc.privateNotes;
    expect(note.markdown).toContain("## Week 1");
    expect(note.markdown).toContain("Vectors add.");
    expect(note.sources).toEqual([
      { title: "slides.pdf", kind: "pdf", filename: "slides.pdf", createdAt: "2026-09-09T09:00:00.000Z", link: "https://studyhall.example.edu/documents/d1" },
    ]);
    // A web page is its own address.
    expect(doc.otherUploads).toEqual([expect.objectContaining({ kind: "url", link: "https://example.org/page" })]);
  });

  it("groups chat turns under their thread", () => {
    expect(doc.assistantChats).toHaveLength(1);
    expect(doc.assistantChats[0].turns.map((turn) => turn.role)).toEqual(["user", "assistant"]);
    expect(doc.assistantChats[0].turns[0]).not.toHaveProperty("threadId");
  });

  it("keeps discussions as threads and replies", () => {
    expect(doc.discussions.threads[0]).toMatchObject({ title: "Why span?", createdAt: "2026-09-08T09:00:00.000Z" });
    expect(doc.discussions.replies[0]).toMatchObject({ thread: "Why span?", body: "Thanks!" });
  });

  it("round-trips as JSON", () => {
    expect(JSON.parse(JSON.stringify(doc)).grades[0]).toMatchObject({ score: 8, maxScore: 10, gradedAt: "2026-09-07T09:00:00.000Z" });
  });
});

describe("exportLink", () => {
  it("is a path when the site's address isn't known", () => {
    expect(exportLink({ appUrl: null, now }, "/documents/d1")).toBe("/documents/d1");
    expect(exportLink({ appUrl: "not a url", now }, "/documents/d1")).toBe("/documents/d1");
  });
});

describe("exportFileName", () => {
  it("carries the date", () => {
    expect(exportFileName(now)).toBe("studyhall-data-2026-09-30.json");
  });
});
