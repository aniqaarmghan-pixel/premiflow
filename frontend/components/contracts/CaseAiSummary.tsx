"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { AI_CASE_SUMMARY_COPY } from "@/lib/app/resolution-center";
import { fetchCaseSummary, type CaseSummaryView } from "@/lib/app/resolution-case-client";

function Section({ title, items }: { title: string; items: readonly string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-faint">{title}</p>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-6 text-ink-soft">
        {items.map((item, index) => (
          <li key={`${title}:${index}`} className="break-words [overflow-wrap:anywhere]">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Neutral, informational summary of submitted case material only. */
export function CaseAiSummary({ address, enabled }: { address: string; enabled: boolean }) {
  const [summary, setSummary] = useState<CaseSummaryView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onGenerate() {
    setBusy(true);
    setError(null);
    try {
      const result = await fetchCaseSummary(address);
      setSummary(result.summary);
    } catch {
      setError(AI_CASE_SUMMARY_COPY.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h3 className="font-display text-xl">{AI_CASE_SUMMARY_COPY.label}</h3>
      <p className="mt-2 text-sm leading-6 text-ink-soft">{AI_CASE_SUMMARY_COPY.body}</p>
      {enabled ? (
        <Button className="mt-3" variant="secondary" disabled={busy} onClick={() => void onGenerate()}>
          {busy ? "Summarizing..." : summary ? AI_CASE_SUMMARY_COPY.regenerate : AI_CASE_SUMMARY_COPY.generate}
        </Button>
      ) : (
        <p className="mt-2 text-sm text-ink-faint">{AI_CASE_SUMMARY_COPY.unavailable}</p>
      )}
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {summary ? (
        <div className="mt-4 rounded-2xl border border-line bg-paper px-3 py-3">
          <p className="text-[11px] text-ink-faint">
            {summary.source === "model" ? AI_CASE_SUMMARY_COPY.sourceModel : AI_CASE_SUMMARY_COPY.sourceFallback}
          </p>
          {summary.narrative ? (
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink-soft">{summary.narrative}</p>
          ) : null}
          <Section title="Employer claims" items={summary.claims.employer} />
          <Section title="Freelancer claims" items={summary.claims.freelancer} />
          <Section title="Submitted evidence" items={summary.evidence} />
          <Section title="Agreements" items={summary.agreements} />
          <Section title="Disagreements" items={summary.disagreements} />
          <Section title="Contract facts" items={summary.contractFacts} />
          <Section title="Missing information" items={summary.missing} />
          <p className="mt-3 text-xs leading-5 text-ink-faint">{summary.disclaimer}</p>
        </div>
      ) : null}
    </div>
  );
}
