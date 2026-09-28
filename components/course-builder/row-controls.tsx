"use client";

import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button, Dialog, DialogClose, DialogContent, DialogTrigger, Icon } from "@/components/ui";

const quietIcon = "border-transparent bg-transparent text-ink-soft";

/* Up / down / delete for a module or lesson row. No drag and drop: the
   buttons are keyboard-friendly and enough for the demo. */
export function RowControls({
  label,
  isFirst,
  isLast,
  pending,
  onMove,
  onDelete,
  deleteWarning,
}: {
  label: string;
  isFirst: boolean;
  isLast: boolean;
  pending: boolean;
  onMove: (direction: "up" | "down") => void;
  onDelete: () => void;
  deleteWarning: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span className="flex shrink-0 items-center">
      <Button variant="icon" size="xs" className={quietIcon} aria-label={`Move ${label} up`} disabled={isFirst || pending} onClick={() => onMove("up")}>
        <Icon icon={ArrowUp} size={14} />
      </Button>
      <Button variant="icon" size="xs" className={quietIcon} aria-label={`Move ${label} down`} disabled={isLast || pending} onClick={() => onMove("down")}>
        <Icon icon={ArrowDown} size={14} />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="icon" size="xs" className={quietIcon} aria-label={`Delete ${label}`} disabled={pending}>
            <Icon icon={Trash2} size={14} />
          </Button>
        </DialogTrigger>
        <DialogContent title={`Delete “${label}”?`} description={deleteWarning}>
          <div className="flex justify-end gap-3">
            <DialogClose asChild>
              <Button variant="quiet" size="md">
                Keep it
              </Button>
            </DialogClose>
            <Button
              size="md"
              loading={pending}
              onClick={() => {
                onDelete();
                setOpen(false);
              }}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </span>
  );
}
