import { describe, expect, it } from "vitest";
import { htmlToSections, partsText } from "@/lib/ai/ingest/sections";
import { canonicalYoutubeUrl, YOUTUBE_BLOCKED, youtubeFailureMessage } from "@/lib/ai/ingest/youtube";
import { chunkDocument, DOC_CHUNK_CHARS, windows } from "@/lib/ai/retrieval/chunk-document";
import { citationChipsHtml, citationLabel } from "@/lib/chat/citations";
import { documentKindFor } from "@/lib/storage/upload-kinds";
import { documentHref, documentMeta } from "./view";

describe("htmlToSections", () => {
  it("starts a section at each h1–h3 and keeps the text before the first heading", () => {
    const parts = htmlToSections(`
      <p>Intro line.</p>
      <h2>Eigenvalues</h2><p>An eigenvalue scales.</p><ul><li>first</li><li><p>second</p></li></ul>
      <h3>Examples</h3><p>Take A = 2I.</p><h4>Not a section</h4><p>Still examples.</p>`);
    expect(parts).toEqual([
      { text: "Intro line." },
      { section: "Eigenvalues", text: "An eigenvalue scales.\n- first\n- second" },
      { section: "Examples", text: "Take A = 2I.\nNot a section\nStill examples." },
    ]);
    expect(partsText(parts)).toContain("## Eigenvalues\n\nAn eigenvalue scales.");
  });

  it("drops empty headings' sections and reads bare text", () => {
    expect(htmlToSections("<h2>Empty</h2><h2>Full</h2><p>x</p>")).toEqual([{ section: "Full", text: "x" }]);
    expect(htmlToSections("<div>just text</div>")).toEqual([{ text: "just text" }]);
  });
});

describe("chunkDocument", () => {
  const long = Array.from({ length: 40 }, (_, i) => `Sentence ${i} is about the span of vectors.`).join(" ");

  it("keeps each chunk inside one page, headed by title and page", () => {
    const chunks = chunkDocument("Week 2 slides", [
      { page: 1, text: "Short page one." },
      { page: 7, text: long },
    ]);
    expect(chunks[0]).toEqual({ text: "Week 2 slides · p. 1\n\nShort page one.", page: 1, section: null, startSec: null, endSec: null });
    const seven = chunks.filter((c) => c.page === 7);
    expect(seven.length).toBeGreaterThan(1);
    expect(seven.every((c) => c.text.startsWith("Week 2 slides · p. 7\n\n"))).toBe(true);
  });

  it("names DOCX and web-page sections", () => {
    const [c] = chunkDocument("Reading", [{ section: "Eigenvalues", text: "An eigenvalue scales." }]);
    expect(c).toMatchObject({ section: "Eigenvalues", page: null, text: "Reading · Eigenvalues\n\nAn eigenvalue scales." });
  });

  it("cuts a recording by time like a transcript", () => {
    const parts = Array.from({ length: 20 }, (_, i) => ({ startSec: i * 10, endSec: i * 10 + 9, text: `Line ${i}.` }));
    const chunks = chunkDocument("Office hours", parts);
    expect(chunks[0].startSec).toBe(0);
    expect(chunks.every((c) => c.startSec !== null && c.page === null && c.text.startsWith("Office hours\n\n"))).toBe(true);
  });

  it("windows stay under the size limit, overlap, and cover every sentence", () => {
    const w = windows(long);
    expect(w.every((x) => x.length <= DOC_CHUNK_CHARS)).toBe(true);
    for (let i = 0; i < 40; i++) expect(w.some((x) => x.includes(`Sentence ${i} `))).toBe(true);
    // The second window opens with a sentence the first one ends with.
    const firstOfSecond = w[1].slice(0, w[1].indexOf(".") + 1);
    expect(w[0].endsWith(firstOfSecond) || w[0].includes(`${firstOfSecond} `)).toBe(true);
    expect(w[1].startsWith(w[0].slice(0, 20))).toBe(false);
    expect(windows("")).toEqual([]);
  });
});

describe("document citations", () => {
  it("labels by the document's title and page, section or time", () => {
    expect(citationLabel(2, null, 7, { title: "Week 2 slides" })).toBe("Week 2 slides · p. 7");
    expect(citationLabel(null, null, null, { title: "Reading", section: "Eigenvalues" })).toBe("Reading · Eigenvalues");
    expect(citationLabel(1, 250, null, { title: "Office hours" })).toBe("Office hours · 04:10");
    // Lectures are unchanged.
    expect(citationLabel(3, 768, null)).toBe("Lecture 3 · 12:48");
  });

  it("shows the page in the inline chip", () => {
    const html = citationChipsHtml("See this [S1].", [
      { chunkId: "c", lessonId: "l", startSec: null, page: 7, documentId: "d", section: null, label: "Week 2 slides · p. 7" },
    ]);
    expect(html).toContain(">p. 7</button>");
  });

  it("links to the access-checked route at the page or moment", () => {
    expect(documentHref("abc", { page: 7 })).toBe("/documents/abc#page=7");
    expect(documentHref("abc", { startSec: 768.4 })).toBe("/documents/abc#t=768");
    expect(documentHref("abc")).toBe("/documents/abc");
    expect(documentMeta({ pageCount: 30, durationSec: null, sizeBytes: 2.5 * 1024 * 1024 })).toEqual(["30 pages", "2.5 MB"]);
  });
});

describe("YouTube failures", () => {
  it("turns a bot block into the friendly message, never yt-dlp's output", () => {
    const err = new Error("yt-dlp failed: ERROR: [youtube] abc: Sign in to confirm you're not a bot. Use --cookies-from-browser");
    expect(youtubeFailureMessage(err)).toBe(YOUTUBE_BLOCKED);
    expect(YOUTUBE_BLOCKED).toBe("YouTube blocked this server — upload the video file instead.");
    expect(youtubeFailureMessage(new Error("HTTP Error 429: Too Many Requests"))).toBe(YOUTUBE_BLOCKED);
    expect(youtubeFailureMessage(new Error("ERROR: [youtube] aaaaaaaaaaa: This video is unavailable"))).toMatch(/private, removed/);
    const other = youtubeFailureMessage(new Error("Traceback (most recent call last): KeyError 'formats'"));
    expect(other).not.toContain("Traceback");
    expect(other).toContain("upload the video file instead");
  });

  it("passes only a rebuilt watch URL to yt-dlp", () => {
    expect(canonicalYoutubeUrl("https://youtu.be/dQw4w9WgXcQ?t=42")).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(canonicalYoutubeUrl("https://example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
  });
});

describe("documentKindFor", () => {
  it("maps upload types to document kinds", () => {
    expect(documentKindFor("application/pdf")).toBe("pdf");
    expect(documentKindFor("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe("docx");
    expect(documentKindFor("audio/mpeg")).toBe("audio");
    expect(documentKindFor("video/mp4")).toBeNull();
    expect(documentKindFor("text/html")).toBeNull();
  });
});
