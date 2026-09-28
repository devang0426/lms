import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { FfprobeOutput } from "@/lib/video/probe";

/* ffmpeg / ffprobe for tasks (feature 10). Deployed tasks get binaries from
   the ffmpeg() build extension, which sets FFMPEG_PATH / FFPROBE_PATH;
   locally `trigger dev` reads them from .env.local (ffmpeg-static and
   ffprobe-static dev dependencies). No shell: arguments are passed as an
   array, so file names and URLs can't inject commands. Inputs may be Blob
   URLs — ffmpeg reads them with HTTP range requests. */

const run = promisify(execFile);
const ffmpegBin = () => process.env.FFMPEG_PATH || "ffmpeg";
const ffprobeBin = () => process.env.FFPROBE_PATH || "ffprobe";

export async function ffmpeg(args: string[], timeoutMs = 30 * 60_000): Promise<void> {
  try {
    await run(ffmpegBin(), ["-hide_banner", "-nostdin", "-y", "-loglevel", "error", ...args], {
      maxBuffer: 16 * 1024 * 1024,
      timeout: timeoutMs,
      windowsHide: true,
    });
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr?.trim().split("\n").slice(-5).join(" | ");
    throw new Error(`ffmpeg failed: ${stderr || (err as Error).message}`);
  }
}

export async function ffprobe(input: string): Promise<FfprobeOutput> {
  try {
    const { stdout } = await run(
      ffprobeBin(),
      ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", input],
      { maxBuffer: 16 * 1024 * 1024, timeout: 5 * 60_000, windowsHide: true },
    );
    return JSON.parse(stdout) as FfprobeOutput;
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr?.trim();
    throw new Error(`ffprobe failed: ${stderr || (err as Error).message}`);
  }
}

export async function durationOf(file: string): Promise<number> {
  const probe = await ffprobe(file);
  const d = Number(probe.format?.duration);
  return Number.isFinite(d) ? d : 0;
}
