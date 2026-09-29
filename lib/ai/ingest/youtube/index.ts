import "server-only";

import type { IngestResult } from "../index";

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

function parse(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    /* Allow bare "youtube.com/..." (no scheme). */
    try {
      return new URL(`https://${url}`);
    } catch {
      return null;
    }
  }
}

/* Extract the 11-char video id from watch?v=, youtu.be/, /embed/, /shorts/
   (and /live/) forms. Pure — no network. */
export function youtubeId(url: string): string | null {
  const u = parse(url);
  if (!u) return null;

  const host = u.hostname.toLowerCase().replace(/^(www\.|m\.)/, "");

  if (host === "youtu.be") {
    const id = u.pathname.slice(1).split("/")[0] ?? "";
    return ID_RE.test(id) ? id : null;
  }

  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (u.pathname === "/watch") {
      const id = u.searchParams.get("v");
      return id && ID_RE.test(id) ? id : null;
    }
    const match = u.pathname.match(/^\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})/);
    return match ? match[1] : null;
  }

  return null;
}

export function isYoutube(url: string): boolean {
  return youtubeId(url) !== null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function parseTimedText(xml: string): string | null {
  const matches = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)];
  if (matches.length === 0) return null;
  const lines = matches
    .map((m) => decodeEntities(m[1] ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return lines.length ? lines.join(" ") : null;
}

async function fetchTranscript(id: string): Promise<string | null> {
  for (const lang of ["en", "en-US", "en-GB"]) {
    const res = await fetch(
      `https://www.youtube.com/api/timedtext?lang=${lang}&v=${id}`,
    );
    if (!res.ok) continue;
    const xml = await res.text();
    const text = xml.trim() ? parseTimedText(xml) : null;
    if (text) return text;
  }
  return null;
}

async function fetchTitle(id: string): Promise<string | undefined> {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${id}`);
    if (!res.ok) return undefined;
    const html = await res.text();
    const match = html.match(/<title>([^<]*)<\/title>/);
    if (!match) return undefined;
    return decodeEntities(match[1] ?? "").replace(/\s*-\s*YouTube\s*$/, "").trim() || undefined;
  } catch {
    return undefined;
  }
}

/* YouTube ingestion — best effort. Tries the public timed-text captions; the
   reliable path (yt-dlp captions → audio → Whisper, see ./ytdlp.mjs) runs in a
   Trigger.dev task in feature 18. YouTube often blocks cloud IPs, so failure
   ends in an honest, actionable message. */
export async function ingestYoutube(url: string): Promise<IngestResult> {
  const id = youtubeId(url);
  if (!id) {
    throw new Error(`"${url}" doesn't look like a YouTube URL.`);
  }

  if (typeof fetch === "undefined") {
    throw new Error("Network access is unavailable in this environment.");
  }

  let transcript: string | null = null;
  try {
    transcript = await fetchTranscript(id);
  } catch {
    transcript = null;
  }

  if (transcript) {
    const title = await fetchTitle(id);
    return { text: transcript, title, meta: { url, videoId: id } };
  }

  throw new Error(
    "YouTube didn't return captions for this video (it often blocks servers). " +
      "Upload the video or audio file instead.",
  );
}

/* ---- Feature 18: yt-dlp in a task -------------------------------------------
   YouTube often blocks cloud servers ("Sign in to confirm you're not a
   bot", 403, 429). Whatever went wrong, the instructor gets a message
   that says what to do, never yt-dlp's output. */

export const YOUTUBE_BLOCKED = "YouTube blocked this server — upload the video file instead.";

const BLOCK_SIGNS = [
  /not a bot/i,
  /sign in to confirm/i,
  /HTTP Error 429/i,
  /HTTP Error 403/i,
  /too many requests/i,
  /blocked/i,
  /captcha/i,
  /po[ _-]?token/i,
];

export function youtubeFailureMessage(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  if (BLOCK_SIGNS.some((re) => re.test(text))) return YOUTUBE_BLOCKED;
  if (/unavailable|private video|removed|members-only|age-restricted|confirm your age/i.test(text)) {
    return "YouTube won't share this video (it's private, removed or age-restricted) — upload the video file instead.";
  }
  return `${YOUTUBE_BLOCKED.replace(" — ", " (or couldn't read it) — ")}`;
}

/* The one form of the link passed to yt-dlp: rebuilt from the video id,
   so nothing else from the typed URL reaches its command line. */
export function canonicalYoutubeUrl(url: string): string | null {
  const id = youtubeId(url);
  return id ? `https://www.youtube.com/watch?v=${id}` : null;
}
