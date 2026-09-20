import { formatTokenAmount } from "@/lib/app/money";
import type { ContractView } from "@/lib/streampay-v2";

export const OFFER_EXIT_COPY = {
  declinedTitle: "The freelancer declined this offer before work started.",
  declinedBody:
    "The main contract did not start. No freelancer payment was earned. Your funded amount is refundable. No dispute was opened. The resolver is not involved.",
  expireTitle: "Expire offer",
  expireBody:
    "The acceptance deadline has passed and work never started. Expiring does not transfer tokens immediately. No dispute is opened. The resolver is not involved. After confirmation, the funded amount becomes refundable.",
  laterRefund: "Use Claim refund to return the tokens to your wallet.",
  noImmediateTransfer:
    "This is an on-chain transaction. Tokens do not move during this action.",
  noDispute: "No dispute will be opened. The resolver will not be involved.",
  mainDidNotStart: "The main contract did not start.",
} as const;

export function expireOfferConfirmation(input: {
  contract: Pick<ContractView, "totalAmount" | "paymentMode">;
  decimals?: number;
}): {
  fundedAmountLabel: string;
  points: string[];
} {
  const fundedAmountLabel = formatTokenAmount(input.contract.totalAmount, input.decimals);
  return {
    fundedAmountLabel,
    points: [
      "The acceptance deadline has passed.",
      OFFER_EXIT_COPY.mainDidNotStart,
      `Your funded amount becomes refundable: ${fundedAmountLabel}.`,
      OFFER_EXIT_COPY.noDispute,
      OFFER_EXIT_COPY.noImmediateTransfer,
      OFFER_EXIT_COPY.laterRefund,
    ],
  };
}

export function declinedSettlementCopy(input: {
  contract: Pick<ContractView, "totalAmount">;
  decimals?: number;
}): string {
  const fundedAmountLabel = formatTokenAmount(input.contract.totalAmount, input.decimals);
  return `${OFFER_EXIT_COPY.declinedTitle} ${OFFER_EXIT_COPY.declinedBody} Funded amount refundable: ${fundedAmountLabel}. ${OFFER_EXIT_COPY.laterRefund}`;
}
