/* The ffmpeg concat demuxer's list file (feature 17). Pure. Each entry is
   `file '<path>'`; a quote inside a path is closed, escaped and reopened
   (`'\''`), the demuxer's own quoting rule. A gap file between entries
   puts a short pause between speakers. */

export function concatList(files: readonly string[], gap?: string): string {
  const quote = (f: string) => `file '${f.replace(/'/g, "'\\''")}'`;
  const lines: string[] = [];
  files.forEach((f, i) => {
    if (gap && i > 0) lines.push(quote(gap));
    lines.push(quote(f));
  });
  return `${lines.join("\n")}\n`;
}
