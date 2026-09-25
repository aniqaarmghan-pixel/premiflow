"use client";

import Link from "next/link";
import { useState } from "react";

import { AssistantMessageBody } from "@/components/copilot/AssistantMessageBody";
import { Button } from "@/components/ui/Button";
import { Field, Textarea } from "@/components/ui/Field";
import { CREATE_COPILOT } from "@/lib/app/copilot";
import {
  isCopilotClientError,
  requestCreateProposal,
} from "@/lib/app/copilot-client";
import { ASSISTANT_PRODUCT_MARK, LIVE_ASSISTANT } from "@/lib/app/copilot-live";
import type { CopilotCreateResponse } from "@/lib/app/copilot-schemas";
import { presentType } from "@/lib/app/view-model";

type ChatItem = {
  role: "user" | "assistant";
  text: string;
};

function proposalSummary(response: CopilotCreateResponse): string {
  const p = response.proposal;
  const isGuideAnswer = p.assumptions.some((line) =>
    /explains PREMIFLOW/i.test(line)
  );

  if (isGuideAnswer) {
    // Explanations / how-tos — never append a Suggested type line
    return [p.rationale, CREATE_COPILOT.neverCreates].join("\n\n");
  }

  const termBits = [
    p.title ? `- Title suggestion: ${p.title}` : null,
    p.totalAmountUi ? `- Total amount field: ${p.totalAmountUi}` : null,
    p.trialEnabled && p.trialAmountUi ? `- Paid trial amount: ${p.trialAmountUi}` : null,
    p.deliverables.length
      ? `- Deliverables: ${p.deliverables.slice(0, 3).join("; ")}`
      : null,
    p.paymentMode === "Milestone" && p.milestones.length
      ? `- Milestones sketched: ${p.milestones.length}`
      : null,
  ].filter(Boolean);

  return [
    p.rationale,
    `**Suggested type:** ${presentType(p.paymentMode)}`,
    termBits.length ? termBits.join("\n") : null,
    "Open Create contract to review and edit every field before funding. Your wallet must confirm create/fund — the Assistant never does that for you.",
    CREATE_COPILOT.neverCreates,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Compact create-mode guidance for the floating launcher when not on a contract page.
 * Reuses POST /api/copilot mode=create via requestCreateProposal.
 */
export function FloatingCreateGuidance() {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    setBusy(true);
    setMessage(null);
    setItems((prev) => [...prev, { role: "user", text }]);
    setPrompt("");
    try {
      const result = await requestCreateProposal(text);
      setItems((prev) => [
        ...prev,
        { role: "assistant", text: proposalSummary(result) },
      ]);
      if (result.source === "deterministic" && result.warnings[0]) {
        // Only surface provider/session warnings — not for clean FAQ answers
        if (/unavailable|not configured|verify your wallet/i.test(result.warnings[0])) {
          setMessage(result.warnings[0]);
        }
      }
    } catch (err) {
      if (isCopilotClientError(err) && err.code === "rate_limited") {
        setMessage(CREATE_COPILOT.rateLimited);
      } else {
        setMessage(CREATE_COPILOT.error);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan">
        {ASSISTANT_PRODUCT_MARK}
      </p>
      <h2 className="mt-1 font-display text-lg">How can I help?</h2>
      <p className="mt-1 text-xs leading-5 text-ink-soft">
        Ask how PREMIFLOW works, or describe a job for term suggestions.{" "}
        {LIVE_ASSISTANT.neverExecutes}
      </p>

      <div className="mt-3 min-h-[11rem] max-h-[18rem] overflow-y-auto rounded-[calc(var(--radius)-6px)] border border-line bg-black/20 p-3">
        {items.length === 0 && !busy ? (
          <p className="text-sm text-ink-faint">
            Guidance only — the Assistant never creates, funds, or signs for you.
          </p>
        ) : (
          <div className="space-y-3">
            {items.map((item, index) => (
              <div
                key={`${item.role}-${index}`}
                className={
                  item.role === "user"
                    ? "rounded-2xl border border-line bg-card px-3 py-2 text-sm"
                    : "rounded-2xl border border-cyan/20 bg-cyan/5 px-3 py-2 text-sm leading-6 text-ink-soft"
                }
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
                  {item.role === "user" ? "You" : ASSISTANT_PRODUCT_MARK}
                </p>
                <div className="mt-1">
                  {item.role === "assistant" ? (
                    <AssistantMessageBody text={item.text} />
                  ) : (
                    <p className="text-sm text-ink">{item.text}</p>
                  )}
                </div>
              </div>
            ))}
            {busy ? (
              <div className="rounded-2xl border border-cyan/20 bg-cyan/5 px-3 py-2 text-sm leading-6 text-ink-soft">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
                  {ASSISTANT_PRODUCT_MARK}
                </p>
                <p className="mt-1 text-sm text-ink-faint" aria-live="polite">
                  Thinking…
                </p>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {[
          "Explain streaming contract",
          "What is a paid trial?",
          "I need a designer for a project with three stages. Which contract should I use?",
        ].map((question) => (
          <button
            key={question}
            type="button"
            disabled={busy}
            onClick={() => void ask(question)}
            className="min-h-11 rounded-full border border-line px-3 py-2 text-xs text-ink-soft hover:border-cyan/40 hover:text-cyan disabled:opacity-50 sm:min-h-0 sm:py-1"
          >
            {question}
          </button>
        ))}
      </div>

      <form
        className="mt-3 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void ask(prompt);
        }}
      >
        <Field label="Your question">
          <Textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Ask how PREMIFLOW works, or describe the job you want to protect…"
            rows={2}
            disabled={busy}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy || !prompt.trim()}>
            Ask
          </Button>
          <Link href="/create" className="text-xs font-semibold text-cyan hover:underline">
            Open Create wizard
          </Link>
        </div>
        <p className="text-xs text-ink-faint">{CREATE_COPILOT.neverCreates}</p>
      </form>

      {message ? <p className="mt-2 text-sm text-ink-soft">{message}</p> : null}
    </div>
  );
}
