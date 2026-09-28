"use client";

import { Upload } from "lucide-react";
import { useRef } from "react";
import { Button, Icon, ProgressBar } from "@/components/ui";
import { useBlobUpload } from "@/components/uploads/use-blob-upload";
import { blobPaths } from "@/lib/storage/upload-kinds";

/* Admin test upload: a small text, image or PDF file into dev/{userId}/. */
export function UploadTester({ userId }: { userId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const { state, start } = useBlobUpload();

  return (
    <div className="flex flex-col gap-4">
      <input
        ref={input}
        type="file"
        accept="text/plain,image/png,image/jpeg,application/pdf"
        className="sr-only"
        aria-label="Choose a test file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void start(file, blobPaths.devTest(userId, file.name), { kind: "dev-test" });
          e.target.value = "";
        }}
      />
      <div>
        <Button
          variant="secondary"
          leading={<Icon icon={Upload} />}
          loading={state.phase === "uploading"}
          onClick={() => input.current?.click()}
        >
          Choose a file
        </Button>
      </div>
      {state.phase === "uploading" && <ProgressBar value={state.percent} label="Upload progress" />}
      {state.phase === "done" && (
        <p className="m-0 text-small" role="status">
          Uploaded <code className="font-mono text-meta">{state.pathname}</code> ({Math.ceil(state.size / 1024)} KB).{" "}
          <a href={state.url} target="_blank" rel="noreferrer">
            Open it
          </a>
        </p>
      )}
      {state.phase === "error" && (
        <p role="alert" className="m-0 rounded-xl bg-clay px-3 py-2 text-small text-clay-ink">
          {state.message}
        </p>
      )}
    </div>
  );
}
