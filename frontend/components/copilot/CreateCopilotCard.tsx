"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Textarea } from "@/components/ui/Field";
import {
  CREATE_COPILOT,
  applyCreateProposal,
  type CreateCopilotState,
} from "@/lib/app/copilot";
import {
  isCopilotClientError,
  requestCreateProposal,
} from "@/lib/app/copilot-client";
import type { CopilotCreateProposal, CopilotResponse } from "@/lib/app/copilot-schemas";
import { presentType } from "@/lib/app/view-model";
import type { CreateWizardDraft } from "@/lib/app/validation";

export function CreateCopilotCard({
  draft,
  onApply,
}: {
  draft: CreateWizardDraft;
  onApply: (next: CreateWizardDraft) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [state, setState] = useState<CreateCopilotState>("idle");
  const [response, setResponse] = useState<CopilotResponse | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function generate() {
    const description = prompt.trim();
    if (!description || state === "generating") return;
    setState("generating");
    setMessage(null);
    setResponse(null);
    try {
      const result = await requestCreateProposal(description);
      setResponse(result);
      if (result.source === "deterministic") {
        setState("provider_unavailable");
        setMessage(result.warnings[0] ?? CREATE_COPILOT.providerUnavailable);
      } else {
        setState("proposal_ready");
      }
    } catch (err) {
      if (isCopilotClientError(err) && err.code === "rate_limited") {
        setState("rate_limited");
        setMessage(CREATE_COPILOT.rateLimited);
        return;
      }
      setState("error");
      setMessage(CREATE_COPILOT.error);
    }
  }

  function apply() {
    if (!response) return;
    const result = applyCreateProposal(draft, response.proposal);
    if (!result.applied) {
      setState("validation_warning");
      setMessage(result.reason ?? CREATE_COPILOT.cannotApply);
      return;
    }
    onApply(result.draft);
    setState("proposal_ready");
    setMessage(CREATE_COPILOT.applied);
  }

  const proposal = response?.proposal ?? null;
  const busy = state === "generating";

  return (
    <Card className="mb-6 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
        PREMIFLOW Copilot
      </p>
      <h2 className="mt-1 font-display text-2xl">{CREATE_COPILOT.title}</h2>
      <p className="mt-1 text-sm text-ink-soft">{CREATE_COPILOT.subtitle}</p>
      <p className="mt-2 text-xs text-ink-faint">{CREATE_COPILOT.neverCreates}</p>

      <div className="mt-4">
        <Field label="Job description">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={CREATE_COPILOT.placeholder}
            maxLength={2000}
            rows={3}
            disabled={busy}
          />
        </Field>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={() => void generate()} disabled={busy || prompt.trim().length === 0}>
          {busy ? CREATE_COPILOT.generating : CREATE_COPILOT.generate}
        </Button>
        {proposal ? (
          <Button variant="secondary" onClick={apply} disabled={busy}>
            {CREATE_COPILOT.apply}
          </Button>
        ) : null}
      </div>

      {message ? (
        <p
          className={`mt-3 text-sm ${
            state === "error" || state === "rate_limited" || state === "validation_warning"
              ? "text-danger"
              : "text-ink-soft"
          }`}
        >
          {message}
        </p>
      ) : null}

      {proposal ? <ProposalPreview proposal={proposal} source={response?.source} /> : null}
    </Card>
  );
}

function ProposalPreview({
  proposal,
  source,
}: {
  proposal: CopilotCreateProposal;
  source?: CopilotResponse["source"];
}) {
  return (
    <div className="mt-4 space-y-3 rounded-2xl border border-line bg-paper-2 px-4 py-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
          Recommended type
        </p>
        <p className="mt-1 font-medium text-ink">{presentType(proposal.paymentMode)}</p>
        {source === "deterministic" ? (
          <p className="mt-1 text-xs text-ink-faint">Conservative suggestion · not a live model</p>
        ) : null}
      </div>
      <p className="text-sm text-ink-soft">{proposal.rationale}</p>
      <ProposalTerms proposal={proposal} />
      {proposal.assumptions.length > 0 ? (
        <List heading="Assumptions" items={proposal.assumptions} />
      ) : null}
      {proposal.warnings.length > 0 ? (
        <List heading="Warnings" items={proposal.warnings} />
      ) : null}
    </div>
  );
}

function ProposalTerms({ proposal }: { proposal: CopilotCreateProposal }) {
  const rows: Array<[string, string]> = [
    ["Trial", proposal.trialEnabled ? "Paid trial suggested" : "No trial"],
    [
      "Duration",
      proposal.durationSeconds
        ? `${Math.round(proposal.durationSeconds / 86_400)} days`
        : proposal.engagementDurationValue
          ? `${proposal.engagementDurationValue} ${proposal.engagementDurationUnit ?? "days"}`
          : "Review in wizard",
    ],
    ["Review window", `${proposal.reviewDuration}s`],
    ["Activation review", `${proposal.activationReviewDuration}s`],
    ["Revisions", String(proposal.maxRevisions)],
  ];
  if (proposal.paymentMode === "Milestone" && proposal.milestones.length > 0) {
    rows.push(["Milestones", String(proposal.milestones.length)]);
  }
  if (proposal.title) rows.unshift(["Title", proposal.title]);
  return (
    <dl className="grid gap-2 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs text-ink-faint">{label}</dt>
          <dd className="text-sm text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function List({ heading, items }: { heading: string; items: string[] }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
        {heading}
      </p>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink-soft">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
