"use client";

import { PageFade } from "@/components/shell/PageFade";
import { Card } from "@/components/ui/Card";
import { PREMIFLOW_ASSISTANT } from "@/lib/app/resolution-center";
import { SUPPORT_PAGE, SUPPORT_TOPICS } from "@/lib/app/support";

export function SupportPage() {
  return (
    <PageFade>
      <div className="space-y-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan">
            Help
          </p>
          <h1 className="mt-1 font-display text-4xl tracking-tight">{SUPPORT_PAGE.title}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-soft">{SUPPORT_PAGE.intro}</p>
        </header>

        <Card className="border-line bg-paper p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-faint">
            Coming later
          </p>
          <h2 className="mt-1 font-display text-2xl">{PREMIFLOW_ASSISTANT.name}</h2>
          <p className="mt-2 text-sm font-medium text-ink">{SUPPORT_PAGE.assistantComingLater}</p>
          <p className="mt-2 text-sm leading-6 text-ink-soft">
            This feature is not active. There is no chatbot and no AI backend on this page.
          </p>
          <p className="mt-3 text-sm leading-6 text-ink-soft">
            A future assistant may explain contract state and help organize a case. It will not
            decide who wins, allocate escrow, replace the designated resolver, or sign
            resolve_dispute.
          </p>
        </Card>

        {SUPPORT_TOPICS.map((topic) => (
          <section key={topic.id} id={topic.id}>
            <Card className="p-5">
              <h2 className="font-display text-2xl">{topic.title}</h2>
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
