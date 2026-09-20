import {
  isCreateMode,
  isKnownActionId,
  isLiveMode,
  parseCreateProposal,
  parseCopilotRequest,
  type CopilotActionId,
  type CopilotCreateProposal,
  type CopilotCreateResponse,
  type CopilotLiveResponse,
  type CopilotNarrative,
  type CopilotRequest,
} from "@/lib/app/copilot-schemas";
import { createSystemContext, deterministicCreateProposal } from "@/lib/app/copilot";
import {
  bindActionExplanation,
  deterministicContractExplanation,
  deterministicDisputeSummary,
  inferLiveIntent,
  inferSelectedAction,
  liveSystemContext,
  LIVE_ASSISTANT,
} from "@/lib/app/copilot-live";

import type { AccountReader } from "../solana/read-contract-parties";
import { loadLiveAssistantContext } from "./context";
import { copilotCanCallModel, getCopilotEnv } from "./env";
import {
  generateCreateProposal,
  generateLiveNarrative,
  CopilotProviderError,
} from "./provider";
import { sanitizePrompt, wrapUntrusted } from "./sanitize";

export class CopilotModeError extends Error {
  constructor(message = "That Copilot mode is not available yet.") {
    super(message);
    this.name = "CopilotModeError";
  }
}

export class CopilotValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CopilotValidationError";
  }
}

export type CreateAssistantInput = {
  body: unknown;
  sessionWallet: string | null;
};

export type CreateAssistantResult = CopilotCreateResponse & {
  flaggedPrompt: boolean;
};

function withSafetyWarnings(
  proposal: CopilotCreateProposal,
  extra: string[]
): CopilotCreateProposal {
  const warnings = [...proposal.warnings];
  for (const line of extra) {
    if (!warnings.includes(line)) warnings.push(line);
  }
  if (warnings.length > 12) warnings.length = 12;
  return { ...proposal, warnings };
}

export async function runCreateAssistant(
  input: CreateAssistantInput
): Promise<CreateAssistantResult> {
  let request: CopilotRequest;
  try {
    request = parseCopilotRequest(input.body);
  } catch (err) {
    throw new CopilotValidationError(
      err instanceof Error ? err.message : "Copilot request is invalid."
    );
  }

  if (!isCreateMode(request.mode)) {
    throw new CopilotModeError();
  }

  const sanitized = sanitizePrompt(request.prompt);
  if (!sanitized.text) {
    throw new CopilotValidationError("Describe the job before asking Copilot.");
  }

  const env = getCopilotEnv();
  const canModel = copilotCanCallModel(env) && Boolean(input.sessionWallet);
  const extra: string[] = [];
  if (sanitized.flagged) {
    extra.push("The description was treated as untrusted data.");
  }
  if (sanitized.truncated) {
    extra.push("The description was shortened before Copilot read it.");
  }

  if (canModel) {
    try {
      const proposal = parseCreateProposal(
        await generateCreateProposal({
          system: createSystemContext(),
          user: wrapUntrusted("create_prompt", sanitized.text),
        })
      );
      return {
        mode: "create",
        source: "model",
        proposal: withSafetyWarnings(proposal, extra),
        warnings: extra,
        flaggedPrompt: sanitized.flagged,
      };
    } catch (err) {
      if (!(err instanceof CopilotProviderError)) throw err;
      extra.push("Live Copilot was unavailable, so PREMIFLOW used conservative terms.");
    }
  } else if (env.enabled && !input.sessionWallet) {
    extra.push(
      "Verify your wallet before model-backed suggestions. Conservative terms are shown instead."
    );
  } else if (!env.enabled || !env.apiKey) {
    extra.push("Live Copilot is not configured. Conservative terms are shown instead.");
  }

  const proposal = withSafetyWarnings(
    deterministicCreateProposal(sanitized.text),
    extra
  );
  return {
    mode: "create",
    source: "deterministic",
    proposal,
    warnings: extra,
    flaggedPrompt: sanitized.flagged,
  };
}

