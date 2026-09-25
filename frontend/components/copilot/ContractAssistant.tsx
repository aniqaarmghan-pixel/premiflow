"use client";

import { useMemo, useState } from "react";

import { AssistantMessageBody } from "@/components/copilot/AssistantMessageBody";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Textarea } from "@/components/ui/Field";
import {
  LIVE_ASSISTANT,
  inferLiveIntent,
  suggestionsForRole,
} from "@/lib/app/copilot-live";
import {
  isCopilotClientError,
  requestLiveAssistant,
} from "@/lib/app/copilot-client";
import type { CopilotLiveResponse, CopilotRoleLabel } from "@/lib/app/copilot-schemas";
import { actionLabel } from "@/lib/app/view-model";

export type ContractAssistantState =
  | "idle"
  | "generating"
  | "ready"
  | "provider_unavailable"
  | "rate_limited"
  | "unauthenticated"
  | "error";

type ChatItem = {
  role: "user" | "assistant";
  text: string;
  payload?: CopilotLiveResponse;
};

function answerText(payload: CopilotLiveResponse): string {
  if (payload.mode === "contract") {
    const e = payload.explanation;
    return [
      e.summary,
      e.currentState ? `**Current state**\n${e.currentState}` : null,
      e.financialSummary ? `**Money & escrow**\n${e.financialSummary}` : null,
      e.workSummary ? `**Work progress**\n${e.workSummary}` : null,
      e.deadlineSummary ? `**Deadlines**\n${e.deadlineSummary}` : null,
      e.nextExpectedStep ? `**What you can do next**\n${e.nextExpectedStep}` : null,
    ]
      .filter(Boolean)
      .join("\n\n");
  }
  if (payload.mode === "action") {
    return [
      `**${payload.action.displayName}** — ${
        payload.action.currentlyAvailable ? "available now for your role" : "not available right now"
      }.`,
      payload.action.explanation,
      `**If you confirm in your wallet**\n${payload.action.consequence}`,
      payload.action.requiresWalletSignature
        ? "This step needs your wallet signature. The Assistant cannot sign it for you."
        : null,
    ]
      .filter(Boolean)
      .join("\n\n");
  }
  return [
    payload.summary.neutralSummary,
    payload.summary.lifecycleSummary
      ? `**Lifecycle**\n${payload.summary.lifecycleSummary}`
      : null,
    payload.summary.contractFacts
      ? `**Contract facts**\n${payload.summary.contractFacts}`
      : null,
    payload.summary.missingEvidence[0]
      ? `**Gaps to watch**\n- ${payload.summary.missingEvidence.slice(0, 4).join("\n- ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function ContractAssistant({
  contractAddress,
  role,
  paymentMode,
  statusLabel,
  compact = false,
}: {
  contractAddress: string;
  role: CopilotRoleLabel;
  paymentMode: string;
  statusLabel: string;
  /** Tighter layout for the floating launcher panel. */
  compact?: boolean;
}) {
  const [prompt, setPrompt] = useState("");
  const [state, setState] = useState<ContractAssistantState>("idle");
  const [items, setItems] = useState<ChatItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [serverRole, setServerRole] = useState<CopilotRoleLabel>(role);

  const suggestions = useMemo(() => suggestionsForRole(serverRole), [serverRole]);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || state === "generating") return;
    setState("generating");
    setMessage(null);
    setItems((prev) => [...prev, { role: "user", text }]);
    setPrompt("");
    try {
      const payload = await requestLiveAssistant({
        mode: inferLiveIntent(text),
        prompt: text,
        contractAddress,
      });
      setServerRole(payload.role);
      setItems((prev) => [
        ...prev,
        { role: "assistant", text: answerText(payload), payload },
      ]);
      setState(payload.source === "deterministic" ? "provider_unavailable" : "ready");
      if (payload.source === "deterministic") {
        setMessage(payload.warnings.find((line) => /not configured/i.test(line)) ?? null);
      }
    } catch (err) {
      if (isCopilotClientError(err) && err.status === 401) {
        setState("unauthenticated");
        setMessage(LIVE_ASSISTANT.verifyWallet);
        return;
      }
      if (isCopilotClientError(err) && err.code === "rate_limited") {
        setState("rate_limited");
        setMessage(LIVE_ASSISTANT.rateLimited);
        return;
      }
      setState("error");
      setMessage(LIVE_ASSISTANT.error);
    }
  }

  const last = [...items].reverse().find((item) => item.payload)?.payload;
  const busy = state === "generating";
  const body = (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan">
            {LIVE_ASSISTANT.title}
          </p>
          <h2 className={`mt-1 font-display ${compact ? "text-lg" : "text-2xl"}`}>
            Ask about this contract
          </h2>
          {!compact ? (
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-soft">
              {LIVE_ASSISTANT.subtitle}
            </p>
          ) : (
            <p className="mt-1 text-xs leading-5 text-ink-soft">{LIVE_ASSISTANT.subtitle}</p>
          )}
        </div>
        <div
          className={`text-right uppercase tracking-[0.14em] text-ink-faint ${
            compact ? "text-[10px]" : "text-xs"
          }`}
        >
          <p>{paymentMode}</p>
          <p className="mt-1 text-cyan">{serverRole}</p>
          <p className="mt-1">{statusLabel}</p>
        </div>
      </div>

      <div
        className={`mt-3 rounded-[calc(var(--radius)-6px)] border border-line bg-black/20 ${
          compact
            ? "min-h-[11rem] max-h-[18rem] overflow-y-auto p-3"
            : "min-h-[22rem] p-4"
        }`}
      >
        {items.length === 0 && !busy ? (
          <p className="text-sm text-ink-faint">
            {compact
              ? "Ask about status, next steps, or deadlines. Guidance only."
              : "Suggested questions stay role-aware. Answers come from the server snapshot, not this page."}
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
                  {item.role === "user" ? "You" : LIVE_ASSISTANT.title}
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
                  {LIVE_ASSISTANT.title}
                </p>
                <p className="mt-1 text-sm text-ink-faint" aria-live="polite">
                  Thinking…
                </p>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {last?.mode === "contract" && !compact ? (
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-[0.14em] text-ink-faint">Available now</dt>
            <dd className="mt-1 text-ink-soft">
              {last.explanation.availableActions.length
                ? last.explanation.availableActions.map((id) => actionLabel(id)).join(", ")
                : "None for your role"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.14em] text-ink-faint">Collect / Claim</dt>
            <dd className="mt-1 text-ink-soft">
              Collectable {last.explanation.financialFacts.collectableAmount} · Claimable{" "}
              {last.explanation.financialFacts.claimableAmount}
            </dd>
          </div>
        </dl>
      ) : null}

      <div className={`mt-3 flex flex-wrap gap-2 ${compact ? "max-h-16 overflow-y-auto" : "mt-4"}`}>
        {suggestions.map((question) => (
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
            placeholder={LIVE_ASSISTANT.placeholder}
            rows={compact ? 2 : 3}
            disabled={busy}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy || !prompt.trim()}>
            {LIVE_ASSISTANT.send}
          </Button>
          <p className="text-xs text-ink-faint">{LIVE_ASSISTANT.neverExecutes}</p>
        </div>
      </form>

      {message ? <p className="mt-3 text-sm text-ink-soft">{message}</p> : null}
      {state === "unauthenticated" ? (
        <p className="mt-2 text-sm text-ink-faint">{LIVE_ASSISTANT.verifyWallet}</p>
      ) : null}
    </>
  );

  if (compact) {
    return <div className="space-y-0">{body}</div>;
  }
  return <Card className="p-5">{body}</Card>;
}
