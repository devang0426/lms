"use client";

import { X } from "lucide-react";
import { Dialog as RadixDialog, DropdownMenu } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { Toaster as SonnerToaster, toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { Icon } from "./icon";

/* ---- Dialog: Paper, 20px radius, raised, warm backdrop ------------------ */

export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

export function DialogContent({
  title,
  description,
  className,
  children,
  ...props
}: ComponentProps<typeof RadixDialog.Content> & { title: ReactNode; description?: ReactNode }) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 z-40 bg-backdrop backdrop-blur-[2px]" />
      <RadixDialog.Content
        className={cn(
          "fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-[calc(100vw-32px)] max-w-[520px] -translate-x-1/2 -translate-y-1/2 flex-col gap-5 overflow-y-auto rounded-card bg-paper p-6 shadow-raised focus-visible:outline-none",
          className,
        )}
        {...(description ? {} : { "aria-describedby": undefined })}
        {...props}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <RadixDialog.Title className="m-0 font-serif text-[28px] leading-[1.15] font-normal">{title}</RadixDialog.Title>
            {description && (
              <RadixDialog.Description className="m-0 text-small text-ink-soft">{description}</RadixDialog.Description>
            )}
          </div>
          <RadixDialog.Close
            aria-label="Close"
            className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-ink-soft hover:bg-oat hover:text-ink"
          >
            <Icon icon={X} />
          </RadixDialog.Close>
        </div>
        {children}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}

/* ---- Menu (dropdown) ----------------------------------------------------- */

export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;

export function MenuContent({ className, sideOffset = 6, ...props }: ComponentProps<typeof DropdownMenu.Content>) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        sideOffset={sideOffset}
        className={cn("z-50 min-w-[200px] rounded-2xl bg-paper p-1.5 shadow-raised", className)}
        {...props}
      />
    </DropdownMenu.Portal>
  );
}

export function MenuItem({ className, ...props }: ComponentProps<typeof DropdownMenu.Item>) {
  return (
    <DropdownMenu.Item
      className={cn(
        "flex h-10 cursor-pointer items-center gap-2.5 rounded-xl px-3 text-small text-ink outline-none select-none",
        "data-[highlighted]:bg-oat data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function MenuLabel({ className, ...props }: ComponentProps<typeof DropdownMenu.Label>) {
  return (
    <DropdownMenu.Label
      className={cn("px-3 pt-2 pb-1 font-mono text-[11px] tracking-[0.1em] text-ink-soft uppercase", className)}
      {...props}
    />
  );
}

export function MenuSeparator({ className, ...props }: ComponentProps<typeof DropdownMenu.Separator>) {
  return <DropdownMenu.Separator className={cn("my-1.5 h-px bg-line", className)} {...props} />;
}

/* ---- Toast (sonner, token-styled) ---------------------------------------- */

export { toast };

export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex w-[356px] max-w-[calc(100vw-32px)] items-start gap-3 rounded-2xl bg-paper p-4 text-small text-ink shadow-raised font-sans",
          title: "font-medium",
          description: "text-meta text-ink-soft",
          actionButton: "ml-auto h-8 shrink-0 rounded-full bg-terracotta px-3 text-meta font-medium text-paper",
          cancelButton: "h-8 shrink-0 rounded-full bg-oat px-3 text-meta text-ink",
          success: "[&_[data-icon]]:text-sage",
          error: "[&_[data-icon]]:text-terracotta",
          warning: "[&_[data-icon]]:text-butter-ink",
        },
      }}
    />
  );
}
