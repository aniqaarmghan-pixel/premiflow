import { and, desc, eq, asc } from "drizzle-orm";

import type { MessagingDatabase } from "./client";
import { supportTicketMessages, supportTickets } from "./schema";
import type {
  SupportStore,
  SupportTicketMessageRecord,
  SupportTicketRecord,
} from "../support/store";

function asTicket(row: typeof supportTickets.$inferSelect): SupportTicketRecord {
  return {
    ...row,
    category: row.category as SupportTicketRecord["category"],
    status: row.status as SupportTicketRecord["status"],
  };
}

function asMessage(row: typeof supportTicketMessages.$inferSelect): SupportTicketMessageRecord {
  return { ...row, authorRole: row.authorRole as SupportTicketMessageRecord["authorRole"] };
}

export function createDrizzleSupportStore(db: MessagingDatabase): SupportStore {
  return {
    async insertTicket(row) {
      const [saved] = await db.insert(supportTickets).values(row).returning();
      return asTicket(saved);
    },
    async getTicket(id) {
      const [row] = await db.select().from(supportTickets).where(eq(supportTickets.id, id));
      return row ? asTicket(row) : null;
    },
    async listTicketsForUser(userId, limit) {
      const rows = await db
        .select()
        .from(supportTickets)
        .where(eq(supportTickets.userId, userId))
        .orderBy(desc(supportTickets.updatedAt), desc(supportTickets.id))
        .limit(limit);
      return rows.map(asTicket);
    },
    async listTickets({ status, limit }) {
      const rows = await db
        .select()
        .from(supportTickets)
        .where(status ? eq(supportTickets.status, status) : undefined)
        .orderBy(desc(supportTickets.updatedAt), desc(supportTickets.id))
        .limit(limit);
      return rows.map(asTicket);
    },
    async insertMessage(row) {
      const [saved] = await db.insert(supportTicketMessages).values(row).returning();
      return asMessage(saved);
    },
    async listMessages(ticketId) {
      const rows = await db
        .select()
        .from(supportTicketMessages)
        .where(eq(supportTicketMessages.ticketId, ticketId))
        .orderBy(asc(supportTicketMessages.createdAt), asc(supportTicketMessages.id));
      return rows.map(asMessage);
    },
    async touchTicket(id, now) {
      await db.update(supportTickets).set({ updatedAt: now }).where(eq(supportTickets.id, id));
    },
    async updateStatus(id, expected, next, now) {
      const rows = await db
        .update(supportTickets)
        .set({ status: next, updatedAt: now })
        .where(and(eq(supportTickets.id, id), eq(supportTickets.status, expected)))
        .returning();
      return rows[0] ? asTicket(rows[0]) : null;
    },
  };
}
