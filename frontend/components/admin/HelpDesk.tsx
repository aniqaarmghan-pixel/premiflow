"use client";

import { useCallback, useEffect, useState } from "react";

import { TicketStatusBadge, TicketThread } from "@/components/support/SupportTickets";
import { PageFade } from "@/components/shell/PageFade";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Select, Textarea } from "@/components/ui/Field";
import {
  HELP_DESK_COPY,
  SUPPORT_REPLY_MAX,
  SUPPORT_TICKET_STATUSES,
  SUPPORT_TICKET_STATUS_LABEL,
  fetchAdminSupportTicket,
  listAdminSupportTickets,
  replyAsHelpDesk,
  setHelpDeskTicketStatus,
  supportCategoryLabel,
  type AdminSupportTicket,
  type ApiError,
  type SupportTicketDetail,
  type SupportTicketStatus,
} from "@/lib/app/support-tickets";

type Filter = SupportTicketStatus | "all";

function messageOf(err: unknown, fallback: string): string {
  const e = err as Partial<ApiError> | null;
  return e && typeof e.message === "string" ? e.message : fallback;
}

/** Admin Help Desk. Server enforces admin on every call; no settlement authority. */
export function HelpDesk() {
  const [filter, setFilter] = useState<Filter>("open");
  const [tickets, setTickets] = useState<AdminSupportTicket[] | null>(null);
  const [denied, setDenied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<SupportTicketDetail<AdminSupportTicket> | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (next: Filter) => {
    try {
      const result = await listAdminSupportTickets(next);
      setTickets(result.tickets);
      setDenied(null);
      setError(null);
    } catch (err) {
      const status = (err as Partial<ApiError>)?.status;
      if (status === 401) setDenied(HELP_DESK_COPY.signIn);
      else if (status === 403) setDenied(HELP_DESK_COPY.notAdmin);
      else setError(messageOf(err, "Could not load tickets."));
    }
  }, []);

  useEffect(() => {
    void load(filter);
  }, [filter, load]);

  async function run(action: () => Promise<SupportTicketDetail<AdminSupportTicket>>) {
    setBusy(true);
    setError(null);
    try {
      setOpen(await action());
      await load(filter);
    } catch (err) {
      setError(messageOf(err, "Action failed."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageFade>
      <div className="space-y-4">
        <Card className="p-4 sm:p-5">
          <h1 className="font-display text-2xl">{HELP_DESK_COPY.adminHeading}</h1>
          <p className="mt-2 text-sm leading-6 text-ink-soft">{HELP_DESK_COPY.adminIntro}</p>
        </Card>

        {denied ? (
          <Card className="p-4 sm:p-5">
            <p className="text-sm text-ink-soft">{denied}</p>
          </Card>
        ) : open ? (
          <Card className="p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-ink">{open.ticket.subject}</p>
                <p className="text-xs text-ink-faint">
                  {supportCategoryLabel(open.ticket.category)} · {open.ticket.requesterEmail ?? "Account"} ·
                  Opened {new Date(open.ticket.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <TicketStatusBadge status={open.ticket.status} />
                <Button variant="secondary" onClick={() => setOpen(null)}>
                  All tickets
                </Button>
              </div>
            </div>
            <TicketThread detail={open} />
            <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
              <Field label="Reply to requester">
                <Textarea
                  value={reply}
                  maxLength={SUPPORT_REPLY_MAX}
                  onChange={(event) => setReply(event.target.value)}
                />
              </Field>
              <Field label="Status">
                <Select
                  value={open.ticket.status}
                  disabled={busy}
                  onChange={(event) => {
                    const status = event.target.value as SupportTicketStatus;
                    void run(() => setHelpDeskTicketStatus(open.ticket.id, status));
                  }}
                >
                  {SUPPORT_TICKET_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {SUPPORT_TICKET_STATUS_LABEL[status]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                disabled={busy || !reply.trim()}
                onClick={() =>
                  void run(async () => {
                    const detail = await replyAsHelpDesk(open.ticket.id, reply);
                    setReply("");
                    return detail;
                  })
                }
              >
                {HELP_DESK_COPY.reply}
              </Button>
              {open.ticket.status !== "resolved" ? (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void run(() => setHelpDeskTicketStatus(open.ticket.id, "resolved"))}
                >
                  {HELP_DESK_COPY.resolve}
                </Button>
              ) : null}
            </div>
          </Card>
        ) : (
          <Card className="p-4 sm:p-5">
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Ticket status">
              {(["all", ...SUPPORT_TICKET_STATUSES] as Filter[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  role="tab"
                  aria-selected={filter === item}
                  onClick={() => setFilter(item)}
                  className={
                    filter === item
                      ? "rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white"
                      : "rounded-full border border-line px-3 py-1 text-xs font-semibold text-ink-soft"
                  }
                >
                  {item === "all" ? "All" : SUPPORT_TICKET_STATUS_LABEL[item]}
                </button>
              ))}
            </div>
            <div className="mt-4 space-y-2">
              {tickets === null && !error ? <p className="text-sm text-ink-faint">Loading tickets...</p> : null}
              {tickets && tickets.length === 0 ? (
                <p className="text-sm text-ink-soft">{HELP_DESK_COPY.adminEmpty}</p>
              ) : null}
              {tickets?.map((ticket) => (
                <button
                  key={ticket.id}
                  type="button"
                  onClick={() => void run(() => fetchAdminSupportTicket(ticket.id))}
                  className="flex w-full items-center justify-between gap-2 rounded-2xl border border-line bg-paper px-3 py-2 text-left hover:bg-black/[0.02]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink">{ticket.subject}</span>
                    <span className="block truncate text-xs text-ink-faint">
                      {supportCategoryLabel(ticket.category)} · {ticket.requesterEmail ?? "Account"} · Updated{" "}
                      {new Date(ticket.updatedAt).toLocaleString()}
                    </span>
                  </span>
                  <TicketStatusBadge status={ticket.status} />
                </button>
              ))}
            </div>
          </Card>
        )}
        {error ? (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        ) : null}
      </div>
    </PageFade>
  );
}
