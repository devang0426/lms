"use client";

import { Bell, CheckCheck } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { markAllRead, markRead } from "@/app/api/notifications/actions";
import { Icon, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui";
import { isInAppPath, timeAgo, type NotificationFeed, type NotificationView } from "@/lib/notifications/view";
import { cn } from "@/lib/utils/cn";

/* The header's notification button (feature 21): a bell with the unread
   count (Butter), opening the newest notifications. Choosing one marks it
   read and opens it. The feed is read from /api/notifications on load, on
   navigation and when the window regains focus (at most every 20 s), and
   every 90 s while the tab is visible, so a layout that stays mounted
   still shows new ones. The shells place a bell for desktop and one for
   phones; only the visible one reads. */

const REFRESH_AFTER_MS = 20_000;
const POLL_MS = 90_000;

export function NotificationBell({ align = "end" }: { align?: "start" | "end" }) {
  const router = useRouter();
  const pathname = usePathname();
  const trigger = useRef<HTMLButtonElement>(null);
  const lastRead = useRef(0);
  const [feed, setFeed] = useState<NotificationFeed | null>(null);

  const load = useCallback((force = false) => {
    if (trigger.current?.offsetParent === null) return; // hidden at this width
    if (!force && Date.now() - lastRead.current < REFRESH_AFTER_MS) return;
    lastRead.current = Date.now();
    fetch("/api/notifications", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<NotificationFeed>) : null))
      .then((next) => {
        if (next) setFeed(next);
      })
      .catch(() => {
        // Offline or signed out: keep what's shown.
      });
  }, []);

  useEffect(() => {
    load();
  }, [pathname, load]);

  useEffect(() => {
    const onFocus = () => load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") load(true);
    }, POLL_MS);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(timer);
    };
  }, [load]);

  const unread = feed?.unread ?? 0;

  function open(n: NotificationView) {
    if (!n.read) {
      setFeed((f) => f && { ...f, unread: Math.max(0, f.unread - 1), items: f.items.map((i) => (i.id === n.id ? { ...i, read: true } : i)) });
      void markRead({ id: n.id });
    }
    if (isInAppPath(n.url)) router.push(n.url);
  }

  function readAll() {
    setFeed((f) => f && { ...f, unread: 0, items: f.items.map((i) => ({ ...i, read: true })) });
    void markAllRead();
  }

  return (
    <Menu onOpenChange={(isOpen) => isOpen && load(true)}>
      <MenuTrigger
        ref={trigger}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        className="relative flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-line bg-paper text-ink hover:bg-oat"
      >
        <Icon icon={Bell} />
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-butter px-1 font-mono text-[11px] leading-none text-ink"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </MenuTrigger>
      <MenuContent align={align} className="w-[360px] max-w-[calc(100vw-32px)]">
        <div className="flex items-center justify-between gap-3 px-3 pt-2 pb-1.5">
          <span className="text-small font-semibold">Notifications</span>
          {unread > 0 && <span className="font-mono text-[11px] tracking-[0.1em] text-ink-soft uppercase">{unread} new</span>}
        </div>
        <MenuSeparator />
        {!feed ? (
          <p className="m-0 px-3 py-6 text-center text-small text-ink-soft">Loading…</p>
        ) : feed.items.length === 0 ? (
          <p className="m-0 px-3 py-6 text-center text-small text-ink-soft">You&rsquo;re all caught up.</p>
        ) : (
          <div className="flex max-h-[60vh] flex-col overflow-y-auto">
            {feed.items.map((n) => (
              <MenuItem key={n.id} onSelect={() => open(n)} className="h-auto items-start gap-3 py-2.5">
                <span aria-hidden className={cn("mt-[7px] size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-terracotta")} />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className={cn("text-small leading-[1.4] break-words", !n.read && "font-medium")}>{n.title}</span>
                  <span className="text-[12px] text-ink-soft">
                    {timeAgo(n.createdAt, feed.now)}
                    {!n.read && <span className="sr-only"> · unread</span>}
                  </span>
                </span>
              </MenuItem>
            ))}
          </div>
        )}
        {unread > 0 && (
          <>
            <MenuSeparator />
            <MenuItem
              onSelect={(e) => {
                e.preventDefault();
                readAll();
              }}
            >
              <Icon icon={CheckCheck} size={16} className="text-ink-soft" />
              Mark all as read
            </MenuItem>
          </>
        )}
      </MenuContent>
    </Menu>
  );
}
