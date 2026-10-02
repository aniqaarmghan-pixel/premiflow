"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import {
  amountLabel,
  baseUnitsToUi,
  gigHref,
  marketplaceErrorMessage,
  splitSkills,
} from "@/lib/app/marketplace";
import { createGig, editGig, fetchGigDetail, type GigInput } from "@/lib/app/marketplace-client";
import { lockedCreatePayment } from "@/lib/app/premiflow";
import { useMarketplaceQuery, useMarketplaceSession } from "@/lib/hooks/useMarketplace";
import { uiAmountToBaseUnits } from "@/lib/streampay-v2";
import type { PublicGig } from "@/lib/server/marketplace/catalog-service";

import { MarketplaceHeader } from "./MarketplaceParts";

type FormState = {
  title: string;
  description: string;
  skills: string;
  paymentMode: PublicGig["paymentMode"];
  amountUi: string;
};

const EMPTY_FORM: FormState = {
  title: "",
  description: "",
  skills: "",
  paymentMode: "Fixed",
  amountUi: "",
};
const MODES: PublicGig["paymentMode"][] = ["Fixed", "Milestone", "Streaming", "Hourly"];

export function MarketplaceGigForm({ gigId }: { gigId?: string }) {
  const router = useRouter();
  const session = useMarketplaceSession();
  const locked = lockedCreatePayment();
  const query = useMarketplaceQuery(gigId ? `gig-edit:${gigId}:${session.wallet ?? ""}` : null, () =>
    fetchGigDetail(gigId as string)
  );
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loaded = query.status === "ready" ? query.data : null;
  const current: FormState =
    form ??
    (loaded
      ? {
          title: loaded.gig.title,
          description: loaded.gig.description,
          skills: loaded.gig.skills.join(", "),
          paymentMode: loaded.gig.paymentMode,
          amountUi: baseUnitsToUi(loaded.gig.priceAmount, locked.decimals),
        }
      : EMPTY_FORM);

  function update(patch: Partial<FormState>) {
    setForm({ ...current, ...patch });
  }

  async function submit() {
    setBusy(true);
    setNotice(null);
    try {
      const input: GigInput = {
        title: current.title,
        description: current.description,
        skills: splitSkills(current.skills),
        paymentMode: current.paymentMode,
        priceAmount: uiAmountToBaseUnits(current.amountUi, locked.decimals).toString(),
      };
      await session.ensure();
      const saved = gigId ? await editGig(gigId, input) : await createGig(input);
      router.push(gigHref(saved.gig.id));
    } catch (err) {
      setNotice(marketplaceErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const editing = Boolean(gigId);
  const blocked =
    editing && loaded && loaded.viewerRole !== "owner"
      ? "Only the gig owner can edit this gig. Verify the owner wallet first."
      : null;

  return (
    <div className="min-w-0 space-y-4">
      <MarketplaceHeader
        title={editing ? "Edit gig" : "Offer a gig"}
        subtitle="Describe a service you offer. Employers hire it through Create contract; escrow is created and funded on-chain by the employer."
      />
      {editing && query.status !== "ready" ? (
        <Card className="p-4 text-sm text-ink-soft">
          {query.status === "error" ? query.error.message : "Loading gig..."}
        </Card>
      ) : blocked ? (
        <Card className="p-4 text-sm text-ink-soft">{blocked}</Card>
      ) : (
        <Card className="min-w-0 space-y-3 p-4">
          <Field label="Title">
            <Input value={current.title} maxLength={120} onChange={(e) => update({ title: e.target.value })} />
          </Field>
          <Field label="Description">
            <Textarea
              value={current.description}
              maxLength={4000}
              rows={6}
              onChange={(e) => update({ description: e.target.value })}
            />
          </Field>
          <Field label="Skills (comma separated, up to 10)">
            <Input value={current.skills} maxLength={400} onChange={(e) => update({ skills: e.target.value })} />
          </Field>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <Field label="Payment mode">
              <Select
                value={current.paymentMode}
                onChange={(e) => update({ paymentMode: e.target.value as PublicGig["paymentMode"] })}
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
              {editing ? "Save changes" : "Create gig"}
            </Button>
            {!session.wallet ? (
              <p className="self-center text-xs text-ink-faint">Connect your wallet to continue.</p>
            ) : null}
          </div>
        </Card>
      )}
    </div>
  );
}
