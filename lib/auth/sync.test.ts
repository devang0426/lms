import { beforeEach, describe, expect, it, vi } from "vitest";

/* Feature 24 (S11): a webhook update never brings a deleted user back.
   Feature 33: nor does it restore an erased user's name or email. The
   database and Clerk are faked: the test looks at what the upsert writes,
   and, like Postgres with its `setWhere`, the fake updates only a row
   that isn't deleted. */

const upsert = vi.hoisted(() => ({
  set: null as Record<string, unknown> | null,
  setWhere: undefined as unknown,
  row: {} as Record<string, unknown>,
}));
const applyPendingInvitations = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@/lib/db/client", () => ({
  db: {
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: ({ set, setWhere }: { set: Record<string, unknown>; setWhere?: unknown }) => {
          upsert.set = set;
          upsert.setWhere = setWhere;
          const updated = upsert.row.deletedAt ? [] : [{ ...upsert.row, ...set }];
          return { returning: async () => updated };
        },
      }),
    }),
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [upsert.row] }) }) }),
  },
}));
vi.mock("@/lib/db/invitations", () => ({ applyPendingInvitations }));
vi.mock("./clerk", () => ({ clerkBackend: () => ({ users: { updateUserMetadata: vi.fn() } }) }));

const { syncUserFromClerk } = await import("./sync");

const clerkUser = {
  id: "user_1",
  firstName: "Aanya",
  lastName: "Sharma",
  username: null,
  imageUrl: "https://img.clerk.com/x",
  primaryEmailAddressId: "e1",
  emailAddresses: [{ id: "e1", emailAddress: "aanya@example.edu" }],
  publicMetadata: { role: "student" },
};

describe("syncUserFromClerk", () => {
  beforeEach(() => {
    upsert.set = null;
    applyPendingInvitations.mockClear();
  });

  it("never clears deletedAt when it updates an existing user", async () => {
    upsert.row = { id: "u1", deletedAt: new Date("2026-09-01") };
    await syncUserFromClerk(clerkUser);
    expect(upsert.set).not.toBeNull();
    expect(upsert.set).not.toHaveProperty("deletedAt");
    expect(upsert.set).toMatchObject({ email: "aanya@example.edu", name: "Aanya Sharma", role: "student" });
  });

  it("doesn't enroll a deleted user from pending invitations", async () => {
    upsert.row = { id: "u1", deletedAt: new Date("2026-09-01") };
    const row = await syncUserFromClerk(clerkUser);
    expect(row.deletedAt).not.toBeNull();
    expect(applyPendingInvitations).not.toHaveBeenCalled();
  });

  it("leaves a deleted, anonymised row as it is", async () => {
    upsert.row = { id: "u1", name: "Deleted user", email: "", deletedAt: new Date("2026-09-01") };
    const row = await syncUserFromClerk(clerkUser);
    expect(upsert.setWhere).toBeDefined();
    expect(row).toMatchObject({ name: "Deleted user", email: "" });
  });

  it("still applies invitations for a live user", async () => {
    upsert.row = { id: "u2", deletedAt: null };
    await syncUserFromClerk(clerkUser);
    expect(applyPendingInvitations).toHaveBeenCalledOnce();
  });
});
