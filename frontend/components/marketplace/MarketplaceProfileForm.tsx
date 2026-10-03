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

import {
  PROFILE_PHOTO_COPY,
  PROFILE_VS_GIG_COPY,
  profilePhotoUrlError,
} from "@/lib/app/profile-identity";

import { Avatar, MarketplaceHeader, QueryState } from "./MarketplaceParts";

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
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <Link href={profileHref(query.data.wallet)} className="text-sm font-medium text-accent underline">
              View public profile
            </Link>
            <Link href="/marketplace/my-gigs" className="text-sm font-medium text-accent underline">
              Manage my gigs
            </Link>
          </div>
          <ProfileVsGigNote />
          <ProfilePhotoField
            url={current.avatarUrl}
            name={current.displayName}
            wallet={query.data.wallet}
            onChange={(avatarUrl) => update({ avatarUrl })}
          />
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <Field label="Your name or business name">
              <Input value={current.displayName} maxLength={60} onChange={(e) => update({ displayName: e.target.value })} />
            </Field>
            <Field label="Professional headline">
              <Input
                value={current.headline}
                maxLength={120}
                placeholder="e.g. Solana smart contract engineer"
                onChange={(e) => update({ headline: e.target.value })}
              />
            </Field>
          </div>
          <Field label="About you">
            <Textarea
              value={current.bio}
              maxLength={2000}
              rows={5}
              placeholder="Who you are, what you are great at and how you like to work."
              onChange={(e) => update({ bio: e.target.value })}
            />
          </Field>
          <Field label="Skills (separate with commas, up to 15)">
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
          <Button onClick={() => void submit()} disabled={busy || profilePhotoUrlError(current.avatarUrl) !== null}>
            Save profile
          </Button>
        </Card>
      )}
    </div>
  );
}

function ProfileVsGigNote() {
  return (
    <section
      aria-label={PROFILE_VS_GIG_COPY.title}
      className="grid min-w-0 gap-2 rounded-2xl border border-line bg-paper p-3 text-xs leading-5 text-ink-soft sm:grid-cols-2"
    >
      <p className="min-w-0">
        <span className="block font-semibold text-ink">Profile</span>
        {PROFILE_VS_GIG_COPY.profile}
      </p>
      <p className="min-w-0">
        <span className="block font-semibold text-ink">Gigs</span>
        {PROFILE_VS_GIG_COPY.gig}
      </p>
    </section>
  );
}

/** Friendly photo UX over the existing https avatarUrl field (no upload backend). */
function ProfilePhotoField({
  url,
  name,
  wallet,
  onChange,
}: {
  url: string;
  name: string;
  wallet: string;
  onChange: (url: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const value = url.trim();
  const error = profilePhotoUrlError(value);
  const showInput = editing || error !== null;
  return (
    <section
      aria-labelledby="pf-profile-photo-title"
      className="flex min-w-0 flex-col gap-3 rounded-2xl border border-line p-3 sm:flex-row sm:items-start"
    >
      <span className="rounded-full border-4 border-paper-2">
        <Avatar url={value && !error ? value : null} name={name} wallet={wallet} size={72} />
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="min-w-0">
          <p id="pf-profile-photo-title" className="text-sm font-semibold text-ink">
            {PROFILE_PHOTO_COPY.title}
          </p>
          <p className="text-xs leading-5 text-ink-soft">{PROFILE_PHOTO_COPY.help}</p>
        </div>
        {showInput ? (
          <Field label={PROFILE_PHOTO_COPY.linkLabel}>
            <Input
              type="url"
              value={url}
              maxLength={500}
              placeholder="https://example.com/photo.jpg"
              aria-invalid={error ? true : undefined}
              onChange={(e) => onChange(e.target.value)}
            />
          </Field>
        ) : null}
        {error ? (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        ) : null}
        <div className="flex min-w-0 flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setEditing((v) => !v)}>
            {showInput && editing ? PROFILE_PHOTO_COPY.done : value ? PROFILE_PHOTO_COPY.change : PROFILE_PHOTO_COPY.add}
          </Button>
          {value ? (
            <Button
              variant="ghost"
              onClick={() => {
                onChange("");
                setEditing(false);
              }}
            >
              {PROFILE_PHOTO_COPY.remove}
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
