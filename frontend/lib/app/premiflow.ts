import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";

import { STREAMPAY_PROGRAM_ID } from "@/lib/streampay-v2/constants";

/**
 * Devnet test mint already used by the live PREMIFLOW Fixed contract.
 *
 * Phantom "Unknown" / "Unknown +1 Unknown" for transfers of this mint is wallet
 * presentation only: the mint is classic SPL Token with no Metaplex Token Metadata
 * PDA, so Phantom has no name/symbol to show. SPL transfer_checked still moves the
 * correct amount between the correct ATAs. Do not change payment instructions to
 * influence wallet UI.
 *
 * Production / durable test tokens should create Metaplex Token Metadata (or the
 * Token-2022 metadata extension) for the mint so wallets can display name + symbol
 * (e.g. "PFT"). Prefer creating metadata once at mint setup time — never mid-payment.
 */
const TEST_TOKEN_MINT = "9JTBN7QLcoam7LkN44YDhtMQsYt4zKLW7KUE4FscgZtx";

/** Devnet resolver already bound on the live PREMIFLOW Fixed contract. */
const DEFAULT_RESOLVER = "BiSDjVKLTHm4nLVCtpaibahpoqF4nXLsZ8iBBUr3nKaF";

const PLACEHOLDER_PUBKEYS = [
  PublicKey.default,
  SystemProgram.programId,
  TOKEN_PROGRAM_ID,
  SYSVAR_RENT_PUBKEY,
  STREAMPAY_PROGRAM_ID,
] as const;

export type SupportedPaymentToken = {
  id: string;
  name: string;
  symbol: string;
  mint: PublicKey;
  decimals: number;
  cluster: "devnet";
  testToken: boolean;
};

export type SupportedResolver = {
  id: string;
  name: string;
  address: PublicKey;
};

export function parseTrustedCreatePubkey(raw: string | null | undefined, label: string): PublicKey {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) {
    throw new Error(`${label} is not configured.`);
  }
  let key: PublicKey;
  try {
    key = new PublicKey(trimmed);
  } catch {
    throw new Error(`${label} is not a valid Solana public key.`);
  }
  if (PLACEHOLDER_PUBKEYS.some((placeholder) => key.equals(placeholder))) {
    throw new Error(`${label} cannot be a placeholder program or system address.`);
  }
  return key;
}

function requirePubkey(raw: string, label: string): PublicKey {
  return parseTrustedCreatePubkey(raw, label);
}

export const PREMIFLOW_TEST_TOKEN: SupportedPaymentToken = {
  id: "premiflow-test-token",
  name: "PREMIFLOW Test Token",
  symbol: "PFT",
  mint: requirePubkey(TEST_TOKEN_MINT, "PREMIFLOW test token mint"),
  decimals: 6,
  cluster: "devnet",
  testToken: true,
};

export const SUPPORTED_PAYMENT_TOKENS: readonly SupportedPaymentToken[] = [
  PREMIFLOW_TEST_TOKEN,
];

export const PREMIFLOW_RESOLVER: SupportedResolver = {
  id: "premiflow-resolver",
  name: "PREMIFLOW Resolver",
  address: requirePubkey(DEFAULT_RESOLVER, "PREMIFLOW resolver"),
};

export const SUPPORTED_RESOLVERS: readonly SupportedResolver[] = [
  PREMIFLOW_RESOLVER,
];

export function defaultPaymentToken(
  tokens: readonly SupportedPaymentToken[] = SUPPORTED_PAYMENT_TOKENS
): SupportedPaymentToken {
  const token = tokens[0];
  if (!token) throw new Error("PREMIFLOW payment token is not configured.");
  parseTrustedCreatePubkey(token.mint.toBase58(), "PREMIFLOW payment token mint");
  return token;
}

export function defaultResolver(
  resolvers: readonly SupportedResolver[] = SUPPORTED_RESOLVERS
): SupportedResolver {
  const resolver = resolvers[0];
  if (!resolver) throw new Error("PREMIFLOW resolver is not configured.");
  parseTrustedCreatePubkey(resolver.address.toBase58(), "PREMIFLOW resolver");
  return resolver;
}

export type LockedCreatePayment = {
  token: SupportedPaymentToken;
  resolver: SupportedResolver;
  mint: PublicKey;
  decimals: number;
  tokenName: string;
  resolverName: string;
};

/**
 * Trusted create-path mint and resolver. Never reads URL, localStorage,
 * form fields, or freelancer input.
 */
export function lockedCreatePayment(
  tokens: readonly SupportedPaymentToken[] = SUPPORTED_PAYMENT_TOKENS,
  resolvers: readonly SupportedResolver[] = SUPPORTED_RESOLVERS
): LockedCreatePayment {
  const token = defaultPaymentToken(tokens);
  const resolver = defaultResolver(resolvers);
  return {
    token,
    resolver,
    mint: token.mint,
    decimals: token.decimals,
    tokenName: token.name,
    resolverName: resolver.name,
  };
}

export function findPaymentToken(mint: string | PublicKey): SupportedPaymentToken | null {
  const raw = typeof mint === "string" ? mint.trim() : mint.toBase58();
  return SUPPORTED_PAYMENT_TOKENS.find((token) => token.mint.toBase58() === raw) ?? null;
}

export function findResolver(address: string | PublicKey): SupportedResolver | null {
  const raw = typeof address === "string" ? address.trim() : address.toBase58();
  return SUPPORTED_RESOLVERS.find((item) => item.address.toBase58() === raw) ?? null;
}

export function paymentTokenLabel(mint: string | PublicKey): string {
  return findPaymentToken(mint)?.name ?? (typeof mint === "string" ? mint : mint.toBase58());
}

export function resolverLabel(address: string | PublicKey): string {
  return findResolver(address)?.name ?? (typeof address === "string" ? address : address.toBase58());
}

export function assertResolverDistinct(
  resolver: PublicKey,
  employer: PublicKey,
  freelancer: PublicKey | null
): string | null {
  if (resolver.equals(employer)) {
    return "Resolver must be different from the employer.";
  }
  if (freelancer && resolver.equals(freelancer)) {
    return "Resolver must be different from the freelancer.";
  }
  return null;
}
