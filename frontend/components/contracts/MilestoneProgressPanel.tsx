import { Check, Circle, CircleDot, Clock3, Gavel, Send, Undo2, XCircle } from "lucide-react";

import { Card } from "@/components/ui/Card";
import { formatUnix } from "@/lib/app/datetime";
import { formatTokenAmount } from "@/lib/app/money";
import { milestoneProgress, type MilestoneStepState } from "@/lib/app/milestone-progress";
import type { ContractView, WorkUnitView } from "@/lib/streampay-v2";

const STATE_STYLE: Record<MilestoneStepState, { dot: string; pill: string }> = {
  completed: { dot: "bg-ok text-white", pill: "bg-[color-mix(in_srgb,var(--ok)_14%,white)] text-ok" },
  current: { dot: "bg-accent text-white ring-4 ring-accent/20", pill: "bg-accent/10 text-accent" },
  submitted: { dot: "bg-[#4f8cff] text-white ring-4 ring-[#4f8cff]/20", pill: "bg-[#4f8cff]/10 text-[#2f5fd0]" },
  revising: { dot: "bg-gold text-white ring-4 ring-gold/25", pill: "bg-gold/15 text-ink" },
  upcoming: { dot: "border border-line bg-card text-ink-faint", pill: "bg-paper-2 text-ink-faint" },
  void: { dot: "bg-paper-2 text-ink-faint", pill: "bg-paper-2 text-ink-faint line-through" },
  disputed: { dot: "bg-danger text-white", pill: "bg-danger/10 text-danger" },
};

function StateIcon({ state }: { state: MilestoneStepState }) {
  const props = { size: 14, "aria-hidden": true } as const;
  switch (state) {
    case "completed":
      return <Check {...props} />;
    case "current":
      return <CircleDot {...props} />;
    case "submitted":
      return <Send {...props} />;
    case "revising":
      return <Undo2 {...props} />;
    case "void":
      return <XCircle {...props} />;
    case "disputed":
      return <Gavel {...props} />;
    default:
      return <Circle {...props} />;
  }
}

/** Visual milestone timeline from real contract + work-unit data only. */
export function MilestoneProgressPanel({
  contract,
  units,
  decimals,
}: {
  contract: ContractView;
  units: readonly WorkUnitView[];
  decimals?: number;
}) {
  const model = milestoneProgress(contract, units);
  if (model.steps.length === 0) return null;
  const width = `${Math.min(100, Math.max(0, model.releasedPct))}%`;
  return (
    <Card className="min-w-0 overflow-hidden p-0" id="milestone-progress">
      <div className="bg-[radial-gradient(120%_160%_at_0%_0%,rgba(46,230,214,.16),transparent_55%),radial-gradient(120%_160%_at_100%_0%,rgba(139,123,255,.14),transparent_55%)] px-4 pb-4 pt-4 sm:px-5">
        <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.16em] text-ink-faint">Milestone progress</p>
            <h2 className="mt-1 font-display text-xl">
              {model.completedCount} of {model.steps.length - model.voidCount} released
            </h2>
          </div>
          <div className="text-right">
            <p className="font-display text-2xl tabular-nums text-ink">{model.releasedPct}%</p>
            <p className="text-xs text-ink-faint">of contract value released</p>
          </div>
        </div>
        <div
          className="mt-3 h-2 overflow-hidden rounded-full bg-paper-2"
          role="progressbar"
          aria-label="Contract value released"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={model.releasedPct}
        >
          <div className="h-full rounded-full bg-[linear-gradient(90deg,#12c2b8,#4f8cff_60%,#8b7bff)]" style={{ width }} />
        </div>
        <p className="mt-2 text-xs text-ink-soft">
          {formatTokenAmount(model.contractReleased, decimals)} released of{" "}
          {formatTokenAmount(model.contractTotal, decimals)} total contract value
        </p>
      </div>
      <ol className="relative min-w-0 px-4 pb-4 pt-2 sm:px-5" aria-label="Milestone timeline">
        {model.steps.map((step, i) => {
          const style = STATE_STYLE[step.state];
          const last = i === model.steps.length - 1;
          return (
            <li key={step.index} className="relative flex min-w-0 gap-3 pb-4 last:pb-0">
              {!last ? (
                <span
                  aria-hidden="true"
                  className={`absolute left-[13px] top-7 h-[calc(100%-1.25rem)] w-px ${
                    step.state === "completed" ? "bg-ok/50" : "bg-line"
                  }`}
                />
              ) : null}
              <span className={`relative z-10 mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full ${style.dot}`}>
                <StateIcon state={step.state} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <p className="min-w-0 font-semibold text-ink">
                    {step.label}
                    <span className="ml-2 font-normal tabular-nums text-ink-soft">
                      {formatTokenAmount(step.amount, decimals)}
                    </span>
                  </p>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${style.pill}`}>{step.stateLabel}</span>
                </div>
                <dl className="mt-1 flex min-w-0 flex-wrap gap-x-4 gap-y-0.5 text-xs text-ink-faint">
                  {step.dueAt ? (
                    <div className="flex items-center gap-1">
                      <dt className="inline-flex items-center gap-1">
                        <Clock3 size={12} aria-hidden="true" />
                        Due
                      </dt>
                      <dd>{formatUnix(step.dueAt)}</dd>
                    </div>
                  ) : null}
                  {step.submittedAt && step.state !== "completed" && step.state !== "void" ? (
                    <div className="flex gap-1">
                      <dt>Submitted</dt>
                      <dd>{formatUnix(step.submittedAt)}</dd>
                    </div>
                  ) : null}
                  {step.reviewEndsAt ? (
                    <div className="flex gap-1">
                      <dt>Review window ends</dt>
                      <dd>{formatUnix(step.reviewEndsAt)}</dd>
                    </div>
                  ) : null}
                  {step.maxRevisions > 0 ? (
                    <div className="flex gap-1">
                      <dt>Revisions</dt>
                      <dd className="tabular-nums">
                        {step.revisionsUsed}/{step.maxRevisions}
                      </dd>
                    </div>
                  ) : null}
                  {step.state === "completed" ? (
                    <div className="flex gap-1">
                      <dt>Released</dt>
                      <dd>
                        {formatTokenAmount(step.releasedAmount, decimals)}
                        {step.releasedAt ? ` on ${formatUnix(step.releasedAt)}` : ""}
                        {step.releasedVia ? ` (${step.releasedVia})` : ""}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
