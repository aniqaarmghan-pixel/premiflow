import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";

import {
  copilotCreateProposalSchema,
  copilotNarrativeSchema,
  parseCreateProposal,
  parseNarrative,
} from "@/lib/app/copilot-schemas";
import type { CopilotCreateProposal, CopilotNarrative } from "@/lib/app/copilot-schemas";

import { copilotCanCallModel, getCopilotEnv, type CopilotEnv } from "./env";

export class CopilotProviderError extends Error {
  constructor(message = "The Copilot provider is unavailable.") {
    super(message);
    this.name = "CopilotProviderError";
  }
}

export type GenerateCreateProposalInput = {
  system: string;
  user: string;
};

/**
 * Isolated provider adapter. Another vendor can replace this file later.
 * Never returns API keys. Uses structured generateObject + Zod.
 */
export async function generateCreateProposal(
  input: GenerateCreateProposalInput,
  env: CopilotEnv = getCopilotEnv()
): Promise<CopilotCreateProposal> {
  if (!copilotCanCallModel(env) || !env.apiKey) {
    throw new CopilotProviderError("Copilot model is not configured.");
  }
  if (env.provider !== "openai") {
    throw new CopilotProviderError("Unsupported Copilot provider.");
  }

  let object: unknown;
  try {
    const openai = createOpenAI({ apiKey: env.apiKey });
    const result = await generateObject({
      model: openai(env.model),
      schema: copilotCreateProposalSchema,
      schemaName: "CopilotCreateProposal",
      schemaDescription:
        "PREMIFLOW create-wizard draft proposal. Never include mint, resolver, program ID, PDAs, or awards.",
      system: input.system,
      prompt: input.user,
      maxOutputTokens: env.maxOutputTokens,
    });
    object = result.object;
  } catch (err) {
    if (err instanceof CopilotProviderError) throw err;
    throw new CopilotProviderError();
  }

  try {
    return parseCreateProposal(object);
  } catch {
    throw new CopilotProviderError("Provider returned an unsafe proposal.");
  }
}

export type GenerateLiveNarrativeInput = {
  system: string;
  user: string;
};

export async function generateLiveNarrative(
  input: GenerateLiveNarrativeInput,
  env: CopilotEnv = getCopilotEnv()
): Promise<CopilotNarrative> {
  if (!copilotCanCallModel(env) || !env.apiKey) {
    throw new CopilotProviderError("Copilot model is not configured.");
  }
  if (env.provider !== "openai") {
    throw new CopilotProviderError("Unsupported Copilot provider.");
  }

  let object: unknown;
  try {
    const openai = createOpenAI({ apiKey: env.apiKey });
    const result = await generateObject({
      model: openai(env.model),
      schema: copilotNarrativeSchema,
      schemaName: "CopilotNarrative",
      schemaDescription:
        "PREMIFLOW Assistant narrative only. Do not include mint, resolver, program ID, awards, winner, or action lists.",
      system: input.system,
      prompt: input.user,
      maxOutputTokens: env.maxOutputTokens,
    });
    object = result.object;
  } catch (err) {
    if (err instanceof CopilotProviderError) throw err;
    throw new CopilotProviderError();
  }

  try {
    return parseNarrative(object);
  } catch {
    throw new CopilotProviderError("Provider returned an unsafe narrative.");
  }
}
