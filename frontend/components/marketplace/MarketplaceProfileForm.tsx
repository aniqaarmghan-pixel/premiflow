"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import {
  AVAILABILITY_LABELS,
  PROFILE_COPY,
  baseUnitsToUi,
  marketplaceErrorMessage,
  profileHref,
  splitSkills,
} from "@/lib/app/marketplace";
import { fetchMyProfile, saveMyProfile, type ProfileInput } from "@/lib/app/marketplace-client";
import { lockedCreatePayment } from "@/lib/app/premiflow";
import { useMarketplaceQuery, useMarketplaceSession } from "@/lib/hooks/useMarketplace";
import { uiAmountToBaseUnits } from "@/lib/streampay-v2";
import type { PublicProfile } from "@/lib/server/marketplace/catalog-service";

import { MarketplaceHeader, QueryState } from "./MarketplaceParts";

type PortfolioRow = { title: string; url: string; description: string };
type FormState = {
  displayName: string;
  avatarUrl: string;
  headline: string;
  bio: string;
  skills: string;
  rateUi: string;
  availability: PublicProfile["availability"];
  portfolio: PortfolioRow[];
};

const MAX_PORTFOLIO = 6;
const AVAILABILITY = Object.keys(AVAILABILITY_LABELS) as PublicProfile["availability"][];

function toForm(profile: PublicProfile | null, decimals: number): FormState {
  return {
    displayName: profile?.displayName ?? "",
    avatarUrl: profile?.avatarUrl ?? "",
    headline: profile?.headline ?? "",
    bio: profile?.bio ?? "",
    skills: profile?.skills.join(", ") ?? "",
    rateUi: profile?.rateAmount ? baseUnitsToUi(profile.rateAmount, decimals) : "",
    availability: profile?.availability ?? "available",
    portfolio: profile?.portfolio.map((p) => ({ ...p })) ?? [],
  };
}

export function MarketplaceProfileForm() {
  const session = useMarketplaceSession();
  const locked = lockedCreatePayment();
  const query = useMarketplaceQuery(session.wallet ? `my-profile:${session.wallet}` : null, fetchMyProfile);
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const loaded = query.status === "ready" ? query.data : null;
  const current: FormState = form ?? toForm(loaded?.profile ?? null, locked.decimals);

  function update(patch: Partial<FormState>) {
    setForm({ ...current, ...patch });
  }
  function updateRow(index: number, patch: Partial<PortfolioRow>) {
    update({ portfolio: current.portfolio.map((row, i) => (i === index ? { ...row, ...patch } : row)) });
  }

  async function verify() {
    setBusy(true);
    try {
      await session.ensure();
      query.reload();
    } catch (err) {
      setNotice({ ok: false, text: marketplaceErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setBusy(true);
    setNotice(null);
    try {
      const input: ProfileInput = {
        displayName: current.displayName,
        avatarUrl: current.avatarUrl.trim(),
        headline: current.headline,
        bio: current.bio,
        skills: splitSkills(current.skills),
        rateAmount: current.rateUi.trim()
          ? uiAmountToBaseUnits(current.rateUi.trim(), locked.decimals).toString()
          : "",
        availability: current.availability,
        portfolio: current.portfolio.map((row) => ({
          title: row.title,
          url: row.url.trim(),
          description: row.description,
        })),
      };
      await session.ensure();
      await saveMyProfile(input);
      setForm(null);
      query.reload();
      setNotice({ ok: true, text: PROFILE_COPY.saved });
    } catch (err) {
      setNotice({ ok: false, text: marketplaceErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-w-0 space-y-4">
      <MarketplaceHeader title={PROFILE_COPY.editTitle} subtitle={PROFILE_COPY.editSubtitle} />
      {query.status !== "ready" ? (
        <QueryState
          status={query.status}
          error={query.status === "error" ? query.error : undefined}
          wallet={session.wallet}
          verifying={busy}
          onRetry={query.reload}
          onVerify={() => void verify()}
        />
      ) : (
        <Card className="min-w-0 space-y-3 p-4">
          <Link href={profileHref(query.data.wallet)} className="text-sm font-medium text-accent underline">
            View public profile
          </Link>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <Field label="Display name">
              <Input value={current.displayName} maxLength={60} onChange={(e) => update({ displayName: e.target.value })} />
            </Field>
            <Field label="Avatar URL (https)">
              <Input
                type="url"
                value={current.avatarUrl}
                maxLength={500}
                placeholder="https://"
                onChange={(e) => update({ avatarUrl: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Headline">
            <Input value={current.headline} maxLength={120} onChange={(e) => update({ headline: e.target.value })} />
          </Field>
          <Field label="Bio">
            <Textarea value={current.bio} maxLength={2000} rows={5} onChange={(e) => update({ bio: e.target.value })} />
          </Field>
          <Field label="Skills (comma separated, up to 15)">
            <Input value={current.skills} maxLength={600} onChange={(e) => update({ skills: e.target.value })} />
          </Field>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <Field label={`Hourly rate (${locked.tokenName}, optional)`}>
              <Input inputMode="decimal" value={current.rateUi} onChange={(e) => update({ rateUi: e.target.value })} />
            </Field>
            <Field label="Availability">
              <Select
                value={current.availability}
                onChange={(e) => update({ availability: e.target.value as PublicProfile["availability"] })}
              >
                {AVAILABILITY.map((a) => (
                  <option key={a} value={a}>
                    {AVAILABILITY_LABELS[a]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <fieldset className="min-w-0 space-y-3">
            <legend className="text-sm font-semibold text-ink">Portfolio (up to {MAX_PORTFOLIO})</legend>
            {current.portfolio.map((row, index) => (
              <div key={index} className="min-w-0 space-y-2 rounded-xl border border-line p-3">
                <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                  <Field label="Title">
                    <Input value={row.title} maxLength={80} onChange={(e) => updateRow(index, { title: e.target.value })} />
                  </Field>
                  <Field label="URL (https)">
                    <Input
                      type="url"
                      value={row.url}
                      maxLength={500}
                      onChange={(e) => updateRow(index, { url: e.target.value })}
                    />
                  </Field>
                </div>
                <Field label="Description">
                  <Input
                    value={row.description}
                    maxLength={300}
                    onChange={(e) => updateRow(index, { description: e.target.value })}
                  />
                </Field>
                <Button
                  variant="ghost"
                  onClick={() => update({ portfolio: current.portfolio.filter((_, i) => i !== index) })}
                >
                  Remove item
                </Button>
              </div>
            ))}
            {current.portfolio.length < MAX_PORTFOLIO ? (
              <Button
                variant="secondary"
                onClick={() =>
                  update({ portfolio: [...current.portfolio, { title: "", url: "", description: "" }] })
                }
              >
                Add portfolio item
              </Button>
            ) : null}
          </fieldset>

          {notice ? (
            <p className={`text-sm ${notice.ok ? "text-ink-soft" : "text-danger"}`} aria-live="polite">
              {notice.text}
            </p>
          ) : null}
          <Button onClick={() => void submit()} disabled={busy}>
            Save profile
          </Button>
        </Card>
      )}
    </div>
  );
}
