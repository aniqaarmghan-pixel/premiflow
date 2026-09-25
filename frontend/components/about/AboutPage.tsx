"use client";

import Link from "next/link";
import {
  ArrowRight,
  Handshake,
  Landmark,
  MessageSquare,
  Scale,
  Shield,
  Sparkles,
  Users,
} from "lucide-react";

import { TypeMotif } from "@/components/contracts/TypeMotif";
import { PageFade } from "@/components/shell/PageFade";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  ABOUT_ASSISTANT,
  ABOUT_AUDIENCE,
  ABOUT_CTA,
  ABOUT_DISPUTES,
  ABOUT_HERO,
  ABOUT_HOME_TEASER,
  ABOUT_MESSAGES,
  ABOUT_MODELS,
  ABOUT_MODELS_HEADING,
  ABOUT_MODELS_INTRO,
  ABOUT_PROBLEM,
  ABOUT_TRUST,
  ABOUT_VISION,
  ABOUT_WORKFLOW,
} from "@/lib/app/about";
import type { PaymentModeName } from "@/lib/streampay-v2";

const MODEL_ORDER: PaymentModeName[] = ["Fixed", "Milestone", "Streaming", "Hourly"];

export function AboutPage() {
  return (
    <PageFade>
      <article className="min-w-0 space-y-8">
        <header className="relative rounded-[32px] border border-line bg-card px-5 py-8 sm:px-8 sm:py-10">
          <div
            className="pointer-events-none absolute inset-0 overflow-hidden rounded-[32px]"
            aria-hidden="true"
          >
            <div className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-accent/15 blur-3xl" />
          </div>
          <p className="relative text-xs font-semibold uppercase tracking-[0.16em] text-cyan">
            {ABOUT_HERO.eyebrow}
          </p>
          <h1 className="relative mt-3 max-w-3xl break-words font-display text-3xl tracking-tight sm:text-4xl lg:text-5xl">
            {ABOUT_HERO.heading}
          </h1>
          <p className="relative mt-4 max-w-2xl font-display text-xl leading-8 text-ink sm:text-2xl">
            {ABOUT_HERO.idea}
          </p>
          <p className="relative mt-4 max-w-2xl text-sm leading-7 text-ink-soft sm:text-base">
            {ABOUT_HERO.body}
          </p>
        </header>

        <section aria-labelledby="about-problem-heading">
          <h2 id="about-problem-heading" className="font-display text-3xl">
            {ABOUT_PROBLEM.heading}
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-ink-soft">{ABOUT_PROBLEM.intro}</p>
          <div className="mt-5 grid min-w-0 gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <h3 className="font-display text-2xl">{ABOUT_PROBLEM.freelancerHeading}</h3>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-ink-soft">
                {ABOUT_PROBLEM.freelancer.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Card>
            <Card className="p-5">
              <h3 className="font-display text-2xl">{ABOUT_PROBLEM.employerHeading}</h3>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-ink-soft">
                {ABOUT_PROBLEM.employer.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Card>
          </div>
        </section>

        <section aria-labelledby="about-workflow-heading">
          <h2 id="about-workflow-heading" className="font-display text-3xl">
            {ABOUT_WORKFLOW.heading}
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-ink-soft">{ABOUT_WORKFLOW.intro}</p>
          <ol className="mt-5 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {ABOUT_WORKFLOW.steps.map((step, index) => (
              <li key={step.id}>
                <Card className="h-full p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-faint">
                    {index + 1} · {step.title}
                    {index < ABOUT_WORKFLOW.steps.length - 1 ? (
                      <span aria-hidden="true"> ↓</span>
                    ) : null}
                  </p>
                  <h3 className="mt-2 font-display text-2xl">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-ink-soft">{step.body}</p>
                </Card>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="about-models-heading">
          <h2 id="about-models-heading" className="font-display text-3xl">
            {ABOUT_MODELS_HEADING}
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-ink-soft">{ABOUT_MODELS_INTRO}</p>
          <div className="mt-5 grid min-w-0 gap-4 sm:grid-cols-2">
            {MODEL_ORDER.map((type) => {
              const model = ABOUT_MODELS[type];
              return (
                <Card key={type} className="min-w-0 p-5">
                  <TypeMotif type={type} />
                  <h3 className="mt-3 font-display text-2xl">{model.heading}</h3>
                  <p className="mt-1 text-sm font-medium text-ink">{model.tagline}</p>
                  <p className="mt-2 text-sm leading-6 text-ink-soft">{model.body}</p>
                  <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
                    Examples
                  </p>
                  <p className="mt-1 text-sm text-ink-soft">{model.examples.join(" · ")}</p>
                  <p className="mt-3 text-sm leading-6 text-ink-soft">{model.explain}</p>
                </Card>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="about-audience-heading">
          <h2 id="about-audience-heading" className="font-display text-3xl">
            {ABOUT_AUDIENCE.heading}
          </h2>
          <div className="mt-5 grid min-w-0 gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <h3 className="font-display text-2xl">{ABOUT_AUDIENCE.freelancerHeading}</h3>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-ink-soft">
                {ABOUT_AUDIENCE.freelancer.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p className="mt-4 text-sm leading-6 text-ink">{ABOUT_AUDIENCE.freelancerNote}</p>
            </Card>
            <Card className="p-5">
              <h3 className="font-display text-2xl">{ABOUT_AUDIENCE.employerHeading}</h3>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-ink-soft">
                {ABOUT_AUDIENCE.employer.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p className="mt-4 text-sm leading-6 text-ink">{ABOUT_AUDIENCE.employerNote}</p>
            </Card>
          </div>
        </section>

        <section aria-labelledby="about-messages-heading">
          <Card className="p-5 sm:p-6">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-ink-faint">
              <MessageSquare size={14} aria-hidden="true" />
              Contract Messages
            </p>
            <h2 id="about-messages-heading" className="mt-2 font-display text-3xl">
              {ABOUT_MESSAGES.heading}
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-7 text-ink-soft">
              {ABOUT_MESSAGES.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </Card>
        </section>

        <section aria-labelledby="about-disputes-heading">
          <Card className="p-5 sm:p-6">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-ink-faint">
              <Scale size={14} aria-hidden="true" />
              Resolution Center
            </p>
            <h2 id="about-disputes-heading" className="mt-2 font-display text-3xl">
              {ABOUT_DISPUTES.heading}
            </h2>
            <p className="mt-3 text-sm leading-7 text-ink-soft">{ABOUT_DISPUTES.intro}</p>
            <ul className="mt-4 space-y-2 text-sm leading-6 text-ink-soft">
              {ABOUT_DISPUTES.points.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="mt-4 text-sm leading-6 text-ink">{ABOUT_DISPUTES.note}</p>
          </Card>
        </section>

        <section aria-labelledby="about-trust-heading">
          <h2 id="about-trust-heading" className="font-display text-3xl">
            {ABOUT_TRUST.heading}
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-ink-soft">{ABOUT_TRUST.intro}</p>
          <div className="mt-5 grid min-w-0 gap-4 sm:grid-cols-2">
            {ABOUT_TRUST.layers.map((layer) => {
              const Icon =
                layer.title === "Protocol"
                  ? Landmark
                  : layer.title === "PREMIFLOW application"
                    ? Shield
                    : layer.title === "Human parties"
                      ? Users
                      : Handshake;
              return (
                <Card key={layer.title} className="p-5">
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
                    <Icon size={14} aria-hidden="true" />
                    {layer.title}
                  </p>
                  <h3 className="mt-2 font-display text-2xl">{layer.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-ink-soft">{layer.body}</p>
                </Card>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="about-vision-heading">
          <Card className="overflow-hidden p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan">Vision</p>
            <h2 id="about-vision-heading" className="mt-2 font-display text-3xl">
              {ABOUT_VISION.heading}
            </h2>
            <p className="mt-4 max-w-3xl text-base leading-7 text-ink">{ABOUT_VISION.idea}</p>
            <div className="mt-3 max-w-3xl space-y-3 text-sm leading-7 text-ink-soft">
              {ABOUT_VISION.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </Card>
        </section>

        <section aria-labelledby="about-assistant-heading">
          <Card className="border-line bg-paper p-5">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-ink-faint">
              <Sparkles size={14} aria-hidden="true" />
              {ABOUT_ASSISTANT.status}
            </p>
            <h2 id="about-assistant-heading" className="mt-2 font-display text-2xl">
              {ABOUT_ASSISTANT.heading}
            </h2>
            <p className="mt-2 text-sm font-medium text-ink">{ABOUT_ASSISTANT.tagline}</p>
            <p className="mt-2 text-sm leading-6 text-ink-soft">{ABOUT_ASSISTANT.note}</p>
            <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold text-ink">{ABOUT_ASSISTANT.canHelpHeading}</h3>
                <ul className="mt-2 space-y-1 text-sm leading-6 text-ink-soft">
                  {ABOUT_ASSISTANT.intended.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-ink">{ABOUT_ASSISTANT.willNotHeading}</h3>
                <ul className="mt-2 space-y-1 text-sm leading-6 text-ink-soft">
                  {ABOUT_ASSISTANT.willNot.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>
        </section>

        <section aria-labelledby="about-cta-heading">
          <Card className="p-5 sm:p-6">
            <h2 id="about-cta-heading" className="font-display text-3xl">
              {ABOUT_CTA.heading}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-soft">{ABOUT_CTA.body}</p>
            <div className="mt-5 flex flex-wrap gap-3">
              {ABOUT_CTA.actions.map((action, index) => (
                <Link key={action.href} href={action.href}>
                  <Button variant={index === 0 ? "primary" : "secondary"}>{action.label}</Button>
                </Link>
              ))}
            </div>
          </Card>
        </section>
      </article>
    </PageFade>
  );
}

export function WhyPremiflowTeaser() {
  return (
    <Card className="mt-5 p-4 sm:p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan">
        About
      </p>
      <h2 className="mt-1.5 font-display text-xl sm:text-2xl">{ABOUT_HOME_TEASER.heading}</h2>
      <p className="mt-1.5 max-w-2xl text-sm leading-6 text-ink-soft">{ABOUT_HOME_TEASER.body}</p>
      <p className="mt-2 text-sm font-medium text-ink">{ABOUT_HOME_TEASER.models}</p>
      <div className="mt-3">
        <Link href={ABOUT_HOME_TEASER.href}>
          <Button
            variant="secondary"
            aria-label={ABOUT_HOME_TEASER.button}
            className="min-h-11 px-3.5 py-2.5 text-[13px] sm:min-h-0 sm:px-3.5 sm:py-2"
          >
            {ABOUT_HOME_TEASER.button}
            <ArrowRight size={15} aria-hidden="true" />
          </Button>
        </Link>
      </div>
    </Card>
  );
}
