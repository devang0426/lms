import {
  BarChart3,
  BookOpen,
  CalendarDays,
  ClipboardList,
  Compass,
  House,
  LayoutDashboard,
  MessageSquare,
  MessagesSquare,
  NotebookPen,
  ScrollText,
  TrendingUp,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";

/* Nav for every app shell. Kept in a plain module so client components can
   import the icons directly — icon components can't be passed as props
   from a server layout. */

export interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
  /* Match only the exact path (for section roots like "/" or "/instructor"). */
  exact?: boolean;
}

export type NavArea = "student" | "instructor" | "admin";

export const NAV: Record<NavArea, { title: string; items: NavLink[] }> = {
  student: {
    title: "Learning",
    items: [
      { href: "/", label: "Home", icon: House, exact: true },
      { href: "/catalog", label: "Explore", icon: Compass },
      { href: "/courses", label: "My courses", icon: BookOpen },
      { href: "/calendar", label: "Calendar", icon: CalendarDays },
      { href: "/discussions", label: "Discussions", icon: MessagesSquare },
      { href: "/progress", label: "Progress", icon: TrendingUp },
      { href: "/space", label: "My space", icon: NotebookPen },
    ],
  },
  instructor: {
    title: "Teaching",
    items: [
      { href: "/instructor", label: "Overview", icon: LayoutDashboard, exact: true },
      { href: "/instructor/courses", label: "Courses", icon: BookOpen },
      { href: "/instructor/learners", label: "Learners", icon: Users },
      { href: "/instructor/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/instructor/messages", label: "Messages", icon: MessageSquare },
    ],
  },
  admin: {
    title: "Admin",
    items: [
      { href: "/admin/users", label: "Users", icon: Users },
      { href: "/admin/courses", label: "Courses and enrollments", icon: ClipboardList },
      { href: "/admin/terms", label: "Terms", icon: CalendarDays },
      { href: "/admin/audit", label: "Audit log", icon: ScrollText },
    ],
  },
};

/* Student bottom tab bar (below 768px), as in the Mobile home wireframe. */
export const STUDENT_TABS: NavLink[] = [
  { href: "/", label: "Home", icon: House, exact: true },
  { href: "/catalog", label: "Explore", icon: Compass },
  { href: "/courses", label: "Courses", icon: BookOpen },
  { href: "/profile", label: "Profile", icon: UserRound },
];

export function isActive(pathname: string, link: Pick<NavLink, "href" | "exact">): boolean {
  if (link.exact) return pathname === link.href;
  return pathname === link.href || pathname.startsWith(`${link.href}/`);
}
