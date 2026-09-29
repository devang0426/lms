"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { deleteAnnouncement } from "@/app/(instructor)/instructor/announcement-actions";
import { useAction } from "@/components/course-builder/use-action";
import { Button, Dialog, DialogClose, DialogContent, DialogTrigger, Icon } from "@/components/ui";

/* Staff: take an announcement down (Messages). Its notifications stay in
   students' bells and open the course page. */
export function DeleteAnnouncementButton({ id, title }: { id: string; title: string }) {
  const [open, setOpen] = useState(false);
  const { pending, run } = useAction();
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button variant="icon" size="xs" aria-label={`Delete “${title}”`}>
          <Icon icon={Trash2} size={15} />
        </Button>
      </DialogTrigger>
      <DialogContent title="Delete this announcement?" description="Students won't see it on the course page any more.">
        <div className="flex justify-end gap-2.5">
          <DialogClose asChild>
            <Button variant="quiet" size="sm" disabled={pending}>
              Keep it
            </Button>
          </DialogClose>
          <Button size="sm" loading={pending} onClick={() => run(() => deleteAnnouncement({ id }), () => setOpen(false))}>
            Delete
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
