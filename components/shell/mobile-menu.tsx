"use client";

import { Eye, Menu as MenuIcon } from "lucide-react";
import { useState } from "react";
import { Button, Dialog, DialogContent, DialogTrigger, Icon, NavItem } from "@/components/ui";
import { VIEW_AS_STUDENT_HREF, type NavArea } from "./nav-config";
import { AreaSwitch, SidebarNav } from "./sidebar-nav";

/* Below 768px the staff sidebar collapses into this menu, with the same
   switch and "View as student" (feature 28). Students use the bottom tab
   bar instead. */
export function MobileMenu({
  areas,
  areaSwitch = false,
  viewAsStudent = false,
}: {
  areas: NavArea[];
  areaSwitch?: boolean;
  viewAsStudent?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="icon" size="sm" aria-label="Open menu">
          <Icon icon={MenuIcon} />
        </Button>
      </DialogTrigger>
      <DialogContent title="Menu" className="bg-oat">
        {areaSwitch && <AreaSwitch onNavigate={close} />}
        <SidebarNav areas={areas} onNavigate={close} />
        {viewAsStudent && (
          <NavItem href={VIEW_AS_STUDENT_HREF} icon={Eye} onClick={close}>
            View as student
          </NavItem>
        )}
      </DialogContent>
    </Dialog>
  );
}
