import { Loader2 } from "lucide-react";
import { Slot } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { Icon } from "./icon";

/* Pill buttons (ui-context.md → Buttons). Terracotta `primary` is for the
   ONE action that matters on a screen. */

const variants = {
  primary: "bg-terracotta text-paper hover:bg-terracotta-hover hover:text-paper",
  secondary: "border border-ink bg-transparent text-ink hover:bg-oat hover:text-ink",
  tertiary: "bg-oat text-ink hover:bg-line hover:text-ink",
  quiet: "border border-line bg-paper text-ink hover:bg-oat hover:text-ink",
  success: "bg-sage-tint text-sage-ink hover:brightness-[0.97] hover:text-sage-ink",
  link: "bg-transparent px-3 text-terracotta underline underline-offset-4 hover:text-terracotta-hover",
  icon: "border border-line bg-paper px-0 text-ink hover:bg-oat hover:text-ink",
  /* Filter-bar menu button ("Level: Any"): 10px radius, not a pill. */
  dropdown: "h-[38px] rounded-tile border border-line bg-paper px-3.5 text-small font-normal text-ink hover:bg-oat hover:text-ink",
} as const;

const sizes = {
  xs: "h-8 px-3 text-meta",
  sm: "h-[42px] px-[18px] text-small",
  md: "h-11 px-5 text-[15px]",
  lg: "h-12 px-[22px] text-[15px]",
  xl: "h-[52px] px-7 text-[16px]",
} as const;

const iconSizes = { xs: "w-8", sm: "w-[42px]", md: "w-11", lg: "w-12", xl: "w-[52px]" } as const;

export type ButtonVariant = keyof typeof variants;
export type ButtonSize = keyof typeof sizes;

export interface ButtonProps extends ComponentProps<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /* Render the child element (e.g. a Next <Link>) with button styles. */
  asChild?: boolean;
  loading?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
}

export function Button({
  variant = "primary",
  size = "lg",
  asChild = false,
  loading = false,
  leading,
  trailing,
  className,
  children,
  disabled,
  type,
  ...props
}: ButtonProps) {
  const classes = cn(
    "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap no-underline transition-colors",
    "disabled:cursor-not-allowed disabled:opacity-60 aria-disabled:pointer-events-none aria-disabled:opacity-60",
    sizes[size],
    variants[variant],
    variant === "icon" && iconSizes[size],
    variant === "link" && "h-11",
    className,
  );

  if (asChild) {
    return (
      <Slot.Root className={classes} aria-disabled={disabled || loading || undefined} {...props}>
        {children}
      </Slot.Root>
    );
  }

  return (
    <button
      type={type ?? "button"}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Icon icon={Loader2} className="animate-spin" /> : leading}
      {children}
      {trailing}
    </button>
  );
}
