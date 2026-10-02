"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import {
  amountLabel,
  baseUnitsToUi,
  marketplaceErrorMessage,
} from "@/lib/app/marketplace";
import { editJob, fetchJobDetail, postJob, type JobInput } from "@/lib/app/marketplace-client";
import { lockedCreatePayment } from "@/lib/app/premiflow";
import { useMarketplaceQuery, useMarketplaceSession } from "@/lib/hooks/useMarketplace";
import { uiAmountToBaseUnits } from "@/lib/streampay-v2";
import type { PublicJob } from "@/lib/server/marketplace/service";

import { MarketplaceHeader } from "./MarketplaceParts";

type FormState = {
  title: string;
  description: string;
  paymentMode: PublicJob["paymentMode"];
  amountUi: string;
};

const EMPTY_FORM: FormState = { title: "", description: "", paymentMode: "Fixed", amountUi: "" };
const MODES: PublicJob["paymentMode"][] = ["Fixed", "Milestone", "Streaming", "Hourly"];

export function MarketplaceJobForm({ jobId }: { jobId?: string }) {
  const router = useRouter();
  const session = useMarketplaceSession();
  const locked = lockedCreatePayment();
  const query = useMarketplaceQuery(jobId ? `job-edit:${jobId}` : null, () =>
    fetchJobDetail(jobId as string)
  );
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loaded = query.status === "ready" ? query.data : null;
  const current: FormState =
    form ??
    (loaded
      ? {
          title: loaded.job.title,
          description: loaded.job.description,
          paymentMode: loaded.job.paymentMode,
          amountUi: baseUnitsToUi(loaded.job.budgetAmount, locked.decimals),
        }
      : EMPTY_FORM);

  function update(patch: Partial<FormState>) {
    setForm({ ...current, ...patch });
  }

  async function submit() {
    setBusy(true);
    setNotice(null);
    try {
      const input: JobInput = {
        title: current.title,
        description: current.description,
        paymentMode: current.paymentMode,
        budgetAmount: uiAmountToBaseUnits(current.amountUi, locked.decimals).toString(),
      };
      await session.ensure();
      const saved = jobId ? await editJob(jobId, input) : await postJob(input);
      router.push(`/marketplace/jobs/${saved.job.id}`);
    } catch (err) {
      setNotice(marketplaceErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const editing = Boolean(jobId);
  const blocked =
    editing && loaded
      ? loaded.viewerRole !== "owner"
        ? "Only the job owner can edit this job. Verify the owner wallet first."
        : loaded.job.status !== "open"
          ? "Only open jobs can be edited."
          : null
      : null;

  return (
    <div className="min-w-0 space-y-4">
      <MarketplaceHeader
        title={editing ? "Edit job" : "Post a job"}
        subtitle="Describe the work. Freelancers send proposals off-chain; you choose one, then create and fund the contract on-chain."
      />
      {editing && query.status !== "ready" ? (
        <Card className="p-4 text-sm text-ink-soft">
          {query.status === "error" ? query.error.message : "Loading job..."}
        </Card>
      ) : blocked ? (
        <Card className="p-4 text-sm text-ink-soft">{blocked}</Card>
      ) : (
        <Card className="min-w-0 space-y-3 p-4">
          <Field label="Title">
            <Input
              value={current.title}
              maxLength={120}
              onChange={(e) => update({ title: e.target.value })}
            />
          </Field>
          <Field label="Description">
            <Textarea
              value={current.description}
              maxLength={4000}
              rows={6}
              onChange={(e) => update({ description: e.target.value })}
            />
          </Field>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <Field label="Payment mode">
              <Select
                value={current.paymentMode}
                onChange={(e) =>
                  update({ paymentMode: e.target.value as PublicJob["paymentMode"] })
                }
              >
                {MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={`${amountLabel(current.paymentMode)} (${locked.tokenName})`}>
              <Input
                inputMode="decimal"
                value={current.amountUi}
                onChange={(e) => update({ amountUi: e.target.value })}
              />
            </Field>
          </div>
          {notice ? <p className="text-sm text-danger">{notice}</p> : null}
          <div className="flex flex-wrap gap-2 max-sm:flex-col max-sm:items-stretch">
            <Button onClick={() => void submit()} disabled={busy || !session.wallet}>
              {editing ? "Save changes" : "Post job"}
            </Button>
            {!session.wallet ? (
              <p className="self-center text-xs text-ink-faint">Connect your wallet to post.</p>
            ) : null}
          </div>
        </Card>
      )}
    </div>
  );
}
