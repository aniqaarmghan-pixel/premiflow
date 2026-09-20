import {
  isBlock1Mode,
  parseCreateProposal,
  parseCopilotRequest,
  type CopilotCreateProposal,
  type CopilotRequest,
  type CopilotResponse,
} from "@/lib/app/copilot-schemas";
import { createSystemContext, deterministicCreateProposal } from "@/lib/app/copilot";

import { copilotCanCallModel, getCopilotEnv } from "./env";
import { generateCreateProposal, CopilotProviderError } from "./provider";
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

export type CreateAssistantResult = CopilotResponse & {
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

  if (!isBlock1Mode(request.mode)) {
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
