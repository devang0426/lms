/* Display formatting shared by student screens. Times are stored in
   seconds (code-standards.md → Video) and only formatted here. */

/* Total length for meta lines: "3h 40m", "52m", "6h". 0 → "". */
export function formatLength(totalSec: number): string {
  const mins = Math.round(totalSec / 60);
  if (mins <= 0) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/* One lesson's length: "14 min". Unknown → "". */
export function formatLessonLength(sec: number | null | undefined): string {
  if (!sec || sec <= 0) return "";
  return `${Math.max(1, Math.round(sec / 60))} min`;
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/* "Good morning / afternoon / evening" for an hour 0–23. */
export function greetingFor(hour: number): "Good morning" | "Good afternoon" | "Good evening" {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 18) return "Good afternoon";
  return "Good evening";
}

/* Completed ÷ published lessons, as a whole percentage. */
export function progressPercent(completed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((completed / total) * 100));
}

export function firstName(name: string): string {
  return name.replace(/^(prof|dr|mr|ms|mrs)\.?\s+/i, "").split(/\s+/)[0] ?? name;
}

/* Video time: 75 → "1:15", 3723 → "1:02:03". */
export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}
