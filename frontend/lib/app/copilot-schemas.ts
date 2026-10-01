import { z } from "zod";

export const COPILOT_MODES = ["create", "contract", "action", "dispute"] as const;
export type CopilotMode = (typeof COPILOT_MODES)[number];

export const COPILOT_CREATE_MODE = "create" as const;
export const COPILOT_LIVE_MODES = ["contract", "action", "dispute"] as const;
export type CopilotLiveMode = (typeof COPILOT_LIVE_MODES)[number];

export const COPILOT_ACTION_IDS = [
  "addMilestone",
  "finalizeTerms",
  "acceptContract",
  "declineContract",
  "expireAcceptance",
  "expireActivation",
  "approveActivation",
  "rejectActivation",
  "submitTrialWork",
  "requestTrialRevision",
  "approveTrialAndActivate",
  "settleTrialAndEnd",
  "finalizeTrialReviewTimeout",
  "submitWorkUnit",
  "requestWorkRevision",
  "approveWorkUnit",
  "voidStaleRevision",
  "finalizeReviewTimeout",
  "releaseStreamAccrual",
  "cancelActiveContract",
  "withdrawFreelancer",
  "claimEmployerRefund",
  "openDispute",
  "resolveDispute",
  "completeContract",
  "startHourlySession",
  "stopHourlySession",
  "endHourlyContract",
] as const;

export type CopilotActionId = (typeof COPILOT_ACTION_IDS)[number];

export const COPILOT_ROLES = ["Employer", "Freelancer", "Resolver", "Other"] as const;
export type CopilotRoleLabel = (typeof COPILOT_ROLES)[number];

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
  "GROQ_API_KEY",
  "freelancerContestedAward",
  "award",
  "settlementAward",
  "availableActions",
  "winner",
  "loser",
  "faultScore",
  "recommendedAward",
  "recommendedPayoutPercentage",
  "resolverDecision",
  "settlementInstruction",
] as const;

export type CopilotForbiddenField = (typeof COPILOT_FORBIDDEN_FIELDS)[number];

export const DISPUTE_FORBIDDEN_FIELDS = [
  "winner",
  "loser",
  "faultScore",
  "recommendedAward",
  "recommendedPayoutPercentage",
  "resolverDecision",
  "settlementInstruction",
] as const;

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
    rationale: z.string().min(1).max(4000),
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

export const copilotDeadlineFactSchema = z
  .object({
    type: z.string().min(1).max(64),
    timestamp: z.number().int(),
    passed: z.boolean(),
    secondsRemaining: z.number().int().nullable(),
    unlocksAction: z.enum(COPILOT_ACTION_IDS).nullable(),
  })
  .strict();

export type CopilotDeadlineFact = z.infer<typeof copilotDeadlineFactSchema>;

export const copilotFinancialFactsSchema = z
  .object({
    totalAmount: z.string().max(32),
    trialAmount: z.string().max(32),
    mainAmount: z.string().max(32),
    allocatedAmount: z.string().max(32),
    releasedAmount: z.string().max(32),
    withdrawnAmount: z.string().max(32),
    refundedAmount: z.string().max(32),
    streamReleasedAmount: z.string().max(32),
    freelancerSettlementAmount: z.string().max(32),
    employerRefundableAmount: z.string().max(32),
    contestedAmount: z.string().max(32),
    collectableAmount: z.string().max(32),
    claimableAmount: z.string().max(32),
  })
  .strict();

export type CopilotFinancialFacts = z.infer<typeof copilotFinancialFactsSchema>;

export const copilotWorkFactSchema = z
  .object({
    kind: z.string().max(32),
    status: z.string().max(32),
    amount: z.string().max(32),
    actionDeadline: z.number().int(),
    revisionCount: z.number().int().min(0),
  })
  .strict();

