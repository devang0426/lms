"use client";

import { ToggleGroup } from "radix-ui";
import { cn } from "@/lib/utils/cn";

/* Single-select filter chips with client state (keyboard: arrows move,
   Space selects). For URL filters prefer <Chip asChild><Link/></Chip>. */
export function ChipGroup({
  options,
  value,
  onValueChange,
  label,
  className,
}: {
  options: { value: string; label: string }[];
  value: string;
  onValueChange: (value: string) => void;
  label: string;
  className?: string;
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onValueChange(v)}
      aria-label={label}
      className={cn("flex flex-wrap gap-2", className)}
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          className={cn(
            "inline-flex h-[38px] cursor-pointer items-center rounded-full px-4 text-small whitespace-nowrap transition-colors",
            "data-[state=on]:bg-ink data-[state=on]:text-cream",
            "data-[state=off]:border data-[state=off]:border-line data-[state=off]:text-ink data-[state=off]:hover:bg-oat",
          )}
        >
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
