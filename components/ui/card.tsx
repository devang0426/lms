import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/* Flat = Paper + hairline border (default). Raised = warm shadow, for menus
   and floating panels. Sunken = Oat panel (callouts, "You'll be able to"). */
const variants = {
  flat: "border border-line bg-paper",
  raised: "bg-paper shadow-raised",
  sunken: "bg-oat",
  attention: "bg-butter-tint",
} as const;

export function Card({
  variant = "flat",
  padded = true,
  className,
  ...props
}: ComponentProps<"div"> & { variant?: keyof typeof variants; padded?: boolean }) {
  return (
    <div
      className={cn("flex flex-col rounded-card", variants[variant], padded && "p-6", className)}
      {...props}
    />
  );
}

/* Section header inside a card: 18px/600 title with a link-style action. */
export function CardHeader({
  title,
  action,
  className,
}: {
  title: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-4", className)}>
      <h2 className="m-0 text-h3 font-semibold">{title}</h2>
      {action && <span className="text-small">{action}</span>}
    </div>
  );
}
