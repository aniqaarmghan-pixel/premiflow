"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import {
  formatSubmissionTimestamp,
  revisionLabel,
  savedTransactionSignature,
  type SubmissionKind,
} from "@/lib/app/work-delivery";
import type { PublicWorkSubmission } from "@/lib/app/submissions-client";
import { explorerTxUrl } from "@/lib/network";

function kindMatchesUnit(
  submission: PublicWorkSubmission,
  kind: SubmissionKind,
  workUnitIndex: number
): boolean {
  return (
    submission.submissionKind === kind && submission.workUnitIndex === workUnitIndex
  );
}

export function WorkDeliveryHistory({
  submissions,
  kind,
  workUnitIndex,
  syncWarning,
  onRetrySync,
  retryBusy,
}: {
  submissions: readonly PublicWorkSubmission[];
  kind: SubmissionKind;
  workUnitIndex: number;
  syncWarning?: string | null;
  onRetrySync?: () => void;
  retryBusy?: boolean;
}) {
  const scoped = submissions.filter((row) => kindMatchesUnit(row, kind, workUnitIndex));
  const [current, ...previous] = scoped;
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});

  if (!current && previous.length === 0 && !syncWarning) {
    return null;
  }

  return (
    <div className="mt-4 space-y-4">
      {syncWarning ? (
        <div className="rounded-xl border border-gold bg-gold-soft p-3 text-sm leading-6 text-ink">
          <p>{syncWarning}</p>
          {onRetrySync ? (
            <div className="mt-2">
              <Button
                type="button"
                variant="secondary"
                disabled={retryBusy}
                onClick={onRetrySync}
                aria-label="Retry saving delivery history"
              >
                {retryBusy ? "Saving…" : "Retry saving history"}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {current ? (
        <section aria-labelledby={`current-submission-${current.id}`}>
          <h4
            id={`current-submission-${current.id}`}
            className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint"
          >
            Current submission
          </h4>
          <SubmissionCard submission={current} expanded />
        </section>
      ) : null}

      {previous.length > 0 ? (
        <section aria-labelledby={`previous-submissions-${kind}-${workUnitIndex}`}>
          <h4
            id={`previous-submissions-${kind}-${workUnitIndex}`}
            className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint"
          >
            Previous submissions
          </h4>
          <ul className="mt-2 space-y-2">
            {previous.map((submission) => {
              const open = Boolean(openIds[submission.id]);
              return (
                <li key={submission.id} className="rounded-xl border border-line bg-paper p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-ink">
                        {revisionLabel(submission.revisionNumber)}
                      </p>
                      <p className="text-xs text-ink-faint">
                        {formatSubmissionTimestamp(submission.createdAt)}
                        {submission.links.length > 0
                          ? ` · ${submission.links.length} link${
                              submission.links.length === 1 ? "" : "s"
                            }`
                          : ""}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      aria-expanded={open}
                      aria-label={open ? "Hide details" : "View details"}
                      onClick={() =>
                        setOpenIds((currentMap) => ({
                          ...currentMap,
                          [submission.id]: !open,
                        }))
                      }
                    >
                      {open ? "Hide details" : "View details"}
                    </Button>
                  </div>
                  {open ? (
                    <div className="mt-3 border-t border-line pt-3">
                      <SubmissionCard submission={submission} expanded compact />
                    </div>
                  ) : (
                    <p className="mt-2 line-clamp-2 text-sm text-ink-soft">
                      {submission.deliveryNote}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function SubmissionCard({
  submission,
  expanded,
  compact,
}: {
  submission: PublicWorkSubmission;
  expanded?: boolean;
  compact?: boolean;
}) {
  const txSignature = savedTransactionSignature(submission.transactionSignature);
  return (
    <div
      className={
        compact
          ? "space-y-2 text-sm"
          : "mt-2 space-y-3 rounded-xl border border-line bg-paper p-3 text-sm"
      }
    >
      {!compact ? (
        <div>
          <p className="font-medium text-ink">{revisionLabel(submission.revisionNumber)}</p>
          <p className="text-xs text-ink-faint">
            Submitted {formatSubmissionTimestamp(submission.createdAt)}
          </p>
        </div>
      ) : null}
      {expanded ? (
        <>
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-faint">Delivery note</p>
            <p className="mt-1 whitespace-pre-wrap break-words text-ink [overflow-wrap:anywhere]">
              {submission.deliveryNote}
            </p>
          </div>
          {submission.links.length > 0 ? (
            <div>
              <p className="text-xs uppercase tracking-wide text-ink-faint">Links</p>
              <ul className="mt-1 space-y-1">
                {submission.links.map((link) => (
                  <li key={link.id}>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-cyan underline-offset-2 hover:underline"
                    >
                      {link.label || link.url} ↗
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {submission.attachments && submission.attachments.length > 0 ? (
            <div>
              <p className="text-xs uppercase tracking-wide text-ink-faint">Files</p>
              <ul className="mt-1 space-y-1">
                {submission.attachments.map((file) => (
                  <li key={file.id}>
                    <a
                      href={file.downloadPath}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-cyan underline-offset-2 hover:underline"
                    >
                      {file.displayFilename} ({file.byteSize} bytes) ↗
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {txSignature ? (
            <div>
              <a
                href={explorerTxUrl(txSignature)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-cyan underline-offset-2 hover:underline"
              >
                View transaction ↗
              </a>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
