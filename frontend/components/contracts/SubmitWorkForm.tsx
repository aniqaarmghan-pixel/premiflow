"use client";

import { useRef } from "react";

import {
  AttachmentChipList,
  type AttachmentChipModel,
} from "@/components/contracts/AttachmentChips";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { DELIVERY_SESSION_COPY } from "@/lib/app/messaging-session";
import {
  DELIVERY_FILES_HINT,
  DELIVERY_LINK_MAX,
  DELIVERY_NOTE_MAX_LENGTH,
  emptyDeliveryLink,
  submitWorkHeading,
  type DeliveryLinkDraft,
} from "@/lib/app/work-delivery";
import type { WorkUnitKind } from "@/lib/streampay-v2";

export type DeliveryAttachmentDraft = AttachmentChipModel & {
  file: File;
  attachmentId?: string;
};

export type DeliveryDraft = {
  note: string;
  links: DeliveryLinkDraft[];
  attachments: DeliveryAttachmentDraft[];
};

export type DeliverySessionUi = {
  status: "unknown" | "ready" | "needs_verify" | "verifying" | "failed";
  error: string | null;
};

export function emptyDeliveryDraft(): DeliveryDraft {
  return { note: "", links: [emptyDeliveryLink()], attachments: [] };
}

export function SubmitWorkForm({
  kind,
  contextTitle,
  revisionLabelText,
  draft,
  onChange,
  onPickFiles,
  onRemoveAttachment,
  onRetryAttachment,
  deliverySession,
  onVerifyWallet,
  reviewPeriod,
  revisionRequests,
}: {
  kind: WorkUnitKind;
  contextTitle: string;
  revisionLabelText: string;
  draft: DeliveryDraft;
  onChange: (next: DeliveryDraft) => void;
  onPickFiles: (files: FileList | null) => void;
  onRemoveAttachment: (localId: string) => void;
  onRetryAttachment: (localId: string) => void;
  deliverySession: DeliverySessionUi;
  onVerifyWallet: () => void;
  reviewPeriod?: string;
  revisionRequests?: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const filesReady = deliverySession.status === "ready";
  const verifying = deliverySession.status === "verifying";
  const needsVerify =
    deliverySession.status === "needs_verify" ||
    deliverySession.status === "failed" ||
    deliverySession.status === "unknown";

  function updateLink(index: number, patch: Partial<DeliveryLinkDraft>) {
    onChange({
      ...draft,
      links: draft.links.map((link, i) => (i === index ? { ...link, ...patch } : link)),
    });
  }

  function removeLink(index: number) {
    if (draft.links.length <= 1) return;
    onChange({
      ...draft,
      links: draft.links.filter((_, i) => i !== index),
    });
  }

  function addLink() {
    if (draft.links.length >= DELIVERY_LINK_MAX) return;
    onChange({
      ...draft,
      links: [...draft.links, emptyDeliveryLink()],
    });
  }

  return (
    <div className="space-y-4 text-sm leading-6 text-ink-soft">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-faint">
          {submitWorkHeading(kind)}
        </p>
        <p className="mt-1 font-medium text-ink">Delivering: {contextTitle}</p>
        <p className="mt-1 text-xs text-ink-faint">{revisionLabelText}</p>
      </div>

      {reviewPeriod || revisionRequests ? (
        <dl className="grid gap-2 sm:grid-cols-2">
          {reviewPeriod ? (
            <div>
              <dt className="text-xs uppercase tracking-wide text-ink-faint">Review period</dt>
              <dd className="font-medium text-ink">{reviewPeriod}</dd>
            </div>
          ) : null}
          {revisionRequests ? (
            <div>
              <dt className="text-xs uppercase tracking-wide text-ink-faint">
                Revision requests allowed
              </dt>
              <dd className="font-medium text-ink">{revisionRequests}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      <Field
        label="Delivery note"
        hint={`Describe what you are delivering. Max ${DELIVERY_NOTE_MAX_LENGTH} characters.`}
      >
        <Textarea
          value={draft.note}
          maxLength={DELIVERY_NOTE_MAX_LENGTH}
          aria-label="Delivery note"
          className="min-h-[96px] resize-none"
          placeholder="Completed the second landing-page revision. Updated typography, responsive spacing and mobile navigation."
          onChange={(event) => onChange({ ...draft, note: event.target.value })}
        />
        <p className="mt-1 text-xs text-ink-faint">
          {draft.note.trim().length} / {DELIVERY_NOTE_MAX_LENGTH}
        </p>
      </Field>

      <div className="space-y-3">
        <p className="text-sm font-medium text-ink">Work links</p>
        <p className="text-xs text-ink-faint">
          Add at least one https:// link or upload a file. When a link is present, the first
          link is recorded on-chain as the submission reference (max 200 characters).
        </p>
        {draft.links.map((link, index) => (
          <div
            key={`link-${index}`}
            className="space-y-2 rounded-2xl border border-line bg-paper p-3"
          >
            <Field label={index === 0 ? "Primary link label (optional)" : "Link label (optional)"}>
              <Input
                value={link.label}
                maxLength={80}
                aria-label={`Link ${index + 1} label`}
                placeholder={index === 0 ? "Figma design" : "Live preview"}
                onChange={(event) => updateLink(index, { label: event.target.value })}
              />
            </Field>
            <Field label={index === 0 ? "Primary https:// URL" : "https:// URL"}>
              <Input
                value={link.url}
                maxLength={200}
                aria-label={`Link ${index + 1} URL`}
                placeholder="https://…"
                onChange={(event) => updateLink(index, { url: event.target.value })}
              />
            </Field>
            {draft.links.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => removeLink(index)}
                aria-label={`Remove link ${index + 1}`}
              >
                Remove link
              </Button>
            ) : null}
          </div>
        ))}
        {draft.links.length < DELIVERY_LINK_MAX ? (
          <Button type="button" variant="secondary" onClick={addLink} aria-label="Add another link">
            + Add another link
          </Button>
        ) : null}
      </div>

      <div className="space-y-3 rounded-2xl border border-line bg-paper-2 px-3 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-ink">Files</p>
            <p className="mt-1 text-xs text-ink-faint">{DELIVERY_FILES_HINT}</p>
          </div>
          {filesReady ? (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                className="sr-only"
                multiple
                accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx,application/pdf,image/png,image/jpeg,image/webp,text/plain,text/csv,application/zip"
                aria-label="Attach delivery files"
                onChange={(event) => {
                  onPickFiles(event.target.files);
                  event.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Attach delivery files"
              >
                Attach files
              </Button>
            </div>
          ) : null}
        </div>
        {needsVerify || verifying ? (
          <div className="space-y-2 rounded-xl border border-line bg-paper px-3 py-3">
            <p className="text-sm font-medium text-ink">{DELIVERY_SESSION_COPY.needsVerifyHeadline}</p>
            <p className="text-xs leading-5 text-ink-faint">
              {verifying
                ? DELIVERY_SESSION_COPY.verifying
                : DELIVERY_SESSION_COPY.needsVerifyDetail}
            </p>
            <Button
              type="button"
              onClick={onVerifyWallet}
              disabled={verifying}
              aria-label="Verify wallet"
            >
              {DELIVERY_SESSION_COPY.button}
            </Button>
            {deliverySession.error ? (
              <p className="text-sm text-danger" role="alert">
                {deliverySession.error}
              </p>
            ) : null}
          </div>
        ) : null}
        <AttachmentChipList
          items={draft.attachments}
          onRemove={onRemoveAttachment}
          onRetry={onRetryAttachment}
        />
      </div>
    </div>
  );
}
