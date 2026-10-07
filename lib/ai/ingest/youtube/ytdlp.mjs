/* Shared yt-dlp extraction — used by BOTH the vite dev/preview plugin
 * (in Studyhall it runs inside a Trigger.dev task — feature 18). YouTube's PoToken/BotGuard gate empties in-browser
 * caption fetches, so the only reliable free path is a local yt-dlp process:
 * captions first, audio fallback for Whisper. yt-dlp is auto-downloaded on
 * first use so a non-technical user installs nothing by hand.
 */

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileP = promisify(execFile);
const RUN_TIMEOUT_MS = 300_000;
const AUDIO_EXTS = new Set(["m4a", "webm", "mp3", "opus", "wav", "mp4", "aac", "ogg"]);

function ytdlpAsset() {
  if (process.platform === "win32") return "yt-dlp.exe";
  if (process.platform === "darwin") return "yt-dlp_macos";
  // The standalone build: plain "yt-dlp" is a zipapp that needs Python,
  // which the Trigger.dev image doesn't have.
  return "yt-dlp_linux";
}

/* Download the official standalone yt-dlp build once into `dir`; return its
   path. The caller passes a persistent, writable dir (a cache dir in dev, the
   app's userData/bin in the packaged app). */
export async function ensureYtdlp(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const bin = path.join(dir, process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");
  if (fs.existsSync(bin)) return bin;
  const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${ytdlpAsset()}`;
  const res = await fetch(url, { headers: { "user-agent": "Studyhall" } });
  if (!res.ok) throw new Error(`Couldn't download yt-dlp (${res.status})`);
  fs.writeFileSync(bin, Buffer.from(await res.arrayBuffer()));
  if (process.platform !== "win32") fs.chmodSync(bin, 0o755);
  return bin;
}

/* Strip WEBVTT headers/timing/markup to plain text, de-duplicating the rolling
   repeated lines auto-subs emit. */
export function vttToText(vtt) {
  const out = [];
  for (const raw of vtt.split("\n")) {
    const line = raw.trim();
    if (
      !line ||
      line === "WEBVTT" ||
      line.includes("-->") ||
      line.startsWith("Kind:") ||
      line.startsWith("Language:")
    ) {
      continue;
    }
    const text = line.replace(/<[^>]*>/g, "").trim();
    if (!text || out[out.length - 1] === text) continue;
    out.push(text);
  }
  return out.join(" ");
}

async function runYtdlp(bin, args) {
  try {
    const { stdout, stderr } = await execFileP(bin, args, {
      timeout: RUN_TIMEOUT_MS,
      maxBuffer: 64 * 1024 * 1024,
    });
    return { ok: true, stdout, stderr };
  } catch (err) {
    return { ok: false, stdout: err.stdout ?? "", stderr: err.stderr ?? err.message ?? "yt-dlp failed" };
  }
}

/* Extract a YouTube URL. Returns { transcript, audioBase64, audioExt, title }
   — the same shape the desktop Rust command returns, so the client handles
   both identically. `binDir` is where yt-dlp is cached/downloaded. */
/* Parse WEBVTT into timed cues {start, end, text} (seconds), de-duplicating
   the rolling repeated lines auto-subs emit. Keeps timestamps so lessons can
   cite "12:48" (architecture invariant: never flatten without the segments). */
export function vttToCues(vtt) {
  const toSec = (t) => {
    const parts = t.trim().replace(",", ".").split(":").map(Number);
    return parts.reduce((acc, v) => acc * 60 + v, 0);
  };
  const cues = [];
  const blocks = vtt.replace(/\r/g, "").split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.split("\n");
    const i = lines.findIndex((l) => l.includes("-->"));
    if (i === -1) continue;
    const [a, b] = lines[i].split("-->");
    const text = lines
      .slice(i + 1)
      .map((l) => l.replace(/<[^>]*>/g, "").trim())
      .filter(Boolean)
      .join(" ")
      .trim();
    if (!text) continue;
    const start = toSec(a);
    const end = toSec(b.trim().split(/\s+/)[0]);
    const prev = cues[cues.length - 1];
    if (prev && prev.text === text) {
      prev.end = end;
      continue;
    }
    cues.push({ start, end, text });
  }
  return cues;
}

/* yt-dlp's `--print title --print duration`: the title line, then the
   length in seconds ("NA" when unknown, e.g. a live stream). */
export function parseInfo(stdout) {
  const [title = "", duration = ""] = stdout.split(/\r?\n/);
  const seconds = Number(duration.trim());
  return { title: title.trim() || null, durationSec: duration.trim() && Number.isFinite(seconds) && seconds > 0 ? seconds : null };
}

/* `opts.audioDir`: move a fallback audio file there and return its path
   (`audioPath`) instead of base64, so a long lecture never sits in memory
   twice (the Trigger.dev task, feature 18).
   `opts.maxDurationSec` (feature 25): a video longer than this is not
   downloaded at all — not even its captions. The result is then
   `{ tooLong: true, durationSec, title }`. `durationSec` is returned when
   yt-dlp knows it. */
export async function extractYoutube(url, binDir, opts = {}) {
  const bin = await ensureYtdlp(binDir);
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), `studyhall-yt-${createHash("sha1").update(url).digest("hex").slice(0, 8)}-`),
  );
  const outTmpl = path.join(dir, "%(id)s.%(ext)s");
  try {
    const infoRun = await runYtdlp(bin, ["--no-warnings", "--print", "title", "--print", "duration", url]);
    const { title, durationSec } = infoRun.ok ? parseInfo(infoRun.stdout) : { title: null, durationSec: null };
    if (opts.maxDurationSec && durationSec && durationSec > opts.maxDurationSec) {
      return { tooLong: true, durationSec, title, transcript: null, cues: null, audioBase64: null, audioExt: null };
    }

    // 1) captions (human + auto)
    await runYtdlp(bin, [
      "--no-warnings", "--skip-download", "--write-auto-sub", "--write-sub",
      "--sub-langs", "en.*", "--sub-format", "vtt", "-o", outTmpl, url,
    ]);
    for (const entry of fs.readdirSync(dir)) {
      if (!entry.endsWith(".vtt")) continue;
      const vtt = fs.readFileSync(path.join(dir, entry), "utf8");
      const text = vttToText(vtt);
      if (text.split(/\s+/).length > 5) {
        return { transcript: text, cues: vttToCues(vtt), audioBase64: null, audioExt: null, title, durationSec };
      }
    }

    // 2) audio fallback (Whisper accepts m4a/webm/mp3/wav/ogg)
    const audioRun = await runYtdlp(bin, ["--no-warnings", "-f", "bestaudio", "-o", outTmpl, url]);
    if (!audioRun.ok) throw new Error(`yt-dlp failed: ${audioRun.stderr.trim().slice(0, 400)}`);
    for (const entry of fs.readdirSync(dir)) {
      const ext = path.extname(entry).slice(1).toLowerCase();
      if (!AUDIO_EXTS.has(ext)) continue;
      if (opts.audioDir) {
        const audioPath = path.join(opts.audioDir, `youtube-audio.${ext}`);
        fs.copyFileSync(path.join(dir, entry), audioPath);
        return { transcript: null, cues: null, audioBase64: null, audioPath, audioExt: ext, title, durationSec };
      }
      const audio = fs.readFileSync(path.join(dir, entry));
      return { transcript: null, cues: null, audioBase64: audio.toString("base64"), audioExt: ext, title, durationSec };
    }
    throw new Error("yt-dlp couldn't get captions or audio for this video.");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
