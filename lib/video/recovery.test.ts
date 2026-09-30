import { describe, expect, it } from "vitest";
import { PROCESSING_STOPPED, stuckVideoError, videoEditorControls } from "./recovery";

const job = (status: "queued" | "running" | "completed" | "failed" | "canceled", error: string | null = null) => ({ status, error });

describe("stuckVideoError", () => {
  it("fails a processing video whose run failed, keeping the run's message", () => {
    expect(stuckVideoError({ status: "processing" }, job("failed", "Processing stopped while making the poster."))).toBe(
      "Processing stopped while making the poster.",
    );
    expect(stuckVideoError({ status: "processing" }, job("failed"))).toBe(PROCESSING_STOPPED);
  });

  it("fails a processing video whose run was cancelled or expired", () => {
    expect(stuckVideoError({ status: "processing" }, job("canceled"))).toBe(PROCESSING_STOPPED);
    expect(stuckVideoError({ status: "processing" }, job("canceled", "ignored"))).toBe(PROCESSING_STOPPED);
  });

  it("leaves a video alone while its run is queued or running", () => {
    expect(stuckVideoError({ status: "processing" }, job("queued"))).toBeNull();
    expect(stuckVideoError({ status: "processing" }, job("running"))).toBeNull();
  });

  it("leaves a completed run's video alone", () => {
    expect(stuckVideoError({ status: "processing" }, job("completed"))).toBeNull();
  });

  it("only touches processing videos", () => {
    for (const status of ["uploading", "ready", "rejected", "failed"] as const) {
      expect(stuckVideoError({ status }, job("failed"))).toBeNull();
      expect(stuckVideoError({ status }, job("canceled"))).toBeNull();
    }
  });

  it("needs a run to judge by", () => {
    expect(stuckVideoError({ status: "processing" }, null)).toBeNull();
  });
});

describe("videoEditorControls", () => {
  it("offers only the uploader for a lesson with no video", () => {
    expect(videoEditorControls(null, null)).toEqual({ progress: false, retry: false, uploader: true });
  });

  it("shows progress and hides the uploader while a run works on the video", () => {
    expect(videoEditorControls({ status: "processing" }, job("queued"))).toEqual({ progress: true, retry: false, uploader: false });
    expect(videoEditorControls({ status: "processing" }, job("running"))).toEqual({ progress: true, retry: false, uploader: false });
  });

  it("offers Retry and the uploader once the video failed, whatever happened to the run", () => {
    for (const run of [job("failed"), job("canceled"), null]) {
      expect(videoEditorControls({ status: "failed" }, run)).toEqual({ progress: false, retry: true, uploader: true });
    }
  });

  it("keeps the uploader for a processing row that no run is working on", () => {
    expect(videoEditorControls({ status: "processing" }, null).uploader).toBe(true);
    expect(videoEditorControls({ status: "processing" }, job("canceled")).uploader).toBe(true);
  });

  it("shows a ready video's run while it drafts or after drafting stopped, and hides it once done", () => {
    expect(videoEditorControls({ status: "ready" }, job("running"))).toEqual({ progress: true, retry: false, uploader: true });
    expect(videoEditorControls({ status: "ready" }, job("failed"))).toEqual({ progress: true, retry: false, uploader: true });
    expect(videoEditorControls({ status: "ready" }, job("completed"))).toEqual({ progress: false, retry: false, uploader: true });
  });

  it("offers the uploader but no Retry after a rejection", () => {
    expect(videoEditorControls({ status: "rejected" }, job("failed"))).toEqual({ progress: false, retry: false, uploader: true });
  });
});
