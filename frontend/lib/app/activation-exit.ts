import { formatTokenAmount } from "@/lib/app/money";
import type { ContractView } from "@/lib/streampay-v2";

export const ACTIVATION_EXIT_COPY = {
  title: "End expired activation",
  body: "The contract was accepted, but the main engagement did not start before the activation window ended. This does not open a dispute. The resolver is not involved. This is an on-chain transaction. It does not itself transfer the escrow tokens. After confirmation, the funded amount becomes refundable.",
  laterRefund: "Use Claim refund to return the tokens to your wallet.",
  noImmediateTransfer:
    "This is an on-chain transaction. Tokens do not move during this action.",
  noDispute: "No dispute will be opened. The resolver will not be involved.",
  mainDidNotStart: "The main contract will not start.",
  windowEnded: "The activation window has ended.",
} as const;

export function expireActivationConfirmation(input: {
  contract: Pick<ContractView, "totalAmount">;
  decimals?: number;
}): {
  fundedAmountLabel: string;
  points: string[];
} {
  const fundedAmountLabel = formatTokenAmount(input.contract.totalAmount, input.decimals);
  return {
    fundedAmountLabel,
    points: [
      ACTIVATION_EXIT_COPY.windowEnded,
      ACTIVATION_EXIT_COPY.mainDidNotStart,
      `Your funded amount becomes refundable: ${fundedAmountLabel}.`,
      ACTIVATION_EXIT_COPY.noDispute,
      ACTIVATION_EXIT_COPY.noImmediateTransfer,
      ACTIVATION_EXIT_COPY.laterRefund,
    ],
  };
}
