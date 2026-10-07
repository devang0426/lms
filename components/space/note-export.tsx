"use client";

import { Download, FileDown, FileType, Printer } from "lucide-react";
import { Button, Icon, Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui";
import type { Block } from "@/lib/ai/types";
import { downloadText, exportDocxHtml, exportMarkdown, printPdf } from "@/lib/export";
import { safeFileName } from "@/lib/storage/upload-kinds";

/* Export a private note (feature 19) with lib/export.ts:
   Markdown, Word (.doc: Word-compatible HTML) or the browser's print
   dialog, which also saves a PDF. All of it happens in the browser. */
export function NoteExport({ title, blocks }: { title: string; blocks: Block[] }) {
  const note = { title, blocks };
  const base = safeFileName(title).replace(/[.-]+$/, "") || "note";
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="quiet" size="md" leading={<Icon icon={Download} size={16} />} disabled={blocks.length === 0}>
          Export
        </Button>
      </MenuTrigger>
      <MenuContent align="end">
        <MenuItem onSelect={() => downloadText(`${base}.md`, exportMarkdown(note), "text/markdown")}>
          <Icon icon={FileDown} size={16} className="text-ink-soft" />
          Markdown (.md)
        </MenuItem>
        <MenuItem onSelect={() => downloadText(`${base}.doc`, exportDocxHtml(note), "application/msword")}>
          <Icon icon={FileType} size={16} className="text-ink-soft" />
          Word (.doc)
        </MenuItem>
        <MenuItem onSelect={() => printPdf(note)}>
          <Icon icon={Printer} size={16} className="text-ink-soft" />
          Print or save as PDF
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
