"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { MARKETPLACE_CATEGORIES } from "@/lib/app/marketplace-categories";
import {
  PACKAGE_TIER_LABELS,
  amountLabel,
  baseUnitsToUi,
  gigHref,
  marketplaceErrorMessage,
  splitLines,
  splitSkills,
} from "@/lib/app/marketplace";
import { createGig, editGig, fetchGigDetail, type GigInput } from "@/lib/app/marketplace-client";
import { GIG_VIDEO_HELP, gigVideoKindLabel, parseGigVideo } from "@/lib/app/video-embed";
import { GigVideoPreview } from "./MarketplaceVideoModal";
import { lockedCreatePayment } from "@/lib/app/premiflow";
import { useMarketplaceQuery, useMarketplaceSession } from "@/lib/hooks/useMarketplace";
import { uiAmountToBaseUnits } from "@/lib/streampay-v2";
import type { PublicGig } from "@/lib/server/marketplace/catalog-service";
import type { GigPackage, PackageTier } from "@/lib/server/marketplace/store";

import { MarketplaceHeader } from "./MarketplaceParts";

type PackageForm = {
  enabled: boolean;
  title: string;
  description: string;
  priceUi: string;
  deliveryDays: string;
  revisions: string;
};

type FormState = {
  title: string;
  description: string;
  skills: string;
  category: "" | NonNullable<PublicGig["category"]>;
  paymentMode: PublicGig["paymentMode"];
  amountUi: string;
  coverUrl: string;
  media: string;
  videoUrl: string;
  deliveryDays: string;
  packages: Record<PackageTier, PackageForm>;
};

const TIERS: PackageTier[] = ["basic", "standard", "premium"];
const EMPTY_PACKAGE: PackageForm = {
  enabled: false,
  title: "",
  description: "",
  priceUi: "",
  deliveryDays: "",
  revisions: "0",
};

function emptyPackages(): Record<PackageTier, PackageForm> {
  return { basic: { ...EMPTY_PACKAGE }, standard: { ...EMPTY_PACKAGE }, premium: { ...EMPTY_PACKAGE } };
}

const EMPTY_FORM: FormState = {
  title: "",
  description: "",
  skills: "",
  category: "",
  paymentMode: "Fixed",
  amountUi: "",
  coverUrl: "",
  media: "",
  videoUrl: "",
  deliveryDays: "",
  packages: emptyPackages(),
};
const MODES: PublicGig["paymentMode"][] = ["Fixed", "Milestone", "Streaming", "Hourly"];

