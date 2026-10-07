import { DISPUTE_CATEGORIES } from "@/lib/app/resolution-center";
import { isRealSignature } from "@/lib/app/resolve-signature-store";
import { formatTokenAmount } from "@/lib/app/money";
import type { ContractView } from "@/lib/streampay-v2";

/**
 * Judge-visible dispute proof. Only facts already present on the contract
 * account or the stored case record are shown; nothing is inferred and
 * nothing here decides a dispute. The designated resolver decides.
 */
export const DISPUTE_PROOF_HEADING = "Dispute record";
export const DISPUTE_PROOF_NOTE =
  "Facts from the on-chain contract and the case record. PREMIFLOW does not decide disputes; the designated resolver does.";
export const EXPLORER_LINK_LABEL = "View on Solana Explorer";

export type DisputeProofRow = { label: string; value: string };
export type DisputeProofLink = { label: string; signature: string };
export type DisputeProof = { rows: DisputeProofRow[]; links: DisputeProofLink[] };

type ProofContract = Pick<
  ContractView,
  | "status"
  | "disputeInitiator"
  | "disputedAt"
  | "contestedAmount"
  | "releasedAmount"
  | "withdrawnAmount"
  | "refundedAmount"
>;

export type DisputeProofInput = {
  category?: string | null;
  evidenceCount?: number | null;
  openSignature?: string | null;
  resolveSignature?: string | null;
};

export function disputeProof(
  contract: ProofContract,
  decimals: Parameters<typeof formatTokenAmount>[1],
  input: DisputeProofInput = {}
): DisputeProof | null {
  const disputed = contract.status === "Disputed";
  const resolved = contract.status === "Resolved";
  if (!disputed && !resolved) return null;
  const amount = (value: bigint) => formatTokenAmount(value, decimals);
  const rows: DisputeProofRow[] = [
    {
      label: "Status",
      value: disputed ? "Disputed: frozen until the resolver decides" : "Resolved by the designated resolver",
    },
  ];
  if (contract.disputeInitiator === "Employer" || contract.disputeInitiator === "Freelancer") {
    rows.push({ label: "Opened by", value: contract.disputeInitiator });
  }
  if (contract.disputedAt > 0) {
    rows.push({
      label: "Opened on",
      value: `${new Date(contract.disputedAt * 1000).toISOString().slice(0, 10)} (UTC)`,
    });
  }
  const category = input.category
    ? DISPUTE_CATEGORIES.find((item) => item.id === input.category)
    : undefined;
  if (category) rows.push({ label: "Reason given", value: category.label });
  if (input.evidenceCount != null) {
    rows.push({
      label: "Evidence on file",
      value: `${input.evidenceCount} ${input.evidenceCount === 1 ? "item" : "items"}`,
    });
  }
  if (disputed) {
    rows.push({ label: "Amount under dispute", value: amount(contract.contestedAmount) });
  } else {
    rows.push({ label: "Resolver decision", value: "Settlement recorded on-chain" });
  }
  rows.push({ label: "Released to freelancer", value: amount(contract.releasedAmount) });
  rows.push({ label: "Collected by freelancer", value: amount(contract.withdrawnAmount) });
  rows.push({ label: "Refunded to employer", value: amount(contract.refundedAmount) });

  const links: DisputeProofLink[] = [];
  if (isRealSignature(input.openSignature)) {
    links.push({ label: "Dispute opened", signature: input.openSignature });
  }
  if (resolved && isRealSignature(input.resolveSignature)) {
    links.push({ label: "Resolution recorded", signature: input.resolveSignature });
  }
  return { rows, links };
}