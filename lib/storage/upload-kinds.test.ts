import { describe, expect, it } from "vitest";
import { isDemoLectureUrl } from "./upload-kinds";

describe("isDemoLectureUrl", () => {
  it("recognises the seeded demo lecture's files", () => {
    expect(isDemoLectureUrl("https://abc.public.blob.vercel-storage.com/demo/lecture/source-x1Y2.mp4")).toBe(true);
  });

  it("leaves every other file deletable", () => {
    expect(isDemoLectureUrl("https://abc.public.blob.vercel-storage.com/videos/123/source-x1Y2.mp4")).toBe(false);
    expect(isDemoLectureUrl("https://abc.public.blob.vercel-storage.com/videos/demo/lecture/x.mp4")).toBe(false);
    expect(isDemoLectureUrl("not a url")).toBe(false);
  });
});
