import type {
  SupportTicketCategory,
  SupportTicketStatus,
} from "@/lib/app/support-tickets";

export type SupportTicketRecord = {
  id: string;
  userId: string;
  requesterEmail: string | null;
  category: SupportTicketCategory;
  subject: string;
  description: string;
  contractAddress: string | null;
  status: SupportTicketStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type SupportTicketMessageRecord = {
  id: string;
  ticketId: string;
  authorRole: "user" | "admin";
  authorUserId: string;
  body: string;
  createdAt: Date;
};

export interface SupportStore {
  insertTicket(row: SupportTicketRecord): Promise<SupportTicketRecord>;
  getTicket(id: string): Promise<SupportTicketRecord | null>;
  listTicketsForUser(userId: string, limit: number): Promise<SupportTicketRecord[]>;
  listTickets(filter: { status: SupportTicketStatus | null; limit: number }): Promise<SupportTicketRecord[]>;
  insertMessage(row: SupportTicketMessageRecord): Promise<SupportTicketMessageRecord>;
  listMessages(ticketId: string): Promise<SupportTicketMessageRecord[]>;
  touchTicket(id: string, now: Date): Promise<void>;
  /**
   * Compare-and-set status change. Returns null when the stored status is no
   * longer `expected`, so concurrent or retried changes apply (and notify) once.
   */
  updateStatus(
    id: string,
    expected: SupportTicketStatus,
    next: SupportTicketStatus,
    now: Date
  ): Promise<SupportTicketRecord | null>;
}

export function createMemorySupportStore(): SupportStore {
  const tickets: SupportTicketRecord[] = [];
  const messages: SupportTicketMessageRecord[] = [];
  const byUpdatedDesc = (a: SupportTicketRecord, b: SupportTicketRecord) =>
    b.updatedAt.getTime() - a.updatedAt.getTime() || b.id.localeCompare(a.id);
  return {
    async insertTicket(row) {
      const saved = { ...row };
      tickets.push(saved);
      return { ...saved };
    },
    async getTicket(id) {
      const row = tickets.find((item) => item.id === id);
      return row ? { ...row } : null;
    },
    async listTicketsForUser(userId, limit) {
      return tickets
        .filter((item) => item.userId === userId)
        .sort(byUpdatedDesc)
        .slice(0, limit)
        .map((row) => ({ ...row }));
    },
    async listTickets({ status, limit }) {
      return tickets
        .filter((item) => (status ? item.status === status : true))
        .sort(byUpdatedDesc)
        .slice(0, limit)
        .map((row) => ({ ...row }));
    },
    async insertMessage(row) {
      const saved = { ...row };
      messages.push(saved);
      return { ...saved };
    },
    async listMessages(ticketId) {
      return messages
        .filter((item) => item.ticketId === ticketId)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
        .map((row) => ({ ...row }));
    },
    async touchTicket(id, now) {
      const row = tickets.find((item) => item.id === id);
      if (row) row.updatedAt = now;
    },
    async updateStatus(id, expected, next, now) {
      const row = tickets.find((item) => item.id === id);
      if (!row || row.status !== expected) return null;
      row.status = next;
      row.updatedAt = now;
      return { ...row };
    },
  };
}