export const copilotContractExplanationSchema = z
  .object({
    summary: z.string().min(1).max(4000),
    currentState: z.string().min(1).max(2000),
    financialSummary: z.string().min(1).max(2000),
    workSummary: z.string().min(1).max(2000),
    deadlineSummary: z.string().min(1).max(2000),
    availableActions: z.array(z.enum(COPILOT_ACTION_IDS)).max(32),
    nextExpectedStep: z.string().min(1).max(2000),
    warnings: z.array(z.string().max(400)).max(12),
    financialFacts: copilotFinancialFactsSchema,
    deadlines: z.array(copilotDeadlineFactSchema).max(16),
  })
  .strict();

export type CopilotContractExplanation = z.infer<typeof copilotContractExplanationSchema>;

export const copilotActionExplanationSchema = z
  .object({
    actionId: z.enum(COPILOT_ACTION_IDS),
    displayName: z.string().min(1).max(80),
    currentlyAvailable: z.boolean(),
    actorRole: z.enum(COPILOT_ROLES),
    explanation: z.string().min(1).max(4000),
    consequence: z.string().min(1).max(2000),
    requiresWalletSignature: z.boolean(),
    warnings: z.array(z.string().max(400)).max(12),
  })
  .strict();

export type CopilotActionExplanation = z.infer<typeof copilotActionExplanationSchema>;

export const copilotDisputeSummarySchema = z
  .object({
    contractFacts: z.string().min(1).max(2000),
    lifecycleSummary: z.string().min(1).max(2000),
    financialFacts: copilotFinancialFactsSchema,
    workFacts: z.array(copilotWorkFactSchema).max(64),
    deadlines: z.array(copilotDeadlineFactSchema).max(16),
    selectedEvidence: z.array(z.string().max(400)).max(12),
    missingEvidence: z.array(z.string().max(400)).max(12),
    unresolvedQuestions: z.array(z.string().max(400)).max(12),
    neutralSummary: z.string().min(1).max(4000),
    warnings: z.array(z.string().max(400)).max(12),
  })
  .strict();

export type CopilotDisputeSummary = z.infer<typeof copilotDisputeSummarySchema>;

export const copilotNarrativeSchema = z
  .object({
    summary: z.string().min(1).max(4000),
    currentState: z.string().max(2000).optional(),
    financialSummary: z.string().max(2000).optional(),
    workSummary: z.string().max(2000).optional(),
    deadlineSummary: z.string().max(2000).optional(),
    nextExpectedStep: z.string().max(2000).optional(),
    explanation: z.string().max(4000).optional(),
    consequence: z.string().max(2000).optional(),
    lifecycleSummary: z.string().max(2000).optional(),
    contractFacts: z.string().max(2000).optional(),
    neutralSummary: z.string().max(4000).optional(),
    unresolvedQuestions: z.array(z.string().max(400)).max(12).optional(),
    warnings: z.array(z.string().max(400)).max(12),
  })
  .strict();

export type CopilotNarrative = z.infer<typeof copilotNarrativeSchema>;

export const copilotCreateResponseSchema = z
  .object({
    mode: z.literal(COPILOT_CREATE_MODE),
    source: z.enum(["model", "deterministic"]),
    proposal: copilotCreateProposalSchema,
    warnings: z.array(z.string().max(400)).max(16),
  })
  .strict();

export const copilotContractResponseSchema = z
  .object({
    mode: z.literal("contract"),
    source: z.enum(["model", "deterministic"]),
    role: z.enum(COPILOT_ROLES),
    explanation: copilotContractExplanationSchema,
    warnings: z.array(z.string().max(400)).max(16),
    privateMessagesIncluded: z.literal(false),
  })
  .strict();

export const copilotActionResponseSchema = z
  .object({
    mode: z.literal("action"),
    source: z.enum(["model", "deterministic"]),
    role: z.enum(COPILOT_ROLES),
    action: copilotActionExplanationSchema,
    availableActions: z.array(z.enum(COPILOT_ACTION_IDS)).max(32),
    warnings: z.array(z.string().max(400)).max(16),
    privateMessagesIncluded: z.literal(false),
  })
  .strict();