function fromGig(gig: PublicGig, decimals: number): FormState {
  const packages = emptyPackages();
  for (const p of gig.packages ?? []) {
    packages[p.tier] = {
      enabled: true,
      title: p.title,
      description: p.description,
      priceUi: baseUnitsToUi(p.priceAmount, decimals),
      deliveryDays: String(p.deliveryDays),
      revisions: String(p.revisions),
    };
  }
  return {
    title: gig.title,
    description: gig.description,
    skills: gig.skills.join(", "),
    category: gig.category ?? "",
    paymentMode: gig.paymentMode,
    amountUi: baseUnitsToUi(gig.priceAmount, decimals),
    coverUrl: gig.coverUrl ?? "",
    media: (gig.media ?? []).join("\n"),
    videoUrl: gig.videoUrl ?? "",
    deliveryDays: gig.deliveryDays ? String(gig.deliveryDays) : "",
    packages,
  };
}

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
  const current: FormState = form ?? (loaded ? fromGig(loaded.gig, locked.decimals) : EMPTY_FORM);
  const usingPackages = TIERS.some((tier) => current.packages[tier].enabled);

  function update(patch: Partial<FormState>) {
    setForm({ ...current, ...patch });
  }

  function updatePackage(tier: PackageTier, patch: Partial<PackageForm>) {
    setForm({ ...current, packages: { ...current.packages, [tier]: { ...current.packages[tier], ...patch } } });
  }

  async function submit() {
    setBusy(true);
    setNotice(null);
    try {
      const packages: GigPackage[] = TIERS.filter((tier) => current.packages[tier].enabled).map((tier) => {
        const p = current.packages[tier];
        return {
          tier,
          title: p.title,
          description: p.description,
          priceAmount: uiAmountToBaseUnits(p.priceUi, locked.decimals).toString(),
          deliveryDays: Number(p.deliveryDays),
          revisions: p.revisions === "" ? 0 : Number(p.revisions),
        };
      });
      const input: GigInput = {
        title: current.title,
        description: current.description,
        skills: splitSkills(current.skills),
        category: current.category === "" ? null : current.category,
        paymentMode: current.paymentMode,
        // With packages the server derives the listed price from the lowest package.
        priceAmount:
          packages.length > 0 ? packages[0].priceAmount : uiAmountToBaseUnits(current.amountUi, locked.decimals).toString(),
        coverUrl: current.coverUrl.trim(),
        media: splitLines(current.media),
        videoUrl: current.videoUrl.trim(),
        deliveryDays: current.deliveryDays.trim() === "" ? null : Number(current.deliveryDays),
        packages,
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
        <div className="min-w-0 space-y-4">
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
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <Field label="Skills (comma separated, up to 10)">
                <Input value={current.skills} maxLength={400} onChange={(e) => update({ skills: e.target.value })} />
              </Field>
              <Field label="Category (optional)">
                <Select
                  value={current.category}
                  onChange={(e) => update({ category: e.target.value as FormState["category"] })}
                >
                  <option value="">Detect from title and skills</option>
                  {MARKETPLACE_CATEGORIES.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="grid min-w-0 gap-3 sm:grid-cols-3">
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
                  disabled={usingPackages}
                  placeholder={usingPackages ? "Set by packages" : undefined}
                  onChange={(e) => update({ amountUi: e.target.value })}
                />
              </Field>
              <Field label="Delivery days (optional)">
                <Input
                  inputMode="numeric"
                  value={current.deliveryDays}
                  maxLength={3}
                  onChange={(e) => update({ deliveryDays: e.target.value })}
                />
              </Field>
            </div>
          </Card>

          <Card className="min-w-0 space-y-3 p-4">
            <h2 className="text-sm font-semibold text-ink">Media (optional)</h2>
            <p className="text-xs text-ink-faint">
              Link only images and video you own or have rights to. https links only; nothing is uploaded or copied.
            </p>
            <Field label="Cover image URL">
              <Input
                value={current.coverUrl}
                maxLength={500}
                placeholder="https://"
                onChange={(e) => update({ coverUrl: e.target.value })}
              />
            </Field>
            <Field label="Gallery image URLs (one per line, up to 6)">
              <Textarea value={current.media} rows={3} onChange={(e) => update({ media: e.target.value })} />
            </Field>
            <Field label="Video (YouTube, Vimeo or direct .mp4 / .webm)">
              <Input
                value={current.videoUrl}
                maxLength={500}
                inputMode="url"
                placeholder="https://www.youtube.com/watch?v=..."
                aria-describedby="gig-video-help"
                onChange={(e) => update({ videoUrl: e.target.value })}
              />
            </Field>
            <VideoFieldHelp title={current.title} videoUrl={current.videoUrl} coverUrl={current.coverUrl} />
          </Card>

          <Card className="min-w-0 space-y-3 p-4">
            <h2 className="text-sm font-semibold text-ink">Packages (optional)</h2>
            <p className="text-xs text-ink-faint">
              Offer up to three tiers. When any package is on, the listed price is the lowest package price.
            </p>
            <div className="grid min-w-0 gap-3 lg:grid-cols-3">
              {TIERS.map((tier) => {
                const p = current.packages[tier];
                return (
                  <div key={tier} className="min-w-0 space-y-2 rounded-[var(--radius)] border border-line p-3">
                    <label className="flex items-center gap-2 text-sm font-semibold text-ink">
                      <input
                        type="checkbox"
                        checked={p.enabled}
                        onChange={(e) => updatePackage(tier, { enabled: e.target.checked })}
                      />
                      {PACKAGE_TIER_LABELS[tier]}
                    </label>
                    {p.enabled ? (
                      <div className="min-w-0 space-y-2">
                        <Field label="Name (optional)">
                          <Input
                            value={p.title}
                            maxLength={60}
                            onChange={(e) => updatePackage(tier, { title: e.target.value })}
                          />
                        </Field>
                        <Field label="Scope">
                          <Textarea
                            value={p.description}
                            maxLength={300}
                            rows={3}
                            onChange={(e) => updatePackage(tier, { description: e.target.value })}
                          />
                        </Field>
                        <Field label={`Price (${locked.tokenName})`}>
                          <Input
                            inputMode="decimal"
                            value={p.priceUi}
                            onChange={(e) => updatePackage(tier, { priceUi: e.target.value })}
                          />
                        </Field>
                        <div className="grid grid-cols-2 gap-2">
                          <Field label="Days">
                            <Input
                              inputMode="numeric"
                              value={p.deliveryDays}
                              maxLength={3}
                              onChange={(e) => updatePackage(tier, { deliveryDays: e.target.value })}
                            />
                          </Field>
                          <Field label="Revisions">
                            <Input
                              inputMode="numeric"
                              value={p.revisions}
                              maxLength={2}
                              onChange={(e) => updatePackage(tier, { revisions: e.target.value })}
                            />
                          </Field>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </Card>

          {notice ? <p className="text-sm text-danger">{notice}</p> : null}
          <div className="flex flex-wrap gap-2 max-sm:flex-col max-sm:items-stretch">
            <Button onClick={() => void submit()} disabled={busy || !session.wallet}>
              {editing ? "Save changes" : "Create gig"}
            </Button>
            {!session.wallet ? (
              <p className="self-center text-xs text-ink-faint">Connect your wallet to continue.</p>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

/** Live preview + guidance for the gig video field (same rules as the gig API). */
function VideoFieldHelp({ title, videoUrl, coverUrl }: { title: string; videoUrl: string; coverUrl: string }) {
  const value = videoUrl.trim();
  const video = value ? parseGigVideo(value) : null;
  return (
    <div className="min-w-0 space-y-2">
      <p id="gig-video-help" className="text-xs text-ink-faint" aria-live="polite">
        {!value
          ? GIG_VIDEO_HELP
          : video
            ? `${gigVideoKindLabel(video)} link recognised. Buyers press play themselves; nothing autoplays.`
            : `This link cannot be played. ${GIG_VIDEO_HELP}`}
      </p>
      {video ? (
        <div className="max-w-md">
          <GigVideoPreview title={title.trim() || "Gig video preview"} videoUrl={video.url} posterUrl={coverUrl.trim() || null} />
        </div>
      ) : null}
    </div>
  );
}
