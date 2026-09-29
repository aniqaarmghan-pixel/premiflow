"use client";

import { PageFade } from "@/components/shell/PageFade";
import { Card } from "@/components/ui/Card";
import { PREMIFLOW_ASSISTANT } from "@/lib/app/resolution-center";
import { SUPPORT_PAGE, SUPPORT_TOPICS } from "@/lib/app/support";

export function SupportPage() {
  return (
    <PageFade>
      <div className="space-y-5">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan">
            Help
          </p>
          <h1 className="mt-1 font-display text-[1.65rem] tracking-tight sm:text-3xl">{SUPPORT_PAGE.title}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-soft">{SUPPORT_PAGE.intro}</p>
        </header>

        <Card className="border-line bg-paper p-4 sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-faint">
            {SUPPORT_PAGE.assistantStatus}
          </p>
          <h2 className="mt-1 font-display text-xl">{PREMIFLOW_ASSISTANT.name}</h2>
          <p className="mt-2 text-sm font-medium text-ink">{SUPPORT_PAGE.assistantTagline}</p>
          <p className="mt-2 text-sm leading-6 text-ink-soft">{SUPPORT_PAGE.assistantBody}</p>
          <p className="mt-3 text-sm leading-6 text-ink-soft">{SUPPORT_PAGE.assistantWillNot}</p>
        </Card>

        {SUPPORT_TOPICS.map((topic) => (
          <section key={topic.id} id={topic.id}>
            <Card className="p-4 sm:p-5">
              <h2 className="font-display text-xl">{topic.title}</h2>
              <div className="mt-3 space-y-2 text-sm leading-6 text-ink-soft">
                {topic.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </Card>
          </section>
        ))}
      </div>
    </PageFade>
  );
}
