import type {
  AttachmentRecord,
  AttachmentStatus,
  AttachmentStore,
  MessageAttachmentBinding,
  WorkSubmissionAttachmentBinding,
} from "./stores";

export function createMemoryAttachmentStore(): AttachmentStore {
  const rows: AttachmentRecord[] = [];
  const messageBindings: MessageAttachmentBinding[] = [];
  const submissionBindings: WorkSubmissionAttachmentBinding[] = [];

  function clone(row: AttachmentRecord): AttachmentRecord {
    return { ...row };
  }

  return {
    async insertPending(row) {
      if (row.status !== "pending") {
        throw new Error("Only pending attachments can be inserted.");
      }
      const saved = clone(row);
      rows.push(saved);
      return clone(saved);
    },
    async getById(id) {
      const row = rows.find((item) => item.id === id);
      return row ? clone(row) : null;
    },
    async listByIds(ids) {
      const set = new Set(ids);
      return rows.filter((row) => set.has(row.id)).map(clone);
    },
    async markDeleted(id, now) {
      const row = rows.find((item) => item.id === id);
      if (!row || row.status === "deleted") return null;
      row.status = "deleted";
      row.deletedAt = now;
      return clone(row);
    },
    async bindToMessage(messageId, attachmentIds) {
      const bound: AttachmentRecord[] = [];
      for (let i = 0; i < attachmentIds.length; i++) {
        const id = attachmentIds[i]!;
        const existing = messageBindings.find((b) => b.attachmentId === id);
        if (existing) {
          if (existing.messageId !== messageId) {
            throw new Error("Attachment is already bound to another message.");
          }
          const row = rows.find((item) => item.id === id);
          if (row) bound.push(clone(row));
          continue;
        }
        if (submissionBindings.some((b) => b.attachmentId === id)) {
          throw new Error("Attachment is already bound to a work submission.");
        }
        const row = rows.find((item) => item.id === id);
        if (!row || row.status !== "pending") {
          throw new Error("Attachment is not available to bind.");
        }
        messageBindings.push({ messageId, attachmentId: id, position: i });
        row.status = "active" satisfies AttachmentStatus;
        bound.push(clone(row));
      }
      return bound;
    },
    async bindToSubmission(submissionId, attachmentIds) {
      const bound: AttachmentRecord[] = [];
      for (let i = 0; i < attachmentIds.length; i++) {
        const id = attachmentIds[i]!;
        const existing = submissionBindings.find((b) => b.attachmentId === id);
        if (existing) {
          if (existing.submissionId !== submissionId) {
            throw new Error("Attachment is already bound to another submission.");
          }
          const row = rows.find((item) => item.id === id);
          if (row) bound.push(clone(row));
          continue;
        }
        if (messageBindings.some((b) => b.attachmentId === id)) {
          throw new Error("Attachment is already bound to a message.");
        }
        const row = rows.find((item) => item.id === id);
        if (!row || row.status !== "pending") {
          throw new Error("Attachment is not available to bind.");
        }
        submissionBindings.push({
          submissionId,
          attachmentId: id,
          position: i,
        });
        row.status = "active";
        bound.push(clone(row));
      }
      return bound;
    },
    async listForMessages(messageIds) {
      const set = new Set(messageIds);
      return messageBindings
        .filter((b) => set.has(b.messageId))
        .map((b) => {
          const attachment = rows.find((row) => row.id === b.attachmentId)!;
          return {
            messageId: b.messageId,
            attachment: clone(attachment),
            position: b.position,
          };
        })
        .sort((a, b) => a.position - b.position);
    },
    async listForSubmissions(submissionIds) {
      const set = new Set(submissionIds);
      return submissionBindings
        .filter((b) => set.has(b.submissionId))
        .map((b) => {
          const attachment = rows.find((row) => row.id === b.attachmentId)!;
          return {
            submissionId: b.submissionId,
            attachment: clone(attachment),
            position: b.position,
          };
        })
        .sort((a, b) => a.position - b.position);
    },
    async findMessageBinding(attachmentId) {
      return messageBindings.find((b) => b.attachmentId === attachmentId) ?? null;
    },
    async findSubmissionBinding(attachmentId) {
      return (
        submissionBindings.find((b) => b.attachmentId === attachmentId) ?? null
      );
    },
  };
}
