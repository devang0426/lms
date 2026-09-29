import type { NotificationKind } from "@/lib/db/schema";

/* In-app notifications (feature 21). Pure: the shapes the bell reads,
   the titles written for each kind, and the "5 min ago" label. */

export interface NotificationView {
  id: string;
  kind: NotificationKind;
  title: string;
  url: string;
  read: boolean;
  createdAt: number;
}

export interface NotificationFeed {
  unread: number;
  items: NotificationView[];
  /* The server's clock when the feed was read, for the time labels. */
  now: number;
}

/* Only an in-app path is ever followed: no scheme, no //host. */
export function isInAppPath(url: string): boolean {
  return url.startsWith("/") && !url.startsWith("//") && !url.startsWith("/\\");
}

export function clip(text: string, max: number): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

export function gradeNoticeTitle(itemTitle: string, updated: boolean): string {
  return updated ? `Your grade for “${clip(itemTitle, 80)}” was updated` : `Your grade for “${clip(itemTitle, 80)}” is back`;
}

export function replyNoticeTitle(replierName: string, discussionTitle: string): string {
  return `${clip(replierName, 60)} replied to “${clip(discussionTitle, 80)}”`;
}

export function announcementNoticeTitle(courseCode: string, title: string): string {
  return `${courseCode} · ${clip(title, 100)}`;
}

/* "just now", "5 min ago", "3 h ago", "2 d ago", then the date. */
export function timeAgo(at: number, now: number): string {
  const s = Math.max(0, Math.floor((now - at) / 1000));
  if (s < 60) return "just now";
  const min = Math.floor(s / 60);
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} d ago`;
  return new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}
