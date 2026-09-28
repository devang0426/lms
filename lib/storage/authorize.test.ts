import { describe, expect, it, vi } from "vitest";
import { authorizeUpload } from "./authorize";
import { blobPaths, isInFolder, safeFileName } from "./upload-kinds";

const admin = { id: "11111111-1111-4111-8111-111111111111", role: "admin" as const };
const student = { id: "22222222-2222-4222-8222-222222222222", role: "student" as const };
const instructor = { id: "33333333-3333-4333-8333-333333333333", role: "instructor" as const };
const lessonId = "44444444-4444-4444-8444-444444444444";

const deps = { isLessonStaff: vi.fn(async (_id: string, v: { id: string }) => v.id === instructor.id) };
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
