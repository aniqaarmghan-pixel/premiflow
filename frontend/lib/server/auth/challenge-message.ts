export function challengeDomain(appOrigin: string): string {
  return new URL(appOrigin).host;
}

export function buildAuthChallengeMessage(input: {
  appOrigin: string;
  wallet: string;
  nonce: string;
  issuedAt: Date;
  expiresAt: Date;
}): string {
  const domain = challengeDomain(input.appOrigin);
  return [
    "PREMIFLOW wants you to verify this wallet.",
    "",
    "This signature proves you own the wallet.",
    "It is not a transaction, costs no SOL, and does not grant spending permission.",
    "",
    `Domain: ${domain}`,
    `Wallet: ${input.wallet}`,
    `Nonce: ${input.nonce}`,
    `Issued: ${input.issuedAt.toISOString()}`,
    `Expires: ${input.expiresAt.toISOString()}`,
  ].join("\n");
}

export function challengeMatchesApp(message: string, appOrigin: string): boolean {
  return message.includes(`Domain: ${challengeDomain(appOrigin)}`);
}
