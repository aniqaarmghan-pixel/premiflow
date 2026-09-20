import { z } from "zod";

export const COPILOT_MODES = ["create", "explain", "action", "dispute"] as const;
export type CopilotMode = (typeof COPILOT_MODES)[number];

export const COPILOT_CREATE_MODE = "create" as const;
export const COPILOT_BLOCK1_MODES = [COPILOT_CREATE_MODE] as const;

export const COPILOT_FORBIDDEN_FIELDS = [
  "mint",
  "resolver",
  "decimals",
  "programId",
  "program_id",
  "canonicalProgramId",
  "tokenMint",
  "token_mint",
  "pda",
  "pdas",
  "accounts",
  "accountMap",
  "instruction",
  "instructions",
  "privateKey",
  "secretKey",
  "seedPhrase",
  "rpcUrl",
  "SOLANA_RPC_URL",
  "OPENAI_API_KEY",
  "freelancerContestedAward",
  "award",
  "settlementAward",
  "availableActions",
] as const;

export type CopilotForbiddenField = (typeof COPILOT_FORBIDDEN_FIELDS)[number];

const uiAmountString = z
  .string()
  .max(32)
  .regex(/^\d+(\.\d+)?$/, "Amounts must be decimal strings, not floating-point numbers.");

const nullableUiAmount = z.union([uiAmountString, z.null()]);

export const copilotMilestoneSchema = z
  .object({
    label: z.string().min(1).max(80),
    amountUi: z.string().max(32),
    dueOffsetSeconds: z.number().int().positive().max(157_680_000),
  })
  .strict();

export const copilotCreateProposalSchema = z
  .object({
    paymentMode: z.enum(["Fixed", "Milestone", "Streaming", "Hourly"]),
    title: z.string().max(120).nullable(),
    description: z.string().max(2000).nullable(),
    deliverables: z.array(z.string().max(200)).max(20),
    freelancer: z.string().max(64).nullable(),
    trialEnabled: z.boolean(),
    trialAmountUi: nullableUiAmount,
    totalAmountUi: nullableUiAmount,
    hourlyRateUi: nullableUiAmount,
    authorizedTimeValue: z.string().max(16).nullable(),
    authorizedTimeUnit: z.enum(["hours", "days"]).nullable(),
    engagementDurationValue: z.string().max(16).nullable(),
    engagementDurationUnit: z.enum(["hours", "days"]).nullable(),
    durationSeconds: z.number().int().positive().max(157_680_000).nullable(),
    checkpointInterval: z.number().int().positive().max(157_680_000).nullable(),
    reviewDuration: z.number().int().min(10).max(2_592_000),
    activationReviewDuration: z.number().int().min(60).max(86_400),
    maxRevisions: z.number().int().min(0).max(5),
    acceptanceDeadlineOffsetSeconds: z.number().int().min(60).max(7_776_000),
    startMode: z.enum(["OnActivation", "Scheduled"]),
    milestones: z.array(copilotMilestoneSchema).max(64),
    rationale: z.string().min(1).max(2000),
    assumptions: z.array(z.string().max(400)).max(12),
    warnings: z.array(z.string().max(400)).max(12),
  })
  .strict();

export type CopilotCreateProposal = z.infer<typeof copilotCreateProposalSchema>;

export const copilotRequestSchema = z
  .object({
    mode: z.enum(COPILOT_MODES),
    prompt: z.string().min(1).max(2000),
    contractAddress: z.string().max(64).optional(),
    selectedAction: z.string().max(64).optional(),
  })
  .strict();

export type CopilotRequest = z.infer<typeof copilotRequestSchema>;

export const copilotResponseSchema = z
  .object({
    mode: z.literal(COPILOT_CREATE_MODE),
    source: z.enum(["model", "deterministic"]),
    proposal: copilotCreateProposalSchema,
    warnings: z.array(z.string().max(400)).max(16),
  })
  .strict();

export type CopilotResponse = z.infer<typeof copilotResponseSchema>;

export class CopilotSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CopilotSchemaError";
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function forbiddenFieldsIn(value: unknown): string[] {
  const rec = asRecord(value);
  if (!rec) return [];
  return COPILOT_FORBIDDEN_FIELDS.filter((key) => key in rec);
}

export function parseCreateProposal(value: unknown): CopilotCreateProposal {
  const forbidden = forbiddenFieldsIn(value);
  if (forbidden.length > 0) {
    throw new CopilotSchemaError(
      `Proposal must not control ${forbidden.join(", ")}.`
    );
  }
  const parsed = copilotCreateProposalSchema.safeParse(value);
  if (!parsed.success) {
    throw new CopilotSchemaError("Create proposal is not a valid PREMIFLOW draft.");
  }
  return parsed.data;
}

export function parseCopilotRequest(value: unknown): CopilotRequest {
  const parsed = copilotRequestSchema.safeParse(value);
  if (!parsed.success) {
    throw new CopilotSchemaError("Copilot request is invalid.");
  }
  return parsed.data;
}

export function parseCopilotResponse(value: unknown): CopilotResponse {
  const parsed = copilotResponseSchema.safeParse(value);
  if (!parsed.success) {
    throw new CopilotSchemaError("Copilot response is invalid.");
  }
  return parsed.data;
}

export function isBlock1Mode(mode: CopilotMode): mode is typeof COPILOT_CREATE_MODE {
  return mode === COPILOT_CREATE_MODE;
}
