/**
 * Shared attachment policy for Messages + Submit Work.
 * Server enforces the same rules; clients use helpers for UX validation.
 */

export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024; // 10 MiB
export const MESSAGE_ATTACHMENT_MAX = 5;
export const WORK_ATTACHMENT_MAX = 10;
export const ATTACHMENT_FILENAME_MAX = 180;

export type AttachmentContext = "message" | "work_submission";

export type AttachmentAiPolicy = {
  autoReadAttachments: false;
  autoForwardToCopilot: false;
  assistantCanExecuteAttachmentActions: false;
};

/** PRIVATE attachments must never be auto-read or forwarded to Copilot. */
export const ATTACHMENT_AI_POLICY: AttachmentAiPolicy = {
  autoReadAttachments: false,
  autoForwardToCopilot: false,
  assistantCanExecuteAttachmentActions: false,
};

const EXT_TO_MIMES: Record<string, readonly string[]> = {
  pdf: ["application/pdf"],
  png: ["image/png"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  webp: ["image/webp"],
  txt: ["text/plain", "text/plain; charset=utf-8"],
  csv: ["text/csv", "application/csv", "text/plain"],
  zip: ["application/zip", "application/x-zip-compressed"],
  doc: ["application/msword"],
  docx: [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  xls: ["application/vnd.ms-excel"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ppt: ["application/vnd.ms-powerpoint"],
  pptx: [
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ],
};

const ALLOWED_EXTENSIONS = new Set(Object.keys(EXT_TO_MIMES));

const DANGEROUS_EXTENSIONS = new Set([
  "exe",
  "bat",
  "cmd",
  "com",
  "msi",
  "scr",
  "dll",
  "js",
  "mjs",
  "cjs",
  "jsx",
  "ts",
  "tsx",
  "html",
  "htm",
  "shtml",
  "svg",
  "xml",
  "xhtml",
  "php",
  "phtml",
  "asp",
  "aspx",
  "jsp",
  "sh",
  "bash",
  "zsh",
  "ps1",
  "vbs",
  "wsf",
  "jar",
  "apk",
  "dmg",
  "pkg",
  "iso",
  "wasm",
]);

const DANGEROUS_MIMES = new Set([
  "text/html",
  "application/xhtml+xml",
  "application/javascript",
  "text/javascript",
  "application/x-javascript",
  "image/svg+xml",
  "application/x-msdownload",
  "application/x-msdos-program",
  "application/x-sh",
  "application/x-bat",
]);

export function extensionOf(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}

/** Sanitize for display / storage metadata — never use as a trusted path segment alone. */
export function sanitizeDisplayFilename(raw: string): string | null {
  if (typeof raw !== "string") return null;
  let name = raw.replace(/\0/g, "").trim();
  name = name.replace(/[/\\]/g, "_");
  name = name.replace(/[\u0000-\u001f\u007f]/g, "");
  name = name.replace(/\s+/g, " ");
  if (!name || name === "." || name === "..") return null;
  if (name.length > ATTACHMENT_FILENAME_MAX) {
    name = name.slice(0, ATTACHMENT_FILENAME_MAX);
  }
  return name;
}

export function formatByteSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function maxFilesForContext(context: AttachmentContext): number {
  return context === "message" ? MESSAGE_ATTACHMENT_MAX : WORK_ATTACHMENT_MAX;
}

/** Human label for the shared per-file size cap (keep in sync with ATTACHMENT_MAX_BYTES). */
export function attachmentMaxSizeLabel(): string {
  return "10 MiB";
}

/**
 * Canonical UI copy for attachment limits by context.
 * Messages intentionally allow fewer files than work submissions.
 */
export function attachmentLimitsHint(context: AttachmentContext): string {
  const maxFiles = maxFilesForContext(context);
  const size = attachmentMaxSizeLabel();
  if (context === "message") {
    return `PDF, images, Office docs, ZIP, CSV, or text — max ${maxFiles} files, ${size} each.`;
  }
  return `Optional private files — PDF, images, Office docs, ZIP, CSV, or text. Max ${maxFiles} files, ${size} each.`;
}

export type FilePolicyResult =
  | {
      ok: true;
      displayFilename: string;
      extension: string;
      contentType: string;
      byteSize: number;
    }
  | { ok: false; error: string };

/**
 * Validate size, filename, extension, and MIME.
 * Never trust browser MIME alone — extension must be allowed and MIME must match family.
 */
export function validateAttachmentFile(input: {
  filename: unknown;
  contentType: unknown;
  byteSize: unknown;
}): FilePolicyResult {
  const displayFilename = sanitizeDisplayFilename(
    typeof input.filename === "string" ? input.filename : ""
  );
  if (!displayFilename) {
    return { ok: false, error: "Filename is invalid." };
  }
  const byteSize =
    typeof input.byteSize === "number" ? input.byteSize : Number(input.byteSize);
  if (!Number.isInteger(byteSize) || byteSize <= 0) {
    return { ok: false, error: "File size is invalid." };
  }
  if (byteSize > ATTACHMENT_MAX_BYTES) {
    return { ok: false, error: "File exceeds the 10 MiB limit." };
  }

  const extension = extensionOf(displayFilename);
  if (!extension) {
    return { ok: false, error: "File type is not allowed." };
  }
  if (DANGEROUS_EXTENSIONS.has(extension) || !ALLOWED_EXTENSIONS.has(extension)) {
    return { ok: false, error: "File type is not allowed." };
  }

  const rawMime =
    typeof input.contentType === "string" ? input.contentType.trim().toLowerCase() : "";
  const mimeBase = rawMime.split(";")[0]?.trim() ?? "";
  if (!mimeBase) {
    return { ok: false, error: "Content type is required." };
  }
  if (DANGEROUS_MIMES.has(mimeBase)) {
    return { ok: false, error: "File type is not allowed." };
  }

  const allowedMimes = EXT_TO_MIMES[extension] ?? [];
  const mimeOk = allowedMimes.some((allowed) => {
    const base = allowed.split(";")[0]!.toLowerCase();
    return mimeBase === base;
  });
  // Some browsers send application/octet-stream for Office/ZIP — allow only with safe ext.
  const octetOk =
    mimeBase === "application/octet-stream" &&
    (extension === "zip" ||
      extension === "doc" ||
      extension === "docx" ||
      extension === "xls" ||
      extension === "xlsx" ||
      extension === "ppt" ||
      extension === "pptx" ||
      extension === "pdf");
  if (!mimeOk && !octetOk) {
    return { ok: false, error: "File type does not match its extension." };
  }

  return {
    ok: true,
    displayFilename,
    extension,
    contentType: mimeBase,
    byteSize,
  };
}

/** Safe opaque path segment derived from a sanitized display name. */
export function safeFilenameSegment(displayFilename: string): string {
  const sanitized = sanitizeDisplayFilename(displayFilename) ?? "file";
  const ext = extensionOf(sanitized);
  const stem = sanitized
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 64);
  const safeStem = stem || "file";
  return ext ? `${safeStem}.${ext}` : safeStem;
}
