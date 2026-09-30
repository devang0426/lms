"use client";

import { Ellipsis } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Dialog, DialogContent, DialogTrigger, NavItem, TabBar, TabBarButton } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { isActive, NAV, navItems, STUDENT_MORE, studentTabs, type NavArea } from "./nav-config";

/* Sidebar nav with the active item from the URL. With more than one area
   each list gets a mono section title. `staff`: a staff member browsing
   the student pages (their Home is "Teaching home"). */
export function SidebarNav({ areas, staff = false, onNavigate }: { areas: NavArea[]; staff?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const titled = areas.length > 1;

  return (
    <nav aria-label="Main" className="flex flex-col gap-6">
      {areas.map((area) => (
        <div key={area} className="flex flex-col gap-1">
          {titled && (
            <span className="px-3.5 pb-1 font-mono text-[11px] tracking-[0.1em] text-ink-soft uppercase">
              {NAV[area].title}
            </span>
          )}
          {navItems(area, staff).map((item) => (
            <NavItem
              key={item.href}
              href={item.href}
              icon={item.icon}
              active={isActive(pathname, item)}
              onClick={onNavigate}
            >
              {item.label}
            </NavItem>
          ))}
        </div>
      ))}
    </nav>
  );
}

/* Below 768px: Home, My courses, Flashcards and More (feature 28). More
   opens a sheet with every other student page, so each is two taps away. */
export function StudentTabBar({ staff = false, className }: { staff?: boolean; className?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const inMore = STUDENT_MORE.some((l) => isActive(pathname, l));

  return (
    <TabBar
      className={className}
      items={studentTabs(staff).map((t) => ({ ...t, active: isActive(pathname, t) }))}
      extra={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <TabBarButton icon={Ellipsis} label="More" active={inMore} aria-current={inMore ? "page" : undefined} />
          </DialogTrigger>
          <DialogContent
            title="More"
            className="top-auto bottom-0 left-0 w-full max-w-none translate-x-0 translate-y-0 rounded-b-none bg-oat pb-10"
          >
            <nav aria-label="More pages" className="flex flex-col gap-1">
              {STUDENT_MORE.map((item) => (
                <NavItem key={item.href} href={item.href} icon={item.icon} active={isActive(pathname, item)} onClick={() => setOpen(false)}>
                  {item.label}
                </NavItem>
              ))}
            </nav>
          </DialogContent>
        </Dialog>
      }
    />
  );
}

/* Teaching / Admin, at the top of an admin's sidebar (feature 28). Each
   side is its own section with its own nav, so the Teaching mode badge
   isn't shown in Admin. */
export function AreaSwitch({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const admin = pathname === "/admin" || pathname.startsWith("/admin/");
  const option = (label: string, href: string, active: boolean) => (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-9 flex-1 items-center justify-center rounded-full text-small no-underline transition-colors",
        active ? "bg-paper font-medium text-ink shadow-hairline hover:text-ink" : "text-ink-soft hover:text-ink",
      )}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Switch area" className="flex w-full gap-1 rounded-full border border-line bg-oat p-1">
      {option("Teaching", "/instructor", !admin)}
      {option("Admin", "/admin/users", admin)}
    </nav>
  );
}
