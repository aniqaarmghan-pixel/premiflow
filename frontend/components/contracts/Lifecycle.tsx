"use client";

import { lifecycleStages, type LifecycleStage } from "@/lib/app/view-model";
import type { ContractView } from "@/lib/streampay-v2";

function dot(state: LifecycleStage["state"]) {
  if (state === "done") return "bg-accent";
  if (state === "current") return "bg-gold";
  if (state === "blocked") return "bg-danger";
  return "bg-line";
}

function stageCaption(state: LifecycleStage["state"]): string {
  if (state === "done") return "Done";
  if (state === "current") return "Current";
  if (state === "blocked") return "Blocked";
  return "Upcoming";
}

export function Lifecycle({ contract }: { contract: ContractView }) {
  const stages = lifecycleStages(contract);
  return (
    <div className="@container">
    <ol className="grid grid-cols-2 gap-x-3 gap-y-2.5 @md:grid-cols-4 @3xl:grid-cols-7">
      {stages.map((stage, i) => (
        <li key={stage.id} className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${dot(stage.state)} ${stage.state === "current" ? "pf-node-core" : ""}`} />
            {i < stages.length - 1 ? <span className="h-px flex-1 bg-line" /> : null}
          </div>
          <p className="mt-2 truncate text-xs font-medium text-ink">{stage.label}</p>
          <p className="text-[11px] text-ink-faint">{stageCaption(stage.state)}</p>
        </li>
      ))}
    </ol>
    </div>
  );
}
