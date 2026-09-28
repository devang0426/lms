"use client";

import { usePathname } from "next/navigation";
import { NavItem, TabBar } from "@/components/ui";
import { isActive, NAV, STUDENT_TABS, type NavArea } from "./nav-config";

/* Sidebar nav with the active item from the URL. With more than one area
   (admin sees Teaching + Admin) each list gets a mono section title. */
export function SidebarNav({ areas, onNavigate }: { areas: NavArea[]; onNavigate?: () => void }) {
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
          {NAV[area].items.map((item) => (
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

export function StudentTabBar({ className }: { className?: string }) {
  const pathname = usePathname();
  return (
    <TabBar
      className={className}
      items={STUDENT_TABS.map((t) => ({ ...t, active: isActive(pathname, t) }))}
    />
  );
}
