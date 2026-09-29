"use client";

import { UserPlus } from "lucide-react";
import { useState } from "react";
import { changeRole, inviteUser, revokeInvitation } from "@/app/(admin)/admin/users/actions";
import { useAction } from "@/components/course-builder/use-action";
import { Button, Dialog, DialogClose, DialogContent, DialogTrigger, Field, Icon, Input, Select, toast } from "@/components/ui";
import type { Role } from "@/lib/db/schema";

/* The admin Users page's controls (feature 22): change a role (with a
   confirm step that says what happens to their courses), invite someone
   by email, and withdraw an invitation. */

const ROLE_LABEL: Record<Role, string> = { student: "Student", instructor: "Instructor", admin: "Admin" };
const A_ROLE: Record<Role, string> = { student: "a student", instructor: "an instructor", admin: "an admin" };

function consequence(from: Role, to: Role): string {
  if (to === "student") return "They'll stop teaching any course they're staff on, and see Studyhall as a student.";
  if (from === "student") return "They'll leave the courses they're enrolled in (kept for the record) and get the teaching area.";
  if (to === "admin") return "They'll be able to manage every course, user and enrollment.";
  return "They'll keep the courses they teach, without the admin screens.";
}

export function RoleSelect({ userId, name, role, self }: { userId: string; name: string; role: Role; self: boolean }) {
  const [next, setNext] = useState<Role | null>(null);
  const { pending, run } = useAction();
  return (
    <>
      <Select
        aria-label={`Role for ${name}`}
        value={role}
        disabled={self || pending}
        title={self ? "You can't change your own role" : undefined}
        onChange={(e) => setNext(e.target.value as Role)}
        className="h-9 w-[140px] rounded-tile px-3 text-small"
      >
        {(["student", "instructor", "admin"] as const).map((r) => (
          <option key={r} value={r}>
            {ROLE_LABEL[r]}
          </option>
        ))}
      </Select>
      <Dialog open={next !== null} onOpenChange={(open) => !open && !pending && setNext(null)}>
        {next && (
          <DialogContent title={`Make ${name} ${A_ROLE[next]}?`} description={consequence(role, next)}>
            <div className="flex justify-end gap-2.5">
              <DialogClose asChild>
                <Button variant="quiet" size="sm" disabled={pending}>
                  Cancel
                </Button>
              </DialogClose>
              <Button
                size="sm"
                loading={pending}
                onClick={() =>
                  run(
                    () => changeRole({ userId, role: next }),
                    () => {
                      toast.success(`${name} is now ${A_ROLE[next]}.`);
                      setNext(null);
                    },
                  )
                }
              >
                Change role
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}

export function InviteUserDialog() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("student");
  const { pending, run } = useAction();

  return (
    <Dialog open={open} onOpenChange={(v) => !pending && setOpen(v)}>
      <DialogTrigger asChild>
        <Button size="md" leading={<Icon icon={UserPlus} size={17} />}>
          Invite
        </Button>
      </DialogTrigger>
      <DialogContent title="Invite someone" description="They get an email with a sign-up link. To invite a class to a course, use Roster import.">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => inviteUser({ email, name, role }),
              (res) => {
                toast.success(res.outcome === "linked" ? `${email} already had a sign-in; they're on the list now.` : `Invitation sent to ${email}.`);
                setOpen(false);
                setEmail("");
                setName("");
              },
            );
          }}
        >
          <Field label="Email" htmlFor="invite-email">
            <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Name" htmlFor="invite-name" hint="Shown in the pending list until they sign up with their own.">
            <Input id="invite-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Role" htmlFor="invite-role">
            <Select id="invite-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="student">Student</option>
              <option value="instructor">Instructor</option>
              <option value="admin">Admin</option>
            </Select>
          </Field>
          <div className="flex justify-end gap-2.5">
            <Button type="button" variant="quiet" size="sm" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={pending} disabled={!email.trim() || !name.trim()}>
              Send invitation
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RevokeInvitationButton({ email }: { email: string }) {
  const { pending, run } = useAction();
  return (
    <Button variant="quiet" size="xs" loading={pending} onClick={() => run(() => revokeInvitation({ email }), () => toast.success(`Invitation to ${email} withdrawn.`))}>
      Withdraw
    </Button>
  );
}
