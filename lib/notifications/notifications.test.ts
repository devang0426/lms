import { describe, expect, it } from "vitest";
import { discussionHref, draftFromQuestion, DISCUSSION_LIMITS } from "@/lib/discussions/view";
import { announcementNoticeTitle, clip, gradeNoticeTitle, isInAppPath, replyNoticeTitle, timeAgo } from "./view";

describe("notification titles", () => {
  it("says what happened", () => {
    expect(gradeNoticeTitle("Problem set 1", false)).toBe("Your grade for “Problem set 1” is back");
    expect(gradeNoticeTitle("Problem set 1", true)).toBe("Your grade for “Problem set 1” was updated");
    expect(replyNoticeTitle("Prof. Meera Rao", "Why a line?")).toBe("Prof. Meera Rao replied to “Why a line?”");
    expect(announcementNoticeTitle("MATH 201", "Office hours move")).toBe("MATH 201 · Office hours move");
  });

  it("clips long text on a word boundary with an ellipsis", () => {
    expect(clip("  a   b  ", 10)).toBe("a b");
    const long = clip("x".repeat(200), 80);
    expect(long).toHaveLength(80);
    expect(long.endsWith("…")).toBe(true);
  });
});

describe("isInAppPath", () => {
  it("follows only paths on this site", () => {
    expect(isInAppPath("/discussions/1")).toBe(true);
    expect(isInAppPath("//evil.example")).toBe(false);
    expect(isInAppPath("/\\evil.example")).toBe(false);
    expect(isInAppPath("https://evil.example")).toBe(false);
  });
});

describe("timeAgo", () => {
  const now = Date.parse("2026-10-01T12:00:00Z");
  it("counts up, then shows the date", () => {
    expect(timeAgo(now - 20_000, now)).toBe("just now");
    expect(timeAgo(now - 5 * 60_000, now)).toBe("5 min ago");
    expect(timeAgo(now - 3 * 3_600_000, now)).toBe("3 h ago");
    expect(timeAgo(now - 2 * 86_400_000, now)).toBe("2 d ago");
    expect(timeAgo(Date.parse("2026-09-12T10:00:00Z"), now)).toBe("12 Sept");
    expect(timeAgo(now + 5_000, now)).toBe("just now");
  });
});

describe("discussions", () => {
  it("opens a thread where the reader's role can", () => {
    expect(discussionHref("d1", "student")).toBe("/discussions/d1");
    expect(discussionHref("d1", "instructor")).toBe("/instructor/messages/d1");
    expect(discussionHref("d1", "admin")).toBe("/instructor/messages/d1");
  });

  it("drafts a thread from a refused question", () => {
    const d = draftFromQuestion("  What's the capital of France?  ");
    expect(d.title).toBe("What's the capital of France?");
    expect(d.body).toBe("What's the capital of France?\n\nThe course assistant couldn't find this in the course material.");
    const long = draftFromQuestion("why ".repeat(100));
    expect(long.title.length).toBe(DISCUSSION_LIMITS.title);
    expect(draftFromQuestion("   ")).toEqual({ title: "", body: "" });
  });
});
