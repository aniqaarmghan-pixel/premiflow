import { PublicKey } from "@solana/web3.js";

/** Devnet test mint already used by the live PREMIFLOW Fixed contract. */
const TEST_TOKEN_MINT = "9JTBN7QLcoam7LkN44YDhtMQsYt4zKLW7KUE4FscgZtx";

/** Devnet resolver already bound on the live PREMIFLOW Fixed contract. */
const DEFAULT_RESOLVER = "BiSDjVKLTHm4nLVCtpaibahpoqF4nXLsZ8iBBUr3nKaF";

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

function requirePubkey(raw: string, label: string): PublicKey {
  try {
    const key = new PublicKey(raw);
    if (key.equals(PublicKey.default)) {
      throw new Error(`${label} cannot be the default public key`);
    }
    return key;
  } catch (err) {
    throw new Error(
      `${label} is not a valid Solana public key: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
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

export function defaultPaymentToken(): SupportedPaymentToken {
  const token = SUPPORTED_PAYMENT_TOKENS[0];
  if (!token) throw new Error("No PREMIFLOW payment token is configured");
  return token;
}

export function defaultResolver(): SupportedResolver {
  const resolver = SUPPORTED_RESOLVERS[0];
  if (!resolver) throw new Error("No PREMIFLOW resolver is configured");
  return resolver;
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
