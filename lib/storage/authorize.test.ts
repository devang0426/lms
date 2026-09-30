import { describe, expect, it, vi } from "vitest";
import { authorizeUpload, UPLOAD_RATE, uploadRateCheck, uploadRecordKey, waitingForFile, type PrivateDocumentState } from "./authorize";
import { blobPaths, isInFolder, safeFileName } from "./upload-kinds";

const admin = { id: "11111111-1111-4111-8111-111111111111", role: "admin" as const };
const student = { id: "22222222-2222-4222-8222-222222222222", role: "student" as const };
const instructor = { id: "33333333-3333-4333-8333-333333333333", role: "instructor" as const };
const lessonId = "44444444-4444-4444-8444-444444444444";

const assignmentId = "66666666-6666-4666-8666-666666666666";
const studentDocumentId = "77777777-7777-4777-8777-777777777777";
const readyDocumentId = "88888888-8888-4888-8888-888888888888";
/* The student's notes: one waiting for its file, one already ready. */
const studentDocs: Record<string, PrivateDocumentState> = {
  [studentDocumentId]: { status: "uploading", hasFile: false },
  [readyDocumentId]: { status: "ready", hasFile: true },
};
const deps = {
  isLessonStaff: vi.fn(async (_id: string, v: { id: string }) => v.id === instructor.id),
  canSubmitTo: vi.fn(async (id: string, v: { id: string }) => id === assignmentId && v.id === student.id),
  privateDocument: vi.fn(async (id: string, v: { id: string }) => (v.id === student.id ? (studentDocs[id] ?? null) : null)),
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

  // Feature 24 (S5): no more files for a note that already has one.
  it("refuses a token for the owner's note that already has its file", async () => {
    const ready = JSON.stringify({ kind: "private-document", documentId: readyDocumentId });
    expect(
      await authorizeUpload({ viewer: student, pathname: blobPaths.private(student.id, "again.pdf"), clientPayload: ready }, deps),
    ).toEqual({ ok: false, reason: "This note already has its file. Start a new note to upload another." });
  });

  it("still lets the confirm step re-check a file that's already attached", async () => {
    const ready = JSON.stringify({ kind: "private-document", documentId: readyDocumentId });
    const pathname = `private/${student.id}/notes-AbC123xyz.pdf`;
    expect(await authorizeUpload({ viewer: student, pathname, clientPayload: ready, stage: "confirm" }, deps)).toMatchObject({ ok: true });
    // Still only the owner.
    expect(await authorizeUpload({ viewer: admin, pathname, clientPayload: ready, stage: "confirm" }, deps)).toMatchObject({ ok: false });
  });

  it("waits for a file only while uploading with none attached", () => {
    expect(waitingForFile({ status: "uploading", hasFile: false })).toBe(true);
    expect(waitingForFile({ status: "uploading", hasFile: true })).toBe(false);
    for (const status of ["processing", "ready", "failed"] as const) expect(waitingForFile({ status, hasFile: false })).toBe(false);
  });
});

describe("upload records (feature 24)", () => {
  const privatePayload = { kind: "private-document" as const, documentId: studentDocumentId };

  it("counts every file: one record per path, even for the same note", () => {
    const a = uploadRecordKey(privatePayload, `private/${student.id}/notes-AAA.pdf`);
    const b = uploadRecordKey(privatePayload, `private/${student.id}/notes-BBB.pdf`);
    expect(a.entityId).toBe(studentDocumentId);
    expect(b.entityId).toBe(studentDocumentId);
    expect(a.file).not.toBe(b.file);
    // The same file recorded twice (Blob's callback, then the confirm) is one record.
    expect(uploadRecordKey(privatePayload, `private/${student.id}/notes-AAA.pdf`)).toEqual(a);
  });

  it("keeps the file name out of a private upload's record", () => {
    const key = uploadRecordKey(privatePayload, `private/${student.id}/my-secret-diary-AAA.pdf`);
    expect(JSON.stringify(key)).not.toMatch(/diary|private\//);
    expect(key.file).toMatch(/^[a-f0-9]{32}$/);
    // Other kinds are logged by their path, as before.
    expect(uploadRecordKey({ kind: "dev-test" }, "dev/u/x.txt")).toEqual({ entityId: "dev/u/x.txt", file: null });
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
