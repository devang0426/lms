"use client";

import { Tabs as RadixTabs } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/* Underline tabs (ui-context.md → Navigation). Radix handles roles,
   aria-selected and arrow-key navigation. */

export const Tabs = RadixTabs.Root;

export function TabsList({ className, ...props }: ComponentProps<typeof RadixTabs.List>) {
  return (
    <RadixTabs.List
      className={cn("flex gap-6 overflow-x-auto border-b border-line sm:gap-7", className)}
      {...props}
    />
  );
}

export function TabsTrigger({
  size = "md",
  count,
  className,
  children,
  ...props
}: ComponentProps<typeof RadixTabs.Trigger> & { size?: "sm" | "md"; count?: ReactNode }) {
  return (
    <RadixTabs.Trigger
      className={cn(
        "-mb-px shrink-0 cursor-pointer border-b-2 border-transparent bg-transparent p-0 whitespace-nowrap text-ink-soft transition-colors hover:text-ink",
        "data-[state=active]:border-ink data-[state=active]:font-semibold data-[state=active]:text-ink",
        size === "md" ? "h-12 text-[15px]" : "h-[42px] text-small",
        className,
      )}
      {...props}
    >
      {children}
      {count !== undefined && <span> · {count}</span>}
    </RadixTabs.Trigger>
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof RadixTabs.Content>) {
  return <RadixTabs.Content className={cn("pt-6 focus-visible:outline-none", className)} {...props} />;
}
