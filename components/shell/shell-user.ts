import type { MenuUser } from "@/components/auth/user-menu";
import type { Role, User } from "@/lib/db/schema";

const ROLE_LABELS: Record<Role, string> = {
  student: "Student",
  instructor: "Instructor",
  admin: "Admin · Instructor",
};

/* The only user fields the client shell needs — never pass the full row. */
export function toMenuUser(user: User): MenuUser {
  return { name: user.name, roleLabel: ROLE_LABELS[user.role], imageUrl: user.imageUrl };
}