export const copilotDisputeResponseSchema = z
  .object({
    mode: z.literal("dispute"),
    source: z.enum(["model", "deterministic"]),
    role: z.enum(COPILOT_ROLES),
    summary: copilotDisputeSummarySchema,
    availableActions: z.array(z.enum(COPILOT_ACTION_IDS)).max(32),
    warnings: z.array(z.string().max(400)).max(16),
    privateMessagesIncluded: z.literal(false),
  })
  .strict();

export const copilotResponseSchema = z.discriminatedUnion("mode", [
  copilotCreateResponseSchema,
  copilotContractResponseSchema,
  copilotActionResponseSchema,
  copilotDisputeResponseSchema,
]);

export type CopilotCreateResponse = z.infer<typeof copilotCreateResponseSchema>;
export type CopilotContractResponse = z.infer<typeof copilotContractResponseSchema>;
export type CopilotActionResponse = z.infer<typeof copilotActionResponseSchema>;
export type CopilotDisputeResponse = z.infer<typeof copilotDisputeResponseSchema>;
export type CopilotResponse = z.infer<typeof copilotResponseSchema>;
export type CopilotLiveResponse =
  | CopilotContractResponse
  | CopilotActionResponse
  | CopilotDisputeResponse;

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

export function disputeForbiddenFieldsIn(value: unknown): string[] {
  const rec = asRecord(value);
  if (!rec) return [];
  return DISPUTE_FORBIDDEN_FIELDS.filter((key) => key in rec);
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

export function parseContractExplanation(value: unknown): CopilotContractExplanation {
  const parsed = copilotContractExplanationSchema.safeParse(value);
  if (!parsed.success) {
    throw new CopilotSchemaError("Contract explanation is invalid.");
  }
  return parsed.data;
}

export function parseActionExplanation(value: unknown): CopilotActionExplanation {
  const forbidden = forbiddenFieldsIn(value);
  if (forbidden.length > 0) {
    throw new CopilotSchemaError(
      `Action explanation must not control ${forbidden.join(", ")}.`
    );
  }
  const parsed = copilotActionExplanationSchema.safeParse(value);
  if (!parsed.success) {
    throw new CopilotSchemaError("Action explanation is invalid.");
  }
  return parsed.data;
}

export function parseDisputeSummary(value: unknown): CopilotDisputeSummary {
  const forbidden = disputeForbiddenFieldsIn(value);
  if (forbidden.length > 0) {
    throw new CopilotSchemaError(
      `Dispute summary must not include ${forbidden.join(", ")}.`
    );
  }
  const parsed = copilotDisputeSummarySchema.safeParse(value);
  if (!parsed.success) {
    throw new CopilotSchemaError("Dispute summary is invalid.");
  }
  return parsed.data;
}

export function parseNarrative(value: unknown): CopilotNarrative {
  const forbidden = forbiddenFieldsIn(value);
  if (forbidden.length > 0) {
    throw new CopilotSchemaError(
      `Narrative must not control ${forbidden.join(", ")}.`
    );
  }
  const parsed = copilotNarrativeSchema.safeParse(value);
  if (!parsed.success) {
    throw new CopilotSchemaError("Assistant narrative is invalid.");
  }
  return parsed.data;
}

export function isCreateMode(mode: CopilotMode): mode is typeof COPILOT_CREATE_MODE {
  return mode === COPILOT_CREATE_MODE;
}

export function isLiveMode(mode: CopilotMode): mode is CopilotLiveMode {
  return (COPILOT_LIVE_MODES as readonly string[]).includes(mode);
}

export function isKnownActionId(value: string): value is CopilotActionId {
  return (COPILOT_ACTION_IDS as readonly string[]).includes(value);
}

/** @deprecated Use isCreateMode. Block 1 name kept for existing imports. */
export const isBlock1Mode = isCreateMode;
export const COPILOT_BLOCK1_MODES = [COPILOT_CREATE_MODE] as const;
