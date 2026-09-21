import { randomBytes } from "node:crypto";

import type { AttachmentContext } from "@/lib/app/attachments-policy";
import { safeFilenameSegment } from "@/lib/app/attachments-policy";

/**
 * Build a non-guessable private object key.
 * Never use a raw user filename as the trusted path.
 */
export function buildAttachmentObjectKey(input: {
  contractAddress: string;
  context: AttachmentContext;
  displayFilename: string;
  randomId?: string;
}): string {
  const randomId = input.randomId ?? randomBytes(16).toString("hex");
  const filename = safeFilenameSegment(input.displayFilename);
  return `premiflow/contracts/${input.contractAddress}/${input.context}/${randomId}/${filename}`;
}
