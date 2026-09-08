"use client";

import { useRef, useState } from "react";
import { Paperclip, X, Loader2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/format";
import { toast } from "sonner";
import { MAX_UPLOAD_BYTES, MAX_ATTACHMENTS_PER_MESSAGE } from "@/lib/constants";

export interface UploadedRef {
  id: string;
  filename: string;
  size: number;
  mimeType: string;
}

export function AttachmentUploader({
  value,
  onChange,
}: {
  value: UploadedRef[];
  onChange: (next: UploadedRef[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    if (value.length + list.length > MAX_ATTACHMENTS_PER_MESSAGE) {
      toast.error(`Up to ${MAX_ATTACHMENTS_PER_MESSAGE} files at a time`);
      return;
    }
    for (const file of list) {
      if (file.size > MAX_UPLOAD_BYTES) {
        toast.error(`${file.name} is too large`);
        continue;
      }
      setUploading((n) => n + 1);
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error?.message ?? `Couldn't upload ${file.name}`);
        } else {
          onChange([...value, data]);
        }
      } catch {
        toast.error(`Couldn't upload ${file.name}`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => inputRef.current?.click()}
        disabled={uploading > 0}
      >
        {uploading > 0 ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Paperclip className="size-4" />
        )}
        Attach files
      </Button>

      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {value.map((f) => (
            <li
              key={f.id}
              className="flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1 text-xs"
            >
              <FileText className="size-3.5 text-muted-foreground" />
              <span className="max-w-[160px] truncate">{f.filename}</span>
              <span className="text-muted-foreground">
                {formatBytes(f.size)}
              </span>
              <button
                type="button"
                onClick={() => onChange(value.filter((x) => x.id !== f.id))}
                aria-label={`Remove ${f.filename}`}
              >
                <X className="size-3.5 text-muted-foreground hover:text-foreground" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
