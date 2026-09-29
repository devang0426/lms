import { describe, expect, it, vi } from "vitest";
import { authorizeUpload, UPLOAD_RATE, uploadRateCheck } from "./authorize";
import { blobPaths, isInFolder, safeFileName } from "./upload-kinds";

const admin = { id: "11111111-1111-4111-8111-111111111111", role: "admin" as const };
const student = { id: "22222222-2222-4222-8222-222222222222", role: "student" as const };
const instructor = { id: "33333333-3333-4333-8333-333333333333", role: "instructor" as const };
const lessonId = "44444444-4444-4444-8444-444444444444";

const assignmentId = "66666666-6666-4666-8666-666666666666";
const studentDocumentId = "77777777-7777-4777-8777-777777777777";
const deps = {
  isLessonStaff: vi.fn(async (_id: string, v: { id: string }) => v.id === instructor.id),
  canSubmitTo: vi.fn(async (id: string, v: { id: string }) => id === assignmentId && v.id === student.id),
  ownsDocument: vi.fn(async (id: string, v: { id: string }) => id === studentDocumentId && v.id === student.id),
};
const devPayload = JSON.stringify({ kind: "dev-test" });
const videoPayload = JSON.stringify({ kind: "lesson-video", lessonId, videoId: "55555555-5555-4555-8555-555555555555" });

describe("authorizeUpload", () => {
  it("lets an admin upload a test file into their own folder", async () => {
    const d = await authorizeUpload(
      { viewer: admin, pathname: blobPaths.devTest(admin.id, "Hello World.txt"), clientPayload: devPayload },
      deps,
    );
    expect(d).toMatchObject({ ok: true, maximumSizeInBytes: 10 * 1024 * 1024 });
    if (d.ok) {
      expect(d.allowedContentTypes).toContain("text/plain");
      expect(JSON.parse(d.tokenPayload)).toMatchObject({ kind: "dev-test", userId: admin.id });
    }
  });

  it("refuses signed-out users and students", async () => {
    const path = blobPaths.devTest(student.id, "x.txt");
    expect(await authorizeUpload({ viewer: null, pathname: path, clientPayload: devPayload }, deps)).toMatchObject({ ok: false });
    expect(await authorizeUpload({ viewer: student, pathname: path, clientPayload: devPayload }, deps)).toMatchObject({
      ok: false,
      reason: "Only admins can use the test uploader.",
    });
  });

  it("refuses a path outside the uploader's folder", async () => {
    for (const pathname of [
      blobPaths.devTest(student.id, "x.txt"), // someone else's folder
      `dev/${admin.id}/../../videos/x.mp4`,
      `dev/${admin.id}/nested/x.txt`,
      `videos/${lessonId}/source.mp4`,
    ]) {
      expect(await authorizeUpload({ viewer: admin, pathname, clientPayload: devPayload }, deps)).toMatchObject({ ok: false });
    }
  });

  it("refuses a malformed payload", async () => {
    for (const clientPayload of [null, "not json", JSON.stringify({ kind: "nope" }), JSON.stringify({ kind: "lesson-video", lessonId: "x" })]) {
      expect(
        await authorizeUpload({ viewer: admin, pathname: blobPaths.devTest(admin.id, "a.txt"), clientPayload }, deps),
      ).toMatchObject({ ok: false, reason: "The upload request was malformed." });
    }
  });

  it("allows lesson videos only for that course's staff, as MP4", async () => {
    const pathname = blobPaths.videoSource(lessonId);
    const ok = await authorizeUpload({ viewer: instructor, pathname, clientPayload: videoPayload }, deps);
    expect(ok).toMatchObject({ ok: true, allowedContentTypes: ["video/mp4"] });
    expect(await authorizeUpload({ viewer: student, pathname, clientPayload: videoPayload }, deps)).toMatchObject({ ok: false });
  });
});

describe("pathnames", () => {
  it("sanitises file names", () => {
    expect(safeFileName("Week 1 Notes.PDF")).toBe("week-1-notes.pdf");
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName("...")).toBe("file");
    expect(safeFileName("Café résumé.txt")).toBe("cafe-resume.txt");
  });

  it("accepts Blob's random suffix but not sub-folders", () => {
    expect(isInFolder("dev/u/hello-AbC123xyz.txt", "dev/u/")).toBe(true);
    expect(isInFolder("dev/u/a/b.txt", "dev/u/")).toBe(false);
    expect(isInFolder("dev/other/b.txt", "dev/u/")).toBe(false);
  });
});

