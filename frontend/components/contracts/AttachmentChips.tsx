"use client";

import { FileText, X } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { formatByteSize } from "@/lib/app/attachments-policy";

export type AttachmentChipModel = {
  localId: string;
  displayFilename: string;
  byteSize: number;
  status: "selected" | "uploading" | "uploaded" | "failed";
  progress?: number;
  error?: string | null;
};

export function AttachmentChipList({
  items,
  onRemove,
  onRetry,
  disabled,
}: {
  items: readonly AttachmentChipModel[];
  onRemove: (localId: string) => void;
  onRetry?: (localId: string) => void;
  disabled?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Selected attachments">
      {items.map((item) => (
        <li
          key={item.localId}
          className="flex max-w-full items-start gap-2 rounded-xl border border-line bg-paper px-2.5 py-2 text-sm"
        >
          <FileText size={16} className="mt-0.5 shrink-0 text-ink-faint" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-ink" title={item.displayFilename}>
              {item.displayFilename}
            </p>
            <p className="text-xs text-ink-faint">
              {formatByteSize(item.byteSize)}
              {item.status === "uploading"
                ? ` · Uploading${
                    item.progress != null ? ` ${Math.round(item.progress * 100)}%` : "…"
                  }`
                : item.status === "uploaded"
                  ? " · Ready"
                  : item.status === "failed"
                    ? " · Failed"
                    : ""}
            </p>
            {item.status === "failed" && item.error ? (
              <p className="mt-0.5 text-xs text-danger">{item.error}</p>
            ) : null}
            {item.status === "failed" && onRetry ? (
              <Button
                type="button"
                variant="ghost"
                className="mt-1 h-auto px-0 py-0 text-xs"
                disabled={disabled}
                onClick={() => onRetry(item.localId)}
                aria-label={`Retry upload ${item.displayFilename}`}
              >
                Retry upload
              </Button>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            className="h-7 w-7 shrink-0 p-0"
            disabled={disabled || item.status === "uploading"}
            onClick={() => onRemove(item.localId)}
            aria-label={`Remove ${item.displayFilename}`}
          >
            <X size={14} aria-hidden="true" />
          </Button>
        </li>
      ))}
    </ul>
  );
}

export function MessageAttachmentCards({
  attachments,
}: {
  attachments: readonly {
    id: string;
    displayFilename: string;
    contentType: string;
    byteSize: number;
    downloadPath: string;
  }[];
}) {
  if (!attachments.length) return null;
  return (
    <ul className="mt-2 space-y-1.5" aria-label="Message attachments">
      {attachments.map((file) => (
        <li key={file.id}>
          <a
            href={file.downloadPath}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex max-w-full items-center gap-2 rounded-lg border border-line/80 bg-white/60 px-2.5 py-1.5 text-xs font-medium text-ink underline-offset-2 hover:underline"
          >
            <FileText size={14} className="shrink-0 text-ink-faint" aria-hidden="true" />
            <span className="truncate">{file.displayFilename}</span>
            <span className="shrink-0 text-ink-faint">{formatByteSize(file.byteSize)}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
