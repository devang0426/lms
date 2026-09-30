import {
  BarChart3,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Compass,
  FileSpreadsheet,
  GraduationCap,
  House,
  Layers,
  LayoutDashboard,
  MessageSquareText,
  MessagesSquare,
  NotebookPen,
  ScrollText,
  TrendingUp,
  UserRound,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

/* Nav for every app shell. Kept in a plain module so client components can
   import the icons directly — icon components can't be passed as props
   from a server layout. Feature 28: one name per page ("My courses",
   "Explore", "Flashcards", "Questions"), and nothing that leads to a
   placeholder. Learners and Progress came back with feature 31. The
   "As built" table in ui-context.md lists every item. */

export interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
  /* Match only the exact path (for section roots like "/" or "/instructor"). */
  exact?: boolean;
}

export type NavArea = "student" | "instructor" | "admin";

const HOME: NavLink = { href: "/", label: "Home", icon: House, exact: true };
/* Staff can open the student pages (admins all of them, instructors their
   courses' pages), but "/" sends them to the teaching dashboard, so their
   Home says where it goes. */
const TEACHING_HOME: NavLink = { href: "/instructor", label: "Teaching home", icon: LayoutDashboard, exact: true };

const EXPLORE: NavLink = { href: "/catalog", label: "Explore", icon: Compass };
const MY_COURSES: NavLink = { href: "/courses", label: "My courses", icon: BookOpen };
const FLASHCARDS: NavLink = { href: "/study", label: "Flashcards", icon: Layers };
const CALENDAR: NavLink = { href: "/calendar", label: "Calendar", icon: CalendarDays };
const DISCUSSIONS: NavLink = { href: "/discussions", label: "Discussions", icon: MessagesSquare };
const GRADES: NavLink = { href: "/grades", label: "Grades", icon: GraduationCap };
const PROGRESS: NavLink = { href: "/progress", label: "Progress", icon: TrendingUp };
const MY_SPACE: NavLink = { href: "/space", label: "My space", icon: NotebookPen };
const PROFILE: NavLink = { href: "/profile", label: "Profile", icon: UserRound };

export const NAV: Record<NavArea, { title: string; items: NavLink[] }> = {
  student: {
    title: "Learning",
    items: [HOME, EXPLORE, MY_COURSES, FLASHCARDS, CALENDAR, DISCUSSIONS, GRADES, PROGRESS, MY_SPACE],
  },
  instructor: {
    title: "Teaching",
    items: [
      { href: "/instructor", label: "Overview", icon: LayoutDashboard, exact: true },
      { href: "/instructor/courses", label: "Courses", icon: BookOpen },
      { href: "/instructor/learners", label: "Learners", icon: UsersRound },
      { href: "/instructor/grading", label: "Grading", icon: ClipboardCheck },
      { href: "/instructor/analytics", label: "Analytics", icon: BarChart3 },
      // The course Q&A.
      { href: "/instructor/messages", label: "Questions", icon: MessageSquareText },
    ],
  },
  admin: {
    title: "Admin",
    items: [
      { href: "/admin/users", label: "Users", icon: Users },
      { href: "/admin/courses", label: "Courses and enrollments", icon: ClipboardList },
      { href: "/admin/roster", label: "Roster import", icon: FileSpreadsheet },
      { href: "/admin/terms", label: "Terms", icon: CalendarDays },
      { href: "/admin/audit", label: "Audit log", icon: ScrollText },
    ],
  },
};

/* An area's items; a staff member browsing the student pages gets
   "Teaching home" in place of Home. */
export function navItems(area: NavArea, staff = false): NavLink[] {
  const items = NAV[area].items;
  return area === "student" && staff ? items.map((i) => (i === HOME ? TEACHING_HOME : i)) : items;
}

/* Student bottom tab bar below 768px (feature 28): three tabs and More. */
export function studentTabs(staff = false): NavLink[] {
  return [staff ? TEACHING_HOME : HOME, MY_COURSES, FLASHCARDS];
}

/* What the tab bar's More sheet holds: every other student page, so each
   is two taps from anywhere. */
export const STUDENT_MORE: NavLink[] = [EXPLORE, CALENDAR, DISCUSSIONS, GRADES, PROGRESS, MY_SPACE, PROFILE];

/* Where "View as student" goes: it opens the course page of a course the
   person teaches (or lets them pick one). */
export const VIEW_AS_STUDENT_HREF = "/instructor/view-as-student";

export function isActive(pathname: string, link: Pick<NavLink, "href" | "exact">): boolean {
  if (link.exact) return pathname === link.href;
  return pathname === link.href || pathname.startsWith(`${link.href}/`);
}
