import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { Icon } from "./icon";

/* Sidebar nav item (44px). Active = Paper + hairline shadow + Terracotta
   icon. The shell decides `active` (components/shell/sidebar-nav.tsx). */
export function NavItem({
  href,
  icon,
  active = false,
  onClick,
  children,
  className,
}: {
  href: string;
  icon: LucideIcon;
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-11 items-center gap-3 rounded-xl px-3.5 text-[15px] no-underline transition-colors",
        active
          ? "bg-paper font-medium text-ink shadow-hairline hover:text-ink"
          : "text-ink-soft hover:bg-paper/60 hover:text-ink",
        className,
      )}
    >
      <Icon icon={icon} className={active ? "text-terracotta" : undefined} />
      {children}
    </Link>
  );
}

const tabItem = (active?: boolean) =>
  cn(
    "flex flex-col items-center justify-center gap-1 text-[11px] no-underline",
    active ? "font-medium text-terracotta hover:text-terracotta" : "text-ink-soft hover:text-ink",
  );

/* Mobile bottom tab bar (84px incl. home-indicator padding). `extra` is a
   last tab that isn't a page, e.g. the student "More" (a TabBarButton). */
export function TabBar({
  items,
  extra,
  className,
}: {
  items: { href: string; label: string; icon: LucideIcon; active?: boolean }[];
  extra?: ReactNode;
  className?: string;
}) {
  return (
    <nav
      aria-label="Tabs"
      className={cn(
        "grid h-[84px] shrink-0 border-t border-line bg-paper px-3 pt-2 pb-6",
        className,
      )}
      style={{ gridTemplateColumns: `repeat(${items.length + (extra ? 1 : 0)}, minmax(0, 1fr))` }}
    >
      {items.map((it) => (
        <Link key={it.href} href={it.href} aria-current={it.active ? "page" : undefined} className={tabItem(it.active)}>
          <Icon icon={it.icon} size={22} />
          {it.label}
        </Link>
      ))}
      {extra}
    </nav>
  );
}

/* A tab that opens something instead of going to a page. `active` when the
   current page is one it leads to. */
export function TabBarButton({
  icon,
  label,
  active,
  className,
  ...props
}: Omit<ComponentProps<"button">, "children"> & { icon: LucideIcon; label: string; active?: boolean }) {
  return (
    <button type="button" className={cn(tabItem(active), "cursor-pointer border-0 bg-transparent p-0", className)} {...props}>
      <Icon icon={icon} size={22} />
      {label}
    </button>
  );
}
