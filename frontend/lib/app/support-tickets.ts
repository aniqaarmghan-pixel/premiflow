/**
 * PREMIFLOW Help Desk: shared ticket vocabulary + browser client.
 *
 * Help Desk access is account data only. It grants no escrow/settlement
 * authority and never exposes private contract messages.
 */

export const SUPPORT_TICKET_CATEGORIES = [
  { id: "account", label: "Account" },
  { id: "wallet", label: "Wallet" },
  { id: "marketplace", label: "Marketplace" },
  { id: "contract", label: "Contract" },
  { id: "payment", label: "Payment" },
  { id: "technical", label: "Technical" },
  { id: "other", label: "Other" },
] as const;

export type SupportTicketCategory = (typeof SUPPORT_TICKET_CATEGORIES)[number]["id"];

export const SUPPORT_TICKET_STATUSES = ["open", "in_progress", "resolved"] as const;
export type SupportTicketStatus = (typeof SUPPORT_TICKET_STATUSES)[number];

export const SUPPORT_TICKET_STATUS_LABEL: Record<SupportTicketStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
};

export const SUPPORT_SUBJECT_MIN = 3;
export const SUPPORT_SUBJECT_MAX = 160;
export const SUPPORT_DESCRIPTION_MIN = 10;
export const SUPPORT_DESCRIPTION_MAX = 4000;
export const SUPPORT_REPLY_MAX = 4000;

const CATEGORY_IDS = new Set<string>(SUPPORT_TICKET_CATEGORIES.map((item) => item.id));
const STATUS_IDS = new Set<string>(SUPPORT_TICKET_STATUSES);

export function isSupportTicketCategory(value: unknown): value is SupportTicketCategory {
  return typeof value === "string" && CATEGORY_IDS.has(value);
}

export function isSupportTicketStatus(value: unknown): value is SupportTicketStatus {
  return typeof value === "string" && STATUS_IDS.has(value);
}

export function supportCategoryLabel(id: string): string {
  return SUPPORT_TICKET_CATEGORIES.find((item) => item.id === id)?.label ?? "Other";
}

export type PublicSupportTicket = {
  id: string;
  category: SupportTicketCategory;
  subject: string;
  description: string;
  contractAddress: string | null;
  status: SupportTicketStatus;
  createdAt: string;
  updatedAt: string;
};

/** Admin list rows add the requester's account email (never wallets or chats). */
export type AdminSupportTicket = PublicSupportTicket & { requesterEmail: string | null };

export type PublicSupportMessage = {
  id: string;
  authorRole: "user" | "admin";
  body: string;
  createdAt: string;
};

export type SupportTicketDetail<T extends PublicSupportTicket = PublicSupportTicket> = {
  ticket: T;
  messages: PublicSupportMessage[];
};

export const HELP_DESK_COPY = {
  userHeading: "Your support tickets",
  userIntro:
    "Open a ticket for account, wallet, marketplace, contract, payment or technical help. Replies from the PREMIFLOW Help Desk appear here and in your notifications.",
  privacy:
    "The Help Desk cannot read your private contract messages and has no escrow settlement authority.",
  newTicket: "New ticket",
  submit: "Submit ticket",
  reply: "Send reply",
  signIn: "Sign in to your PREMIFLOW account to open and track support tickets.",
  empty: "You have not opened any support tickets.",
  adminHeading: "Help Desk",
  adminIntro:
    "All PREMIFLOW support tickets. Help Desk access is account data only: it grants no on-chain settlement authority and no access to private contract messages.",
  adminEmpty: "No tickets match this filter.",
  notAdmin: "This PREMIFLOW account is not a Help Desk admin.",
  contractRefHint: "Optional. A contract address helps the Help Desk find public on-chain facts.",
  resolve: "Resolve ticket",
} as const;

export type ApiError = { status: number; code: string; message: string };

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const response = await fetch(path, { ...init, headers, credentials: "include" });
  const json = (await response.json().catch(() => null)) as
    | T
    | { error?: { code?: string; message?: string } }
    | null;
  if (!response.ok) {
    const error = json && typeof json === "object" && "error" in json ? json.error : null;
    throw {
      status: response.status,
      code: error?.code ?? "request_failed",
      message: error?.message ?? "Request failed.",
    } satisfies ApiError;
  }
  return json as T;
}

export function listMySupportTickets() {
  return request<{ tickets: PublicSupportTicket[] }>("/api/support/tickets");
}

export function createSupportTicket(body: {
  category: SupportTicketCategory;
  subject: string;
  description: string;
  contractAddress?: string;
}) {
  return request<SupportTicketDetail>("/api/support/tickets", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function fetchMySupportTicket(id: string) {
  return request<SupportTicketDetail>(`/api/support/tickets/${encodeURIComponent(id)}`);
}

export function replyToMySupportTicket(id: string, body: string) {
  return request<SupportTicketDetail>(`/api/support/tickets/${encodeURIComponent(id)}`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export function fetchAdminMe() {
  return request<{ admin: boolean }>("/api/admin/me");
}

export function listAdminSupportTickets(status: SupportTicketStatus | "all" = "all") {
  const query = status === "all" ? "" : `?status=${status}`;
  return request<{ tickets: AdminSupportTicket[] }>(`/api/admin/support/tickets${query}`);
}

export function fetchAdminSupportTicket(id: string) {
  return request<SupportTicketDetail<AdminSupportTicket>>(
    `/api/admin/support/tickets/${encodeURIComponent(id)}`
  );
}

export function replyAsHelpDesk(id: string, body: string) {
  return request<SupportTicketDetail<AdminSupportTicket>>(
    `/api/admin/support/tickets/${encodeURIComponent(id)}`,
    { method: "POST", body: JSON.stringify({ body }) }
  );
}

export function setHelpDeskTicketStatus(id: string, status: SupportTicketStatus) {
  return request<SupportTicketDetail<AdminSupportTicket>>(
    `/api/admin/support/tickets/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify({ status }) }
  );
}
