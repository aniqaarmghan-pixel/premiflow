"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import {
  HELP_DESK_COPY,
  SUPPORT_DESCRIPTION_MAX,
  SUPPORT_REPLY_MAX,
  SUPPORT_SUBJECT_MAX,
  SUPPORT_TICKET_CATEGORIES,
  SUPPORT_TICKET_STATUS_LABEL,
  createSupportTicket,
  fetchMySupportTicket,
  listMySupportTickets,
  replyToMySupportTicket,
  supportCategoryLabel,
  type ApiError,
  type PublicSupportTicket,
  type SupportTicketCategory,
  type SupportTicketDetail,
} from "@/lib/app/support-tickets";

function messageOf(err: unknown, fallback: string): string {
  const e = err as Partial<ApiError> | null;
  return e && typeof e.message === "string" ? e.message : fallback;
}

export function TicketThread({ detail }: { detail: SupportTicketDetail }) {
  return (
    <div className="mt-3 space-y-3">
      <div className="rounded-2xl border border-line bg-paper px-3 py-3">
        <p className="text-xs font-semibold text-ink">Original request</p>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-ink-soft">
          {detail.ticket.description}
        </p>
        {detail.ticket.contractAddress ? (
          <p className="mt-1 break-all text-xs text-ink-faint">Contract: {detail.ticket.contractAddress}</p>
        ) : null}
      </div>
      {detail.messages.map((message) => (
        <div
          key={message.id}
          className={
            message.authorRole === "admin"
              ? "rounded-2xl border border-gold/40 bg-gold/5 px-3 py-3"
              : "rounded-2xl border border-line bg-paper px-3 py-3"
          }
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-ink">
              {message.authorRole === "admin" ? "PREMIFLOW Help Desk" : "You"}
            </p>
            <time className="text-[11px] text-ink-faint" dateTime={message.createdAt}>
              {new Date(message.createdAt).toLocaleString()}
            </time>
          </div>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-ink-soft">{message.body}</p>
        </div>
      ))}
    </div>
  );
}

export function TicketStatusBadge({ status }: { status: PublicSupportTicket["status"] }) {
  return (
    <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-semibold text-ink-soft">
      {SUPPORT_TICKET_STATUS_LABEL[status]}
    </span>
  );
}

/** Account-scoped support tickets: create, list own, open, reply, see status. */
export function SupportTickets() {
  const [tickets, setTickets] = useState<PublicSupportTicket[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [open, setOpen] = useState<SupportTicketDetail | null>(null);
  const [category, setCategory] = useState<SupportTicketCategory>("account");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [contractAddress, setContractAddress] = useState("");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await listMySupportTickets();
      setTickets(result.tickets);
      setSignedOut(false);
      setLoadError(null);
    } catch (err) {
      if ((err as Partial<ApiError>)?.status === 401) setSignedOut(true);
      else setLoadError(messageOf(err, "Could not load your tickets."));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("ticket");
    if (!id) return;
    fetchMySupportTicket(id).then(setOpen).catch(() => undefined);
  }, []);

  async function onCreate() {
    setBusy(true);
    setFormError(null);
    try {
      const detail = await createSupportTicket({
        category,
        subject,
        description,
        contractAddress: contractAddress.trim() || undefined,
      });
      setSubject("");
      setDescription("");
      setContractAddress("");
      setOpen(detail);
      await load();
    } catch (err) {
      setFormError(messageOf(err, "Could not open the ticket."));
    } finally {
      setBusy(false);
    }
  }

  async function onReply() {
    if (!open) return;
    setBusy(true);
    setFormError(null);
    try {
      const detail = await replyToMySupportTicket(open.ticket.id, reply);
      setReply("");
      setOpen(detail);
      await load();
    } catch (err) {
      setFormError(messageOf(err, "Could not send the reply."));
    } finally {
      setBusy(false);
    }
  }

  if (signedOut) {
    return (
      <Card className="p-4 sm:p-5">
        <h2 className="font-display text-xl">{HELP_DESK_COPY.userHeading}</h2>
        <p className="mt-2 text-sm leading-6 text-ink-soft">{HELP_DESK_COPY.signIn}</p>
      </Card>
    );
  }

  return (
    <Card id="tickets" className="p-4 sm:p-5">
      <h2 className="font-display text-xl">{HELP_DESK_COPY.userHeading}</h2>
      <p className="mt-2 text-sm leading-6 text-ink-soft">{HELP_DESK_COPY.userIntro}</p>
      <p className="mt-1 text-xs leading-5 text-ink-faint">{HELP_DESK_COPY.privacy}</p>

      {open ? (
        <div className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-ink">{open.ticket.subject}</p>
            <div className="flex items-center gap-2">
              <TicketStatusBadge status={open.ticket.status} />
              <Button variant="secondary" onClick={() => setOpen(null)}>
                All tickets
              </Button>
            </div>
          </div>
          <p className="mt-1 text-xs text-ink-faint">{supportCategoryLabel(open.ticket.category)}</p>
          <TicketThread detail={open} />
          <div className="mt-3 space-y-2">
            <Field label="Reply">
              <Textarea
                value={reply}
                maxLength={SUPPORT_REPLY_MAX}
                onChange={(event) => setReply(event.target.value)}
              />
            </Field>
            <Button disabled={busy || !reply.trim()} onClick={() => void onReply()}>
              {HELP_DESK_COPY.reply}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-4 space-y-2">
            {tickets === null && !loadError ? <p className="text-sm text-ink-faint">Loading tickets...</p> : null}
            {loadError ? <p className="text-sm text-red-700">{loadError}</p> : null}
            {tickets && tickets.length === 0 ? (
              <p className="text-sm text-ink-soft">{HELP_DESK_COPY.empty}</p>
            ) : null}
            {tickets?.map((ticket) => (
              <button
                key={ticket.id}
                type="button"
                onClick={() => fetchMySupportTicket(ticket.id).then(setOpen).catch(() => undefined)}
                className="flex w-full items-center justify-between gap-2 rounded-2xl border border-line bg-paper px-3 py-2 text-left hover:bg-black/[0.02]"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink">{ticket.subject}</span>
                  <span className="block text-xs text-ink-faint">
                    {supportCategoryLabel(ticket.category)} · Updated {new Date(ticket.updatedAt).toLocaleString()}
                  </span>
                </span>
                <TicketStatusBadge status={ticket.status} />
              </button>
            ))}
          </div>

          <div className="mt-5 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-faint">
              {HELP_DESK_COPY.newTicket}
            </p>
            <Field label="Category">
              <Select
                value={category}
                onChange={(event) => setCategory(event.target.value as SupportTicketCategory)}
              >
                {SUPPORT_TICKET_CATEGORIES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Subject">
              <Input
                value={subject}
                maxLength={SUPPORT_SUBJECT_MAX}
                onChange={(event) => setSubject(event.target.value)}
              />
            </Field>
            <Field label="Description">
              <Textarea
                value={description}
                maxLength={SUPPORT_DESCRIPTION_MAX}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
            <Field label="Contract reference" hint={HELP_DESK_COPY.contractRefHint}>
              <Input value={contractAddress} onChange={(event) => setContractAddress(event.target.value)} />
            </Field>
            <Button disabled={busy || !subject.trim() || !description.trim()} onClick={() => void onCreate()}>
              {HELP_DESK_COPY.submit}
            </Button>
          </div>
        </>
      )}
      {formError ? (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {formError}
        </p>
      ) : null}
    </Card>
  );
}
