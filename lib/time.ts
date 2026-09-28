/* Video time for the UI (feature 11). Times are stored as seconds
   everywhere (code-standards.md → Video) and only formatted here. */

const pad = (n: number) => String(n).padStart(2, "0");

/* 252 → "04:12", 3723 → "1:02:03". Negative or non-finite → "00:00". */
export function formatTime(sec: number): string {
  const s = Number.isFinite(sec) ? Math.max(0, Math.floor(sec)) : 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

const UNITS = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?$/;
const CLOCK = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})$/;

/* A `?t=` deep link: "768", "768.5", "12m48s", "1h2m3s", "48s" or
   "12:48" / "1:02:03". Anything else (empty, negative, junk) → null. */
export function parseT(value: string | null | undefined): number | null {
  const v = value?.trim().toLowerCase();
  if (!v) return null;
  if (/^\d+(\.\d+)?$/.test(v)) return Number(v);

  const clock = CLOCK.exec(v);
  if (clock) {
    const [, h, m, s] = clock;
    if (Number(s) >= 60 || (h !== undefined && Number(m) >= 60)) return null;
    return Number(h ?? 0) * 3600 + Number(m) * 60 + Number(s);
  }

  const units = UNITS.exec(v);
  if (units && (units[1] || units[2] || units[3])) {
    const [, h, m, s] = units;
    return Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0);
  }
  return null;
}
