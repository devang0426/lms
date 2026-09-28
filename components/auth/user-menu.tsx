"use client";

import { SignOutButton } from "@clerk/nextjs";
import { ArrowLeftRight, ChevronsUpDown, LogOut } from "lucide-react";
import {
  Avatar,
  Icon,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  Person,
} from "@/components/ui";

export interface MenuUser {
  name: string;
  roleLabel: string;
  imageUrl: string | null;
}

/* User menu: name, role, "Switch demo account" (DEMO_MODE only) and sign
   out. `block` is the sidebar footer (name + role); `avatar` is the compact
   trigger for top bars. Both sign-out paths return to /sign-in, where the
   demo picker lives. */
export function UserMenu({
  user,
  demoMode,
  variant = "block",
}: {
  user: MenuUser;
  demoMode: boolean;
  variant?: "block" | "avatar";
}) {
  return (
    <Menu>
      <MenuTrigger
        aria-label={`Account menu for ${user.name}`}
        className={
          variant === "block"
            ? "flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl p-2 text-left hover:bg-paper/60"
            : "flex cursor-pointer items-center rounded-full"
        }
      >
        {variant === "block" ? (
          <>
            <Person name={user.name} role={user.roleLabel} src={user.imageUrl} className="min-w-0" />
            <Icon icon={ChevronsUpDown} size={16} className="shrink-0 text-ink-soft" />
          </>
        ) : (
          <Avatar name={user.name} src={user.imageUrl} size={36} />
        )}
      </MenuTrigger>
      <MenuContent side={variant === "block" ? "top" : "bottom"} align={variant === "block" ? "start" : "end"}>
        <div className="flex flex-col px-3 pt-2 pb-1.5">
          <span className="truncate text-small font-medium">{user.name}</span>
          <span className="text-[12px] text-ink-soft">{user.roleLabel}</span>
        </div>
        <MenuSeparator />
        {demoMode && (
          <>
            <MenuLabel>Demo</MenuLabel>
            <SignOutButton redirectUrl="/sign-in">
              <MenuItem>
                <Icon icon={ArrowLeftRight} size={16} className="text-ink-soft" />
                Switch demo account
              </MenuItem>
            </SignOutButton>
            <MenuSeparator />
          </>
        )}
        <SignOutButton redirectUrl="/sign-in">
          <MenuItem>
            <Icon icon={LogOut} size={16} className="text-ink-soft" />
            Sign out
          </MenuItem>
        </SignOutButton>
      </MenuContent>
    </Menu>
  );
}
