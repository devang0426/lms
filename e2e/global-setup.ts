import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CLIP, FIXTURES, flags, NOTES_PDF } from "./support";

/* Test files, made once into e2e/.cache (git-ignored), so no binaries are
   committed:
   - a one-page PDF of revision notes, for the private space (step 8);
   - with E2E_UPLOAD=1, a 20-second clip cut (no re-encode) from the demo
     lecture in Blob, so the live upload (step 2) has real speech. */
export default async function globalSetup() {
  mkdirSync(FIXTURES, { recursive: true });
  if (!existsSync(NOTES_PDF)) writeFileSync(NOTES_PDF, revisionNotesPdf());

  if (flags.upload && !existsSync(CLIP)) {
    const lecture = JSON.parse(readFileSync(path.join(process.cwd(), "scripts", "demo-assets", "lecture.json"), "utf8")) as {
      video: { blobUrl: string };
    };
    const ffmpeg = process.env.FFMPEG_PATH ?? (await import("ffmpeg-static")).default;
    if (!ffmpeg) throw new Error("ffmpeg not found: set FFMPEG_PATH or install ffmpeg-static.");
    execFileSync(ffmpeg, ["-y", "-ss", "60", "-t", "20", "-i", lecture.video.blobUrl, "-c", "copy", "-movflags", "+faststart", CLIP], { stdio: "ignore" });
  }
}

/* A minimal valid PDF (one page, Helvetica), written by hand. */
function revisionNotesPdf(): Buffer {
  const lines = [
    "Revision notes: linear independence",
    "Vectors are linearly independent when no one of them",
    "is a linear combination of the others.",
    "Test: put them as columns of a matrix and row reduce.",
    "Independent exactly when every column has a pivot.",
    "Example: (1,0,1), (0,1,1) and (1,1,2) are dependent,",
    "because the third is the sum of the first two.",
  ];
  const text = lines.map((l, i) => `BT /F1 ${i === 0 ? 16 : 12} Tf 72 ${720 - i * 24} Td (${l.replace(/[()\\]/g, "\\$&")}) Tj ET`).join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}