export class CopilotAuthError extends Error {
  constructor(message = "Verify your wallet before asking about this contract.") {
    super(message);
    this.name = "CopilotAuthError";
  }
}

export type LiveAssistantInput = {
  body: unknown;
  sessionWallet: string | null;
  reader: AccountReader;
  now?: number;
};

export type LiveAssistantResult = CopilotLiveResponse & {
  flaggedPrompt: boolean;
};

function applyNarrativeToContract(
  explanation: ReturnType<typeof deterministicContractExplanation>,
  narrative: CopilotNarrative | null
) {
  if (!narrative) return explanation;
  return {
    ...explanation,
    summary: narrative.summary || explanation.summary,
    currentState: narrative.currentState || explanation.currentState,
    financialSummary: narrative.financialSummary || explanation.financialSummary,
    workSummary: narrative.workSummary || explanation.workSummary,
    deadlineSummary: narrative.deadlineSummary || explanation.deadlineSummary,
    nextExpectedStep: narrative.nextExpectedStep || explanation.nextExpectedStep,
    warnings: [...explanation.warnings, ...narrative.warnings].slice(0, 12),
  };
}

async function maybeNarrative(input: {
  enabled: boolean;
  user: string;
  extra: string[];
}): Promise<{ narrative: CopilotNarrative | null; source: "model" | "deterministic" }> {
  if (!input.enabled) return { narrative: null, source: "deterministic" };
  try {
    const narrative = await generateLiveNarrative({
      system: liveSystemContext(),
      user: input.user,
    });
    return { narrative, source: "model" };
  } catch (err) {
    if (!(err instanceof CopilotProviderError)) throw err;
    input.extra.push(LIVE_ASSISTANT.providerUnavailable);
    return { narrative: null, source: "deterministic" };
  }
}

