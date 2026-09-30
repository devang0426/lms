"use client";

import { Trash2, UserPlus } from "lucide-react";
import { useState, useTransition } from "react";
import { changeRole, deleteUser, inviteUser, revokeInvitation } from "@/app/(admin)/admin/users/actions";
import { useAction } from "@/components/course-builder/use-action";
import { Button, Dialog, DialogClose, DialogContent, DialogTrigger, Field, Icon, Input, Select, toast } from "@/components/ui";
import { confirmsDeletion, ERASED_ITEMS, KEPT_ITEMS } from "@/lib/account/rules";
import type { Role } from "@/lib/db/schema";
import { settle } from "@/lib/utils/action-result";

/* The admin Users page's controls (feature 22): change a role (with a
   confirm step that says what happens to their courses), invite someone
   by email, withdraw an invitation, and (feature 33) delete an account. */

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

/* Delete an account (feature 33): says what goes and what stays, and
   takes the person's email, typed. `refusal` (their own account, a demo
   account in demo mode) disables the button and says why. */
export function DeleteUserButton({ userId, name, email, refusal }: { userId: string; name: string; email: string; refusal: string | null }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleting, startDeleting] = useTransition();
  const inputId = `delete-user-${userId}`;

  function onOpenChange(next: boolean) {
    if (deleting) return;
    setOpen(next);
    setTyped("");
    setError(null);
  }

  function remove() {
    setError(null);
    startDeleting(async () => {
      const res = await settle(deleteUser({ userId, confirm: typed }));
      if (!res.ok) return setError(res.error.message);
      toast.success(res.data.queued ? `${name}'s account was deleted.` : `${name}'s account was deleted. Their data will be cleared within a day.`);
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="quiet"
          size="xs"
          disabled={refusal !== null}
          title={refusal ?? undefined}
          aria-label={`Delete ${name}'s account`}
          leading={<Icon icon={Trash2} size={15} />}
        >
          Delete
        </Button>
      </DialogTrigger>
      <DialogContent title={`Delete ${name}'s account?`} description="They're signed out and can't sign in again. This can't be undone.">
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (confirmsDeletion(typed, email)) remove();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <p className="m-0 text-small font-medium">Deleted</p>
              <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-small">
                {ERASED_ITEMS.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col gap-2">
              <p className="m-0 text-small font-medium">Kept</p>
              <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-small">
                {KEPT_ITEMS.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
          <Field label={`Type ${email} to confirm`} htmlFor={inputId}>
            <Input id={inputId} value={typed} autoComplete="off" spellCheck={false} onChange={(e) => setTyped(e.target.value)} />
          </Field>
          {error && (
            <p role="alert" className="m-0 rounded-xl bg-clay px-4 py-3 text-small text-clay-ink">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="quiet" size="md" disabled={deleting}>
                Keep it
              </Button>
            </DialogClose>
            <Button type="submit" variant="secondary" size="md" loading={deleting} disabled={!confirmsDeletion(typed, email)}>
              Delete account
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
