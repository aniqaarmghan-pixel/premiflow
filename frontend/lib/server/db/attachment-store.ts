import { and, asc, eq, inArray } from "drizzle-orm";

import type { MessagingDatabase } from "./client";
import {
  contractAttachments,
  messageAttachments,
  workSubmissionAttachments,
} from "./schema";
import type {
  AttachmentRecord,
  AttachmentStatus,
  AttachmentStore,
  AttachmentContextKind,
} from "../stores";

function asAttachment(
  row: typeof contractAttachments.$inferSelect
): AttachmentRecord {
  return {
    id: row.id,
    contractAddress: row.contractAddress,
    uploaderWallet: row.uploaderWallet,
    context: row.context as AttachmentContextKind,
    blobPathname: row.blobPathname,
    blobUrl: row.blobUrl,
    displayFilename: row.displayFilename,
    contentType: row.contentType,
    byteSize: row.byteSize,
    status: row.status as AttachmentStatus,
    createdAt: row.createdAt,
    deletedAt: row.deletedAt,
  };
}

export function createDrizzleAttachmentStore(db: MessagingDatabase): AttachmentStore {
  return {
    async insertPending(row) {
      const [saved] = await db.insert(contractAttachments).values(row).returning();
      return asAttachment(saved);
    },
    async getById(id) {
      const [row] = await db
        .select()
        .from(contractAttachments)
        .where(eq(contractAttachments.id, id));
      return row ? asAttachment(row) : null;
    },
    async listByIds(ids) {
      if (ids.length === 0) return [];
      const rows = await db
        .select()
        .from(contractAttachments)
        .where(inArray(contractAttachments.id, ids));
      return rows.map(asAttachment);
    },
    async markDeleted(id, now) {
      const rows = await db
        .update(contractAttachments)
        .set({ status: "deleted", deletedAt: now })
        .where(
          and(
            eq(contractAttachments.id, id),
            inArray(contractAttachments.status, ["pending", "active"])
          )
        )
        .returning();
      return rows[0] ? asAttachment(rows[0]) : null;
    },
    async bindToMessage(messageId, attachmentIds) {
      const bound: AttachmentRecord[] = [];
      for (let i = 0; i < attachmentIds.length; i++) {
        const attachmentId = attachmentIds[i]!;
        const [existing] = await db
          .select()
          .from(messageAttachments)
          .where(eq(messageAttachments.attachmentId, attachmentId));
        if (existing) {
          if (existing.messageId !== messageId) {
            throw new Error("Attachment is already bound to another message.");
          }
          const row = await this.getById(attachmentId);
          if (row) bound.push(row);
          continue;
        }
        const [sub] = await db
          .select()
          .from(workSubmissionAttachments)
          .where(eq(workSubmissionAttachments.attachmentId, attachmentId));
        if (sub) {
          throw new Error("Attachment is already bound to a work submission.");
        }
        const updated = await db
          .update(contractAttachments)
          .set({ status: "active" })
          .where(
            and(
              eq(contractAttachments.id, attachmentId),
              eq(contractAttachments.status, "pending")
            )
          )
          .returning();
        if (!updated[0]) {
          throw new Error("Attachment is not available to bind.");
        }
        await db.insert(messageAttachments).values({
          messageId,
          attachmentId,
          position: i,
        });
        bound.push(asAttachment(updated[0]));
      }
      return bound;
    },
    async bindToSubmission(submissionId, attachmentIds) {
      const bound: AttachmentRecord[] = [];
      for (let i = 0; i < attachmentIds.length; i++) {
        const attachmentId = attachmentIds[i]!;
        const [existing] = await db
          .select()
          .from(workSubmissionAttachments)
          .where(eq(workSubmissionAttachments.attachmentId, attachmentId));
        if (existing) {
          if (existing.submissionId !== submissionId) {
            throw new Error("Attachment is already bound to another submission.");
          }
          const row = await this.getById(attachmentId);
          if (row) bound.push(row);
          continue;
        }
        const [msg] = await db
          .select()
          .from(messageAttachments)
          .where(eq(messageAttachments.attachmentId, attachmentId));
        if (msg) {
          throw new Error("Attachment is already bound to a message.");
        }
        const updated = await db
          .update(contractAttachments)
          .set({ status: "active" })
          .where(
            and(
              eq(contractAttachments.id, attachmentId),
              eq(contractAttachments.status, "pending")
            )
          )
          .returning();
        if (!updated[0]) {
          throw new Error("Attachment is not available to bind.");
        }
        await db.insert(workSubmissionAttachments).values({
          submissionId,
          attachmentId,
          position: i,
        });
        bound.push(asAttachment(updated[0]));
      }
      return bound;
    },
    async listForMessages(messageIds) {
      if (messageIds.length === 0) return [];
      const bindings = await db
        .select()
        .from(messageAttachments)
        .where(inArray(messageAttachments.messageId, messageIds))
        .orderBy(asc(messageAttachments.position));
      const out: {
        messageId: string;
        attachment: AttachmentRecord;
        position: number;
      }[] = [];
      for (const binding of bindings) {
        const attachment = await this.getById(binding.attachmentId);
        if (attachment) {
          out.push({
            messageId: binding.messageId,
            attachment,
            position: binding.position,
          });
        }
      }
      return out;
    },
    async listForSubmissions(submissionIds) {
      if (submissionIds.length === 0) return [];
      const bindings = await db
        .select()
        .from(workSubmissionAttachments)
        .where(inArray(workSubmissionAttachments.submissionId, submissionIds))
        .orderBy(asc(workSubmissionAttachments.position));
      const out: {
        submissionId: string;
        attachment: AttachmentRecord;
        position: number;
      }[] = [];
      for (const binding of bindings) {
        const attachment = await this.getById(binding.attachmentId);
        if (attachment) {
          out.push({
            submissionId: binding.submissionId,
            attachment,
            position: binding.position,
          });
        }
      }
      return out;
    },
    async findMessageBinding(attachmentId) {
      const [row] = await db
        .select()
        .from(messageAttachments)
        .where(eq(messageAttachments.attachmentId, attachmentId));
      return row ?? null;
    },
    async findSubmissionBinding(attachmentId) {
      const [row] = await db
        .select()
        .from(workSubmissionAttachments)
        .where(eq(workSubmissionAttachments.attachmentId, attachmentId));
      return row ?? null;
    },
  };
}
