/* Decide whether an uploaded file can be served as-is (feature 10). Pure:
   takes ffprobe's JSON and the limits, returns the facts we keep or a
   message a person can act on. We never transcode, so only MP4 with H.264
   video and AAC audio passes. */

export interface ProbeLimits {
  maxDurationSec: number;
  maxSizeBytes: number;
}

/* Env-configurable; defaults: 60 minutes, 2 GB (the upload cap). */
export function probeLimitsFromEnv(env: Record<string, string | undefined> = process.env): ProbeLimits {
  const minutes = Number(env.VIDEO_MAX_MINUTES);
  return {
    maxDurationSec: (Number.isFinite(minutes) && minutes > 0 ? minutes : 60) * 60,
    maxSizeBytes: 2048 * 1024 * 1024,
  };
}

export interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
}

export interface FfprobeOutput {
  streams?: FfprobeStream[];
  format?: {
    format_name?: string;
    duration?: string;
    size?: string;
    tags?: { major_brand?: string };
  };
}

export interface VideoFacts {
  durationSec: number;
  width: number;
  height: number;
  codec: string;
  sizeBytes: number;
}

export type ProbeVerdict = { ok: true; facts: VideoFacts } | { ok: false; message: string };

const EXPORT_HINT = "Please export as MP4 (H.264) — in most editors that's the default 'MP4' preset.";

const CODEC_NAMES: Record<string, string> = {
  hevc: "HEVC (H.265)",
  h265: "HEVC (H.265)",
  vp9: "VP9",
  vp8: "VP8",
  av1: "AV1",
  prores: "ProRes",
  mpeg4: "MPEG-4 Part 2",
};

function minutes(sec: number): string {
  return `${Math.round(sec / 60)} minutes`;
}

export function assessProbe(probe: FfprobeOutput, limits: ProbeLimits): ProbeVerdict {
  const format = probe.format ?? {};
  const formatName = format.format_name ?? "";
  const brand = (format.tags?.major_brand ?? "").trim().toLowerCase();

  // ffprobe reports .mov and .mp4 both as "mov,mp4,…"; the brand tells them apart.
  if (!formatName.includes("mp4") || brand === "qt") {
    const what = brand === "qt" ? "a QuickTime (.mov) file" : "not an MP4 file";
    return { ok: false, message: `This video is ${what}. ${EXPORT_HINT}` };
  }

  const streams = probe.streams ?? [];
  const video = streams.find((s) => s.codec_type === "video");
  const audio = streams.find((s) => s.codec_type === "audio");

  if (!video) return { ok: false, message: `This file has no video track. ${EXPORT_HINT}` };
  const vcodec = (video.codec_name ?? "unknown").toLowerCase();
  if (vcodec !== "h264") {
    const name = CODEC_NAMES[vcodec] ?? vcodec.toUpperCase();
    return { ok: false, message: `This video uses ${name}. ${EXPORT_HINT}` };
  }
  if (!audio) {
    return {
      ok: false,
      message: "This video has no sound track, so it can't be transcribed. Export it again with audio included.",
    };
  }
  const acodec = (audio.codec_name ?? "unknown").toLowerCase();
  if (acodec !== "aac") {
    return { ok: false, message: `The sound in this video uses ${acodec.toUpperCase()}. Please export with AAC audio — the default for MP4 (H.264).` };
  }

  const durationSec = Number(format.duration);
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    return { ok: false, message: "We couldn't read how long this video is. The file may be damaged; try exporting it again." };
  }
  if (durationSec > limits.maxDurationSec) {
    return {
      ok: false,
      message: `This video is ${minutes(durationSec)} long; the limit is ${minutes(limits.maxDurationSec)}. Split it into shorter lessons.`,
    };
  }
  const sizeBytes = Number(format.size ?? 0);
  if (sizeBytes > limits.maxSizeBytes) {
    return { ok: false, message: "This video is over 2 GB. Export it at 720p or a lower bitrate." };
  }

  return {
    ok: true,
    facts: {
      durationSec,
      width: video.width ?? 0,
      height: video.height ?? 0,
      codec: "h264/aac",
      sizeBytes,
    },
  };
}
