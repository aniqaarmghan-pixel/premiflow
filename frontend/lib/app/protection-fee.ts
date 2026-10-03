/**
 * Platform / protection fee: MONETIZATION READINESS ONLY.
 *
 * Disabled (0%) by default. Nothing here moves money: it is display math for
 * review / summary screens. It is intentionally NOT imported by send.ts,
 * instructions.ts or the CreateWizard transaction path, so on-chain amounts
 * are unchanged. A real fee needs a protocol + payment review and a Devnet
 * redeploy first (see docs/PROTECTION_FEE.md).
 *
 * Intended model: the freelancer always receives the agreed amount; the
 * employer may later pay a transparent fee on top.
 */
export type ProtectionFeeConfig = {
  readonly enabled: boolean;
  /** Basis points (100 = 1%). Only honoured when enabled and from a trusted source. */
  readonly bps: number;
  readonly label: string;
};

export const MAX_PROTECTION_FEE_BPS = 1_000;

export const PROTECTION_FEE_DISABLED: ProtectionFeeConfig = Object.freeze({
  enabled: false,
  bps: 0,
  label: "Platform protection fee",
});

/** The single central config. Keep disabled until protocol support exists. */
export const PROTECTION_FEE_CONFIG: ProtectionFeeConfig = PROTECTION_FEE_DISABLED;

export type ProtectionFeeBreakdown = {
  enabled: boolean;
  /** Always the agreed amount - the fee never reduces what the freelancer gets. */
  freelancerReceives: bigint;
  fee: bigint;
  employerTotal: bigint;
  label: string;
};

function effectiveBps(config: ProtectionFeeConfig): number {
  if (!config.enabled) return 0;
  if (!Number.isInteger(config.bps) || config.bps <= 0) return 0;
  return Math.min(config.bps, MAX_PROTECTION_FEE_BPS);
}

export function isProtectionFeeActive(config: ProtectionFeeConfig = PROTECTION_FEE_CONFIG): boolean {
  return effectiveBps(config) > 0;
}

/** Display-only breakdown. With the default config: fee 0, employer total = agreed. */
export function protectionFeeBreakdown(
  agreedAmount: bigint,
  config: ProtectionFeeConfig = PROTECTION_FEE_CONFIG
): ProtectionFeeBreakdown {
  const agreed = agreedAmount > 0n ? agreedAmount : 0n;
  const bps = effectiveBps(config);
  const fee = bps > 0 ? (agreed * BigInt(bps)) / 10_000n : 0n;
  return {
    enabled: bps > 0,
    freelancerReceives: agreed,
    fee,
    employerTotal: agreed + fee,
    label: config.label,
  };
}
