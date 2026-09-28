import { describe, expect, it } from "vitest";
import { moovBeforeMdat } from "./mp4-atoms";
import { assessProbe, probeLimitsFromEnv, type FfprobeOutput } from "./probe";
import { segmentsToVtt, vttTimestamp } from "./vtt";

describe("vtt", () => {
  it("formats timestamps", () => {
    expect(vttTimestamp(0)).toBe("00:00:00.000");
    expect(vttTimestamp(75.5)).toBe("00:01:15.500");
    expect(vttTimestamp(3723.0426)).toBe("01:02:03.043");
  });

  it("writes sorted, numbered cues and escapes markup", () => {
    const vtt = segmentsToVtt([
      { startSec: 5, endSec: 7, text: " second <b>bold</b> & more" },
      { startSec: 0.2, endSec: 4.9, text: "first" },
    ]);
    expect(vtt).toBe(
      "WEBVTT\n\n1\n00:00:00.200 --> 00:00:04.900\nfirst\n\n2\n00:00:05.000 --> 00:00:07.000\nsecond &lt;b&gt;bold&lt;/b&gt; &amp; more\n",
    );
  });

  it("never lets text break a cue", () => {
    const vtt = segmentsToVtt([{ startSec: 1, endSec: 1, text: "a --> b\n\n\nc" }]);
    expect(vtt).toContain("00:00:01.000 --> 00:00:01.500\na → b\nc");
    expect(segmentsToVtt([{ startSec: 1, endSec: 2, text: "   " }])).toBe("WEBVTT\n\n");
  });
});

const limits = probeLimitsFromEnv({});
const good: FfprobeOutput = {
  streams: [
    { codec_type: "video", codec_name: "h264", width: 1280, height: 720 },
    { codec_type: "audio", codec_name: "aac" },
  ],
  format: { format_name: "mov,mp4,m4a,3gp,3g2,mj2", duration: "1200.5", size: "300000000", tags: { major_brand: "isom" } },
};

describe("assessProbe", () => {
  it("accepts H.264/AAC MP4 and keeps its facts", () => {
    expect(assessProbe(good, limits)).toEqual({
      ok: true,
      facts: { durationSec: 1200.5, width: 1280, height: 720, codec: "h264/aac", sizeBytes: 300000000 },
    });
  });

  it("rejects HEVC with the friendly export hint", () => {
    const hevc = { ...good, streams: [{ codec_type: "video", codec_name: "hevc" }, good.streams![1]] };
    expect(assessProbe(hevc, limits)).toEqual({
      ok: false,
      message: "This video uses HEVC (H.265). Please export as MP4 (H.264) — in most editors that's the default 'MP4' preset.",
    });
  });

  it("rejects a QuickTime .mov even though ffprobe calls it mov,mp4", () => {
    const mov = { ...good, format: { ...good.format, tags: { major_brand: "qt  " } } };
    const v = assessProbe(mov, limits);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.message).toMatch(/^This video is a QuickTime \(\.mov\) file\. Please export as MP4/);
  });

  it("rejects other containers, missing audio, non-AAC audio, and over-long videos", () => {
    const cases: FfprobeOutput[] = [
      { ...good, format: { ...good.format, format_name: "matroska,webm" } },
      { ...good, streams: [good.streams![0]] },
      { ...good, streams: [good.streams![0], { codec_type: "audio", codec_name: "opus" }] },
      { ...good, format: { ...good.format, duration: String(61 * 60) } },
    ];
    for (const c of cases) expect(assessProbe(c, limits).ok).toBe(false);
  });

  it("reads the duration limit from VIDEO_MAX_MINUTES", () => {
    expect(probeLimitsFromEnv({ VIDEO_MAX_MINUTES: "90" }).maxDurationSec).toBe(5400);
    expect(probeLimitsFromEnv({ VIDEO_MAX_MINUTES: "nope" }).maxDurationSec).toBe(3600);
  });
});

function box(type: string, size: number): Uint8Array {
  const b = new Uint8Array(16);
  new DataView(b.buffer).setUint32(0, size);
  for (let i = 0; i < 4; i++) b[4 + i] = type.charCodeAt(i);
  return b;
}

function reader(layout: [string, number][]) {
  const offsets: { pos: number; bytes: Uint8Array }[] = [];
  let pos = 0;
  for (const [type, size] of layout) {
    offsets.push({ pos, bytes: box(type, size) });
    pos += size;
  }
  return {
    size: pos,
    read: async (p: number) => offsets.find((o) => o.pos === p)?.bytes ?? new Uint8Array(0),
  };
}

describe("moovBeforeMdat", () => {
  it("finds moov first in a faststart file", async () => {
    const r = reader([["ftyp", 32], ["moov", 5000], ["mdat", 900000]]);
    expect(await moovBeforeMdat(r.read, r.size)).toBe(true);
  });

  it("finds mdat first in a normal camera/export file", async () => {
    const r = reader([["ftyp", 32], ["free", 8], ["mdat", 900000], ["moov", 5000]]);
    expect(await moovBeforeMdat(r.read, r.size)).toBe(false);
  });

  it("returns null on garbage", async () => {
    const r = reader([["ftyp", 4]]);
    expect(await moovBeforeMdat(r.read, 100)).toBe(null);
  });
});