describe("authorizeUpload: lesson documents (feature 18)", () => {
  const docPayload = JSON.stringify({ kind: "lesson-document", lessonId, documentId: "66666666-6666-4666-8666-666666666666" });

  it("lets the course's instructor upload PDFs, Word files and audio into the lesson's docs folder", async () => {
    const d = await authorizeUpload({ viewer: instructor, pathname: blobPaths.doc(lessonId, "Week 2 Slides.pdf"), clientPayload: docPayload }, deps);
    expect(d).toMatchObject({ ok: true, maximumSizeInBytes: 200 * 1024 * 1024 });
    if (d.ok) {
      expect(d.allowedContentTypes).toEqual(expect.arrayContaining(["application/pdf", "audio/mpeg"]));
      expect(d.allowedContentTypes).not.toContain("video/mp4");
    }
  });

  it("refuses students and other folders", async () => {
    expect(
      await authorizeUpload({ viewer: student, pathname: blobPaths.doc(lessonId, "x.pdf"), clientPayload: docPayload }, deps),
    ).toMatchObject({ ok: false, reason: "Only this course's instructors can add documents to its lessons." });
    expect(
      await authorizeUpload({ viewer: instructor, pathname: blobPaths.videoSource(lessonId), clientPayload: docPayload }, deps),
    ).toMatchObject({ ok: false });
  });
});

describe("authorizeUpload for submissions", () => {
  const payload = JSON.stringify({ kind: "submission-file", assignmentId });

  it("lets a student who may hand in upload into their own folder", async () => {
    const d = await authorizeUpload(
      { viewer: student, pathname: blobPaths.submission(assignmentId, student.id, "My Answers.pdf"), clientPayload: payload },
      deps,
    );
    expect(d).toMatchObject({ ok: true, maximumSizeInBytes: 25 * 1024 * 1024 });
    if (d.ok) expect(d.allowedContentTypes).toEqual(expect.arrayContaining(["application/pdf", "image/png", "text/plain"]));
  });

  it("refuses another student's folder, and anyone the assignment isn't open to", async () => {
    // Right assignment, but the path is in the instructor's folder.
    expect(
      await authorizeUpload({ viewer: student, pathname: blobPaths.submission(assignmentId, instructor.id, "a.pdf"), clientPayload: payload }, deps),
    ).toMatchObject({ ok: false });
    // Staff don't hand in; canSubmitTo says no.
    expect(
      await authorizeUpload({ viewer: instructor, pathname: blobPaths.submission(assignmentId, instructor.id, "a.pdf"), clientPayload: payload }, deps),
    ).toMatchObject({ ok: false, reason: "This assignment isn't taking work from you right now." });
  });
});

describe("authorizeUpload: private space (feature 19)", () => {
  const payload = JSON.stringify({ kind: "private-document", documentId: studentDocumentId });

  it("lets the owner upload their own document into their own private folder", async () => {
    const d = await authorizeUpload({ viewer: student, pathname: blobPaths.private(student.id, "My Revision.pdf"), clientPayload: payload }, deps);
    expect(d).toMatchObject({ ok: true, maximumSizeInBytes: 200 * 1024 * 1024 });
    if (d.ok) {
      expect(d.allowedContentTypes).toEqual(expect.arrayContaining(["application/pdf", "audio/mpeg"]));
      expect(JSON.parse(d.tokenPayload)).toMatchObject({ kind: "private-document", userId: student.id });
    }
  });

  it("refuses anyone but the owner, even an admin, and any other folder", async () => {
    // Not the document's owner: an admin with a path in their own folder.
    expect(
      await authorizeUpload({ viewer: admin, pathname: blobPaths.private(admin.id, "x.pdf"), clientPayload: payload }, deps),
    ).toMatchObject({ ok: false, reason: "That upload isn't yours." });
    // The owner, but aiming at someone else's folder or a lesson's.
    for (const pathname of [blobPaths.private(admin.id, "x.pdf"), blobPaths.doc(lessonId, "x.pdf"), `private/${student.id}/a/b.pdf`]) {
      expect(await authorizeUpload({ viewer: student, pathname, clientPayload: payload }, deps)).toMatchObject({ ok: false });
    }
  });
});

describe("upload rate limit (feature 23)", () => {
  it("allows up to the hourly cap, students lower than staff", () => {
    expect(uploadRateCheck("student", UPLOAD_RATE.student - 1)).toEqual({ ok: true });
    expect(uploadRateCheck("student", UPLOAD_RATE.student)).toMatchObject({ ok: false });
    expect(uploadRateCheck("instructor", UPLOAD_RATE.student)).toEqual({ ok: true });
    expect(uploadRateCheck("admin", UPLOAD_RATE.staff)).toMatchObject({ ok: false });
  });
});
