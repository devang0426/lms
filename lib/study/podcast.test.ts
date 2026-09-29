import { describe, expect, it } from "vitest";
import { concatList } from "@/lib/ai/audio/concat";
import { podcastState, type PodcastRowState } from "./podcast";

const source = { hash: "h2", promptsVersion: 2 };
const ready: PodcastRowState = { status: "ready", audioUrl: "https://blob/a.mp3", sourceHash: "h2", promptsVersion: 2 };

describe("podcastState", () => {
  it("lets staff or the first student start one when none exists", () => {
    expect(podcastState(null, source, "student")).toMatchObject({ phase: "none", canGenerate: true, hasAudio: false });
    expect(podcastState(null, source, "staff").canGenerate).toBe(true);
  });

  it("needs published notes", () => {
    expect(podcastState(null, null, "staff").canGenerate).toBe(false);
  });

  it("never remakes an up-to-date podcast, for anyone", () => {
    expect(podcastState(ready, source, "student")).toMatchObject({ phase: "ready", stale: false, canGenerate: false });
    expect(podcastState(ready, source, "staff").canGenerate).toBe(false);
  });

  it("lets only staff remake one after the notes or prompts change", () => {
    for (const changed of [{ ...source, hash: "h3" }, { ...source, promptsVersion: 3 }]) {
      expect(podcastState(ready, changed, "staff")).toMatchObject({ stale: true, canGenerate: true });
      expect(podcastState(ready, changed, "student")).toMatchObject({ stale: true, canGenerate: false });
    }
  });

  it("blocks a second start while one is being made", () => {
    const generating: PodcastRowState = { status: "generating", audioUrl: null, sourceHash: null, promptsVersion: null };
    expect(podcastState(generating, source, "staff").canGenerate).toBe(false);
    expect(podcastState({ ...ready, status: "generating", sourceHash: "old" }, source, "staff").canGenerate).toBe(false);
  });

  it("lets anyone retry a first attempt that failed", () => {
    const failed: PodcastRowState = { status: "failed", audioUrl: null, sourceHash: null, promptsVersion: null };
    expect(podcastState(failed, source, "student")).toMatchObject({ phase: "failed", canGenerate: true });
  });

  it("keeps a failed remake's old audio, and only staff can try again", () => {
    const failedRemake: PodcastRowState = { ...ready, status: "failed", sourceHash: "h1" };
    expect(podcastState(failedRemake, source, "student")).toMatchObject({ hasAudio: true, stale: true, canGenerate: false });
    expect(podcastState(failedRemake, source, "staff").canGenerate).toBe(true);
  });

  it("gives a private note's owner staff's say over their own podcast (feature 19)", () => {
    expect(podcastState(null, source, "owner").canGenerate).toBe(true);
    expect(podcastState(ready, source, "owner").canGenerate).toBe(false);
    expect(podcastState(ready, { ...source, hash: "h3" }, "owner")).toMatchObject({ stale: true, canGenerate: true });
  });
});

describe("concatList", () => {
  it("lists the files with a gap between them", () => {
    expect(concatList(["a.mp3", "b.mp3", "c.mp3"], "gap.mp3")).toBe(
      "file 'a.mp3'\nfile 'gap.mp3'\nfile 'b.mp3'\nfile 'gap.mp3'\nfile 'c.mp3'\n",
    );
    expect(concatList(["a.mp3"])).toBe("file 'a.mp3'\n");
  });

  it("escapes quotes the way the concat demuxer reads them", () => {
    expect(concatList(["it's.mp3"])).toBe("file 'it'\\''s.mp3'\n");
  });
});
