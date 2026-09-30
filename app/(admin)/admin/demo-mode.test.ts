import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* Feature 24 (S1): while DEMO_MODE=true anyone can be the admin, so the
   admin actions that grant lasting access are refused. Roster "Check file"
   (preview) still works. Clerk, the database and the roster import are
   faked: nothing may reach them. */

const admin = { id: "11111111-1111-4111-8111-111111111111", role: "admin", clerkId: "user_admin" };
const target = "22222222-2222-4222-8222-222222222222";

const calls = vi.hoisted(() => ({ clerk: vi.fn(), db: vi.fn(), plan: vi.fn(), apply: vi.fn() }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => admin, syncUserFromClerk: calls.clerk }));
vi.mock("@/lib/admin/clerk", () => ({
  clerkMessage: () => "",
  clerkUsersByEmail: calls.clerk,
  revokeInvitations: calls.clerk,
  sendInvitations: calls.clerk,
  setClerkRole: calls.clerk,
}));
vi.mock("@/lib/db/client", () => ({ db: { batch: calls.db, select: calls.db, insert: calls.db, update: calls.db, delete: calls.db } }));
vi.mock("@/lib/db/users", () => ({ getUser: calls.db, setRoleStatement: calls.db, usersByEmail: calls.db }));
vi.mock("@/lib/db/invitations", () => ({ pendingForEmail: calls.db, saveInvitationsStatement: calls.db }));
vi.mock("@/lib/roster/import", () => ({ planRoster: calls.plan, applyRoster: calls.apply }));

const { changeRole, inviteUser } = await import("./users/actions");
const { importRoster, previewRoster } = await import("./roster/actions");

describe("admin actions in demo mode", () => {
  beforeEach(() => {
    vi.stubEnv("DEMO_MODE", "true");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    for (const f of Object.values(calls)) f.mockReset();
    calls.plan.mockResolvedValue({ ok: true, plan: { rows: [] } });
  });
  afterEach(() => vi.unstubAllEnvs());

  const refused = { ok: false, error: { code: "conflict", message: "Turned off in demo mode." } };

  it("refuses role changes and invitations before touching Clerk or the database", async () => {
    expect(await changeRole({ userId: target, role: "admin" })).toEqual(refused);
    expect(await inviteUser({ email: "friend@example.com", name: "A Friend", role: "admin" })).toEqual(refused);
    expect(calls.clerk).not.toHaveBeenCalled();
    expect(calls.db).not.toHaveBeenCalled();
  });

  it("refuses roster import, but Check file still works", async () => {
    const csv = "email,name,role,course,section\nx@example.com,X,instructor,MATH 201,";
    expect(await importRoster({ csv })).toEqual(refused);
    expect(calls.apply).not.toHaveBeenCalled();
    expect(await previewRoster({ csv })).toEqual({ ok: true, data: { rows: [] } });
    expect(calls.plan).toHaveBeenCalledOnce();
  });

  it("lets them through with demo mode off", async () => {
    vi.stubEnv("DEMO_MODE", "false");
    calls.apply.mockResolvedValue({ ok: true, plan: { rows: [] } });
    expect(await importRoster({ csv: "email\n" })).toEqual({ ok: true, data: { rows: [] } });
    expect(calls.apply).toHaveBeenCalledWith("email\n", admin, "http://localhost:3000/sign-up");
  });
});
