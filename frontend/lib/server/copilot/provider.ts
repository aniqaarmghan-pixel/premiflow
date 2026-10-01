import { createOpenAI } from "@ai-sdk/openai";
import { generateObject, generateText } from "ai";

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
  let object: unknown;
  try {
    const openai = createOpenAI({
      apiKey: env.apiKey,
      ...(env.provider === "groq"
        ? { baseURL: "https://api.groq.com/openai/v1" }
        : {}),
    });

    // Groq exposes an OpenAI-compatible Chat Completions endpoint.
    // AI SDK's OpenAI provider otherwise defaults to the Responses API.
    const model =
      env.provider === "groq"
        ? openai.chat(env.model)
        : openai(env.model);

    const result = await generateObject({
      model,
      schema: copilotCreateProposalSchema,
      schemaName: "CopilotCreateProposal",
      schemaDescription:
        "PREMIFLOW create-wizard draft proposal. Never include mint, resolver, program ID, PDAs, or awards.",
      system: input.system,
      prompt: input.user,

      // Groq strict JSON Schema requires every property to be required.
      // PREMIFLOW intentionally has optional narrative/proposal fields,
      // so use Groq's best-effort structured output and keep our own
      // Zod validation after generation.
      ...(env.provider === "groq"
        ? {
            providerOptions: {
              openai: {
                strictJsonSchema: false,
              },
            },
          }
        : {}),

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

export type GenerateGuidanceTextInput = {
  system: string;
  user: string;
};

/**
 * Plain-text PREMIFLOW guidance for normal product questions.
 * Structured JSON remains reserved for proposal/live contract flows.
 */
export async function generateGuidanceText(
  input: GenerateGuidanceTextInput,
  env: CopilotEnv = getCopilotEnv()
): Promise<string> {
  if (!copilotCanCallModel(env) || !env.apiKey) {
    throw new CopilotProviderError("Copilot model is not configured.");
  }

  try {
    const openai = createOpenAI({
      apiKey: env.apiKey,
      ...(env.provider === "groq"
        ? { baseURL: "https://api.groq.com/openai/v1" }
        : {}),
    });

    const model =
      env.provider === "groq"
        ? openai.chat(env.model)
        : openai(env.model);

    const result = await generateText({
      model,
      system: input.system,
      prompt: input.user,
      maxOutputTokens: env.maxOutputTokens,
    });

    const text = result.text.trim();

    if (!text) {
      throw new CopilotProviderError(
        "Provider returned an empty guidance response."
      );
    }

    return text.slice(0, 4000);
  } catch (err) {
    if (err instanceof CopilotProviderError) throw err;
    throw new CopilotProviderError();
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
  let object: unknown;
  try {
    const openai = createOpenAI({
      apiKey: env.apiKey,
      ...(env.provider === "groq"
        ? { baseURL: "https://api.groq.com/openai/v1" }
        : {}),
    });

    // Groq exposes an OpenAI-compatible Chat Completions endpoint.
    // AI SDK's OpenAI provider otherwise defaults to the Responses API.
    const model =
      env.provider === "groq"
        ? openai.chat(env.model)
        : openai(env.model);

    const result = await generateObject({
      model,
      schema: copilotNarrativeSchema,
      schemaName: "CopilotNarrative",
      schemaDescription:
        "PREMIFLOW Assistant narrative only. Do not include mint, resolver, program ID, awards, winner, or action lists.",
      system: input.system,
      prompt: input.user,

      // Groq strict JSON Schema requires every property to be required.
      // PREMIFLOW intentionally has optional narrative/proposal fields,
      // so use Groq's best-effort structured output and keep our own
      // Zod validation after generation.
      ...(env.provider === "groq"
        ? {
            providerOptions: {
              openai: {
                strictJsonSchema: false,
              },
            },
          }
        : {}),

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
