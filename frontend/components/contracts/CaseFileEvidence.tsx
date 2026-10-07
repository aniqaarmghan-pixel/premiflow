"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { uploadContractAttachment } from "@/lib/app/attachments-client";
import { formatByteSize } from "@/lib/app/attachments-policy";
import { CASE_FILE_EVIDENCE_COPY } from "@/lib/app/resolution-center";
import type { ResolutionCaseView } from "@/lib/app/resolution-case";
import { submitCaseFileEvidence } from "@/lib/app/resolution-case-client";

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx";

function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && "message" in err && typeof err.message === "string") {
    return err.message;
  }
  return "Could not submit the file.";
}

/**
 * Submitted file evidence for one Resolution Case. Parties may add files
 * while the contract is Disputed; every viewer (parties + designated
 * resolver) can download submitted files. Records are immutable.
 */
export function CaseFileEvidence({
  address,
  caseRecord,
  canSubmit,
  participantWallet,
  onSubmitted,
}: {
  address: string;
  caseRecord: ResolutionCaseView;
  canSubmit: boolean;
  participantWallet: string | null;
  onSubmitted: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const files = caseRecord.fileEvidence ?? [];

  async function onPick(file: File | undefined) {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    setProgress(0);
    try {
      const { attachment } = await uploadContractAttachment(
        address,
        file,
        "case_evidence",
        (ratio) => setProgress(ratio),
        participantWallet
      );
      await submitCaseFileEvidence(address, attachment.id);
      onSubmitted();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      setProgress(null);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="mt-5">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-faint">
        {CASE_FILE_EVIDENCE_COPY.heading}
      </p>
      {files.length > 0 ? (
        <ul className="mt-3 space-y-3">
          {files.map((item) => (
            <li key={item.id} className="rounded-2xl border border-line bg-paper px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <a
                  href={item.downloadPath}
                  className="min-w-0 break-all text-sm font-semibold text-ink underline-offset-2 hover:underline"
                >
                  {item.filename}
                </a>
                <time className="text-[11px] text-ink-faint" dateTime={item.submittedAt}>
                  Submitted {new Date(item.submittedAt).toLocaleString()}
                </time>
              </div>
              <p className="mt-1 text-xs text-ink-faint">
                {item.contentType} · {formatByteSize(item.byteSize)}
              </p>
              <p className="mt-1 break-all text-xs text-ink-faint">
                Submitted by {item.submittedByRole}: {item.submittedBy}
              </p>
              <p className="mt-1 text-xs text-ink-faint">{CASE_FILE_EVIDENCE_COPY.immutable}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm leading-6 text-ink-soft">{CASE_FILE_EVIDENCE_COPY.empty}</p>
      )}
      {canSubmit ? (
        <div className="mt-3 space-y-2">
          <input
            ref={input}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            aria-label={CASE_FILE_EVIDENCE_COPY.action}
            onChange={(event) => void onPick(event.target.files?.[0])}
          />
          <Button variant="secondary" disabled={busy} onClick={() => input.current?.click()}>
            {busy
              ? progress != null
                ? `Uploading ${Math.round(progress * 100)}%`
                : "Submitting..."
              : CASE_FILE_EVIDENCE_COPY.action}
          </Button>
          <p className="text-xs leading-5 text-ink-faint">{CASE_FILE_EVIDENCE_COPY.rules}</p>
          {error ? (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
      <p className="mt-3 text-sm leading-6 text-ink-soft">{CASE_FILE_EVIDENCE_COPY.access}</p>
    </div>
  );
}