export async function runLiveAssistant(
  input: LiveAssistantInput
): Promise<LiveAssistantResult> {
  let request: CopilotRequest;
  try {
    request = parseCopilotRequest(input.body);
  } catch (err) {
    throw new CopilotValidationError(
      err instanceof Error ? err.message : "Copilot request is invalid."
    );
  }
  if (!isLiveMode(request.mode)) {
    throw new CopilotModeError();
  }
  if (!input.sessionWallet) {
    throw new CopilotAuthError();
  }
  if (!request.contractAddress) {
    throw new CopilotValidationError("A contract address is required.");
  }

  const sanitized = sanitizePrompt(request.prompt);
  if (!sanitized.text) {
    throw new CopilotValidationError("Ask a question about this contract.");
  }

  const extra: string[] = [];
  if (sanitized.flagged) extra.push("The question was treated as untrusted data.");
  if (sanitized.truncated) extra.push("The question was shortened before the Assistant read it.");

  const ctx = await loadLiveAssistantContext({
    reader: input.reader,
    contractAddress: request.contractAddress,
    wallet: input.sessionWallet,
    now: input.now,
  });

  const env = getCopilotEnv();
  const canModel = copilotCanCallModel(env);
  if (!canModel) {
    extra.push(LIVE_ASSISTANT.providerUnavailable);
  }

  const trusted = [
    `Authoritative PREMIFLOW facts:`,
    `status=${ctx.contract.status}`,
    `paymentMode=${ctx.contract.paymentMode}`,
    `role=${ctx.role}`,
    `availableActions=${ctx.actions.join(",") || "none"}`,
    `released=${ctx.contract.releasedAmount.toString(10)}`,
    `withdrawn=${ctx.contract.withdrawnAmount.toString(10)}`,
    `collectable=${ctx.contract.releasedAmount - ctx.contract.withdrawnAmount > 0n ? "see facts" : "0"}`,
    `privateMessagesIncluded=false`,
    wrapUntrusted("user_question", sanitized.text),
  ].join("\n");

  const { narrative, source } = await maybeNarrative({
    enabled: canModel,
    user: trusted,
    extra,
  });

  const mode =
    request.mode === "contract" && inferLiveIntent(sanitized.text) !== "contract"
      ? request.mode
      : request.mode;

  if (mode === "action") {
    let actionId: CopilotActionId | null = null;
    if (request.selectedAction) {
      if (!isKnownActionId(request.selectedAction)) {
        throw new CopilotValidationError("That action is not a PREMIFLOW action.");
      }
      actionId = request.selectedAction;
    } else {
      actionId = inferSelectedAction(sanitized.text, ctx.actions);
    }
    if (!actionId) {
      const explanation = applyNarrativeToContract(
        deterministicContractExplanation({
          contract: ctx.contract,
          trial: ctx.trial,
          workUnits: ctx.workUnits,
          hourlyState: ctx.hourlyState,
          role: ctx.role,
          actions: ctx.actions,
          now: ctx.now,
        }),
        narrative
      );
      return {
        mode: "contract",
        source,
        role: ctx.role,
        explanation,
        warnings: [...explanation.warnings, ...extra].slice(0, 16),
        privateMessagesIncluded: false,
        flaggedPrompt: sanitized.flagged,
      };
    }
    const action = bindActionExplanation(actionId, ctx.role, ctx.actions, narrative ?? undefined);
    return {
      mode: "action",
      source,
      role: ctx.role,
      action,
      availableActions: [...ctx.actions],
      warnings: [...action.warnings, ...extra].slice(0, 16),
      privateMessagesIncluded: false,
      flaggedPrompt: sanitized.flagged,
    };
  }

  if (mode === "dispute") {
    const summary = deterministicDisputeSummary({
      contract: ctx.contract,
      trial: ctx.trial,
      workUnits: ctx.workUnits,
      role: ctx.role,
      now: ctx.now,
    });
    if (narrative) {
      summary.neutralSummary = narrative.neutralSummary || summary.neutralSummary;
      summary.lifecycleSummary = narrative.lifecycleSummary || summary.lifecycleSummary;
      summary.contractFacts = narrative.contractFacts || summary.contractFacts;
      if (narrative.unresolvedQuestions?.length) {
        summary.unresolvedQuestions = narrative.unresolvedQuestions;
      }
      summary.warnings = [...summary.warnings, ...narrative.warnings].slice(0, 12);
    }
    return {
      mode: "dispute",
      source,
      role: ctx.role,
      summary,
      availableActions: [...ctx.actions],
      warnings: [...summary.warnings, ...extra].slice(0, 16),
      privateMessagesIncluded: false,
      flaggedPrompt: sanitized.flagged,
    };
  }

  const explanation = applyNarrativeToContract(
    deterministicContractExplanation({
      contract: ctx.contract,
      trial: ctx.trial,
      workUnits: ctx.workUnits,
      hourlyState: ctx.hourlyState,
      role: ctx.role,
      actions: ctx.actions,
      now: ctx.now,
    }),
    narrative
  );
  return {
    mode: "contract",
    source,
    role: ctx.role,
    explanation,
    warnings: [...explanation.warnings, ...extra].slice(0, 16),
    privateMessagesIncluded: false,
    flaggedPrompt: sanitized.flagged,
  };
}

export async function runCopilot(input: {
  body: unknown;
  sessionWallet: string | null;
  reader?: AccountReader;
  now?: number;
}): Promise<CreateAssistantResult | LiveAssistantResult> {
  let request: CopilotRequest;
  try {
    request = parseCopilotRequest(input.body);
  } catch (err) {
    throw new CopilotValidationError(
      err instanceof Error ? err.message : "Copilot request is invalid."
    );
  }
  if (isCreateMode(request.mode)) {
    return runCreateAssistant(input);
  }
  if (!input.reader) {
    throw new CopilotValidationError("Live Assistant could not read the contract.");
  }
  return runLiveAssistant({
    body: input.body,
    sessionWallet: input.sessionWallet,
    reader: input.reader,
    now: input.now,
  });
}
