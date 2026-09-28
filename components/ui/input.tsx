import { Search } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { Icon } from "./icon";

/* Fields (ui-context.md → Inputs): 48px, 12px radius, Paper, hairline border.
   Focus = 1.5px Terracotta border + 4px Clay ring. There is no red: errors
   use Terracotta. */

const fieldFocus =
  "focus-visible:border-terracotta focus-visible:shadow-[0_0_0_4px_var(--accent-tint)] focus-visible:outline-none";

export function Input({
  className,
  invalid,
  ...props
}: ComponentProps<"input"> & { invalid?: boolean }) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(
        "h-12 w-full rounded-xl border border-line bg-paper px-4 text-[15px] text-ink placeholder:text-ink-soft",
        "disabled:cursor-not-allowed disabled:bg-oat",
        fieldFocus,
        invalid && "border-terracotta",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({
  className,
  invalid,
  ...props
}: ComponentProps<"textarea"> & { invalid?: boolean }) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={cn(
        "min-h-14 w-full resize-none rounded-[14px] border border-line bg-paper px-4 py-3.5 text-[15px] text-ink placeholder:text-ink-soft",
        fieldFocus,
        invalid && "border-terracotta",
        className,
      )}
      {...props}
    />
  );
}

/* Native select styled like Input (keyboard and mobile pickers for free). */
export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-12 w-full cursor-pointer rounded-xl border border-line bg-paper px-4 text-[15px] text-ink",
        "disabled:cursor-not-allowed disabled:bg-oat",
        fieldFocus,
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("text-meta font-medium text-ink", className)} {...props} />;
}

/* Label + control + hint/error. `action` sits right of the label
   (e.g. a "Forgot?" link). Pass the control's id as `htmlFor`. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  action,
  className,
  children,
}: {
  label: ReactNode;
  htmlFor: string;
  hint?: ReactNode;
  error?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={htmlFor}>{label}</Label>
        {action && <span className="text-meta">{action}</span>}
      </div>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="m-0 text-meta text-terracotta">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="m-0 text-meta text-ink-soft">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/* Pill search (header 46px, catalog hero 52px). */
export function SearchField({
  size = "md",
  className,
  "aria-label": ariaLabel = "Search",
  ...props
}: Omit<ComponentProps<"input">, "size"> & { size?: "md" | "lg" }) {
  return (
    <label
      className={cn(
        "flex items-center gap-2.5 rounded-full border border-line bg-paper text-ink-soft",
        "focus-within:border-terracotta focus-within:shadow-[0_0_0_4px_var(--accent-tint)]",
        size === "md" ? "h-[46px] px-4" : "h-[52px] px-[18px]",
        className,
      )}
    >
      <Icon icon={Search} />
      <input
        type="search"
        aria-label={ariaLabel}
        className={cn(
          "min-w-0 grow border-none bg-transparent text-ink outline-none placeholder:text-ink-soft focus-visible:shadow-none focus-visible:outline-none",
          size === "md" ? "text-[15px]" : "text-[16px]",
        )}
        {...props}
      />
    </label>
  );
}
