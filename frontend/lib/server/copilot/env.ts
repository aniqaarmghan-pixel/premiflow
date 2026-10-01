import { ServerConfigError } from "../env";

export type CopilotProviderName = "openai" | "groq";

export type CopilotEnv = {
  enabled: boolean;
  provider: CopilotProviderName;
  model: string;
  apiKey: string | null;
  maxOutputTokens: number;
};

const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const DEFAULT_GROQ_MODEL = "openai/gpt-oss-20b";
const DEFAULT_MAX_OUTPUT_TOKENS = 2_800;

let cached: CopilotEnv | null = null;

function parseEnabled(raw: string | undefined): boolean {
  if (raw == null) return false;
  const value = raw.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new ServerConfigError("COPILOT_MAX_OUTPUT_TOKENS is invalid.");
  }
  return value;
}

function readCopilotEnv(): CopilotEnv {
  const providerRaw = (
    process.env.COPILOT_PROVIDER?.trim() || "openai"
  ).toLowerCase();

  const provider: CopilotProviderName =
    providerRaw === "groq" ? "groq" : "openai";

  const defaultModel =
    provider === "groq" ? DEFAULT_GROQ_MODEL : DEFAULT_OPENAI_MODEL;

  const apiKey =
    provider === "groq"
      ? process.env.GROQ_API_KEY?.trim() || null
      : process.env.OPENAI_API_KEY?.trim() || null;

  return {
    enabled: parseEnabled(process.env.COPILOT_ENABLED),
    provider,
    model: process.env.COPILOT_MODEL?.trim() || defaultModel,
    apiKey,
    maxOutputTokens: parsePositiveInt(
      process.env.COPILOT_MAX_OUTPUT_TOKENS,
      DEFAULT_MAX_OUTPUT_TOKENS
    ),
  };
}

/** Lazy. Missing AI keys must not break `next build` or unit tests. */
export function getCopilotEnv(): CopilotEnv {
  if (!cached) cached = readCopilotEnv();
  return cached;
}

export function resetCopilotEnvForTests(): void {
  cached = null;
}

export function copilotCanCallModel(env: CopilotEnv = getCopilotEnv()): boolean {
  return env.enabled && Boolean(env.apiKey);
}
