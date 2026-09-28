"use client";

import { Download, LogOut, Settings } from "lucide-react";
import { useState } from "react";
import {
  Button,
  ChipGroup,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
  Field,
  Icon,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
} from "@/components/ui";

/* Client-state demos for the /dev/ui gallery. */
export function InteractiveDemos() {
  const [subject, setSubject] = useState("all");

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-3">
        <ChipGroup
          label="Subject"
          value={subject}
          onValueChange={setSubject}
          options={[
            { value: "all", label: "All" },
            { value: "design", label: "Design" },
            { value: "dev", label: "Development" },
            { value: "science", label: "Science" },
          ]}
        />
        <span className="text-meta text-ink-soft">Selected: {subject}</span>
      </div>

      <Tabs defaultValue="notes">
        <TabsList>
          <TabsTrigger value="notes" size="sm">Notes</TabsTrigger>
          <TabsTrigger value="resources" size="sm" count={3}>Resources</TabsTrigger>
          <TabsTrigger value="discussion" size="sm">Discussion</TabsTrigger>
          <TabsTrigger value="transcript" size="sm">Transcript</TabsTrigger>
        </TabsList>
        <TabsContent value="notes" className="text-small text-ink-soft">Your notes · saved with a timestamp</TabsContent>
        <TabsContent value="resources" className="text-small text-ink-soft">3 resources</TabsContent>
        <TabsContent value="discussion" className="text-small text-ink-soft">No questions yet.</TabsContent>
        <TabsContent value="transcript" className="text-small text-ink-soft">[04:12] Warm colours advance…</TabsContent>
      </Tabs>

      <div className="flex flex-wrap items-center gap-3">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="secondary">Open dialog</Button>
          </DialogTrigger>
          <DialogContent title="New note" description="Create a note from a file, a link or a recording.">
            <Field label="Link" htmlFor="dlg-url">
              <Input id="dlg-url" placeholder="https://…" />
            </Field>
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="quiet" size="md">Cancel</Button>
              </DialogClose>
              <Button size="md">Create note</Button>
            </div>
          </DialogContent>
        </Dialog>

        <Menu>
          <MenuTrigger asChild>
            <Button variant="quiet">Open menu</Button>
          </MenuTrigger>
          <MenuContent align="start">
            <MenuLabel>Account</MenuLabel>
            <MenuItem><Icon icon={Settings} size={16} /> Settings</MenuItem>
            <MenuItem><Icon icon={Download} size={16} /> Export notes</MenuItem>
            <MenuSeparator />
            <MenuItem><Icon icon={LogOut} size={16} /> Sign out</MenuItem>
          </MenuContent>
        </Menu>

        <Button variant="tertiary" onClick={() => toast.success("Lesson marked complete", { description: "Colour temperature and mood" })}>
          Success toast
        </Button>
        <Button
          variant="tertiary"
          onClick={() =>
            toast("Processing lecture…", {
              description: "Transcribing · 42%",
              action: { label: "View", onClick: () => undefined },
            })
          }
        >
          Job toast
        </Button>
      </div>
    </div>
  );
}
