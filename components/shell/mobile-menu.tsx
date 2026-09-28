"use client";

import { Menu as MenuIcon } from "lucide-react";
import { useState } from "react";
import { Button, Dialog, DialogContent, DialogTrigger, Icon } from "@/components/ui";
import type { NavArea } from "./nav-config";
import { SidebarNav } from "./sidebar-nav";

/* Below 768px the staff sidebar collapses into this menu. Students use the
   bottom tab bar instead. */
export function MobileMenu({ areas }: { areas: NavArea[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="icon" size="sm" aria-label="Open menu">
          <Icon icon={MenuIcon} />
        </Button>
      </DialogTrigger>
      <DialogContent title="Menu" className="bg-oat">
        <SidebarNav areas={areas} onNavigate={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
