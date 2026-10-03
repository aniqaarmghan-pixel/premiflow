import type { UiAction } from "@/lib/streampay-v2/actions";
import type { PublicKey } from "@solana/web3.js";

import { formatUnix } from "@/lib/app/datetime";
import { walletSetIncludesParty } from "@/lib/app/account-wallet-identity";
import { presentContractStatus, presentStatus } from "@/lib/app/view-model";
import { isStreamEnded, type ContractView, type PaymentModeName } from "@/lib/streampay-v2";

type EndedStatusFields = Partial<Pick<ContractView, "paymentMode" | "startTime" | "endTime">>;

/** On-chain label, or "Streaming ended" for an Active Streaming contract past end_time when `now` is known. */
function endedAwareStatus(
  contract: Pick<ContractView, "status"> & EndedStatusFields,
  now?: number
): string {
  if (
    now !== undefined &&
    contract.paymentMode !== undefined &&
    contract.startTime !== undefined &&
    contract.endTime !== undefined
  ) {
    return presentContractStatus(
      {
        status: contract.status,
        paymentMode: contract.paymentMode,
        startTime: contract.startTime,
        endTime: contract.endTime,
      },
      now
    );
  }
  const onChain = presentStatus(contract.status);
  return onChain;
}

/**
 * Home dashboard discovery helpers (offers, action required, role-aware labels).
 *
 * Every helper compares the connected wallet DIRECTLY with `contract.freelancer`
 * and `contract.employer` on each contract. `roleForContract` (employer first)
 * is intentionally not used here and stays unchanged for its other callers:
 * when one wallet is both parties on a PendingAcceptance contract, the offer is
 * listed under "Offers awaiting your response" so the freelancer response is
 * never hidden. Classification is identical for Fixed, Milestone, Streaming and
 * Hourly. An offer is never "Active" and never a live stream.
 */
export const OFFER_SECTIONS_COPY = {
  awaitingTitle: "Offers awaiting your response",
  awaitingBody:
    "An employer sent you these offers. Open one to review the terms and respond before the acceptance deadline.",
  awaitingAction: "Review offer",
  awaitingStatus: "Awaiting your response",
  expiredFreelancerStatus: "Expired \u2014 decline only",
  waitingTitle: "Offers waiting for freelancer",
  waitingBody:
    "You sent these offers. Nothing is needed from you while the freelancer decides.",
  waitingAction: "View offer",
  waitingStatus: "Waiting for freelancer",
  deadlinePassedStatus: "Acceptance deadline passed",
  employerLabel: "Employer",
  freelancerLabel: "Freelancer",
  amountLabel: "Amount",
  deadlineLabel: "Acceptance deadline",
} as const;

/** Role-aware wording for PendingAcceptance; every other status uses presentStatus. */
export const ROLE_AWARE_STATUS_COPY = {
  freelancerOffer: "Offer awaiting your response",
  employerOffer: "Waiting for freelancer",
} as const;

/** Hiring / Working tiles count every contract for the role, including history. */
export const ROLE_TOTAL_LABELS = {
  hiring: "Hiring \u2014 total contracts",
  working: "Working \u2014 total contracts",
  note: "Totals include completed, cancelled, declined and expired contracts.",
} as const;

export const ACTION_REQUIRED_COPY = {
  title: "Action required",
  body: "You are the employer on these contracts and the next step is yours.",
  finishSetup: "Finish setup: add milestones and lock terms",
  reviewActivation: "Review activation",
  expiredDraft: "Setup deadline passed: expire this draft to reclaim funds",
  action: "Open contract",
} as const;

export type OfferListItem = {
  address: string;
  href: string;
  mode: PaymentModeName;
  /** Which side of the contract the other party is on. */
  counterpartyRole: "employer" | "freelancer";
  counterpartyAddress: string;
  tokenMint: string;
  totalAmount: bigint;
  acceptanceDeadline: number;
  /** Mirrors availableActions: accept is only possible while now < acceptanceDeadline. */
  deadlinePassed: boolean;
};

export type OfferSections = {
  awaitingYourResponse: OfferListItem[];
  waitingForFreelancer: OfferListItem[];
};

export type OfferItemCopy = {
  statusLabel: string;
  counterpartyLabel: string;
  deadlineNote: string;
  deadlineText: string;
  actionLabel: string;
};

export type ActionRequiredItem = {
  address: string;
  href: string;
  mode: PaymentModeName;
  kind: "finishSetup" | "reviewActivation" | "expiredDraft";
  freelancerAddress: string;
  note: string;
  actionLabel: string;
};

/** True when `party` is the connected wallet (direct key comparison). */
export function walletIsParty(wallet: PublicKey | null | undefined, party: PublicKey): boolean {
  return wallet ? party.equals(wallet) : false;
}

export function isPendingOffer(contract: Pick<ContractView, "status">): boolean {
  return contract.status === "PendingAcceptance";
}

function contractHref(address: string): string {
  return `/contracts/${address}`;
}

function toOfferItem(
  contract: ContractView,
  counterpartyRole: "employer" | "freelancer",
  now: number
): OfferListItem {
  const address = contract.address.toBase58();
  const other = counterpartyRole === "employer" ? contract.employer : contract.freelancer;
  return {
    address,
    href: contractHref(address),
    mode: contract.paymentMode,
    counterpartyRole,
    counterpartyAddress: other.toBase58(),
    tokenMint: contract.tokenMint.toBase58(),
    totalAmount: contract.totalAmount,
    acceptanceDeadline: contract.acceptanceDeadline,
    deadlinePassed: now >= contract.acceptanceDeadline,
  };
}

function byDeadline(a: OfferListItem, b: OfferListItem): number {
  return a.acceptanceDeadline - b.acceptanceDeadline;
}

/** Splits PendingAcceptance contracts by direct wallet comparison on each contract. */
export function offerSections(
  wallet: PublicKey | null,
  contracts: readonly ContractView[],
  now: number
): OfferSections {
  const awaitingYourResponse: OfferListItem[] = [];
  const waitingForFreelancer: OfferListItem[] = [];
  if (!wallet) return { awaitingYourResponse, waitingForFreelancer };
  for (const contract of contracts) {
    if (!isPendingOffer(contract)) continue;
    if (walletIsParty(wallet, contract.freelancer)) {
      // Freelancer first: the accept/decline response is never hidden, even
      // when the same wallet is also the employer on this contract.
      awaitingYourResponse.push(toOfferItem(contract, "employer", now));
    } else if (walletIsParty(wallet, contract.employer)) {
      waitingForFreelancer.push(toOfferItem(contract, "freelancer", now));
    }
  }
  awaitingYourResponse.sort(byDeadline);
  waitingForFreelancer.sort(byDeadline);
  return { awaitingYourResponse, waitingForFreelancer };
}

/**
 * Account-level PendingAcceptance sections across all verified linked wallets.
 *
 * Freelancer ownership is checked first so an actionable response is not hidden
 * when another wallet belonging to the same PREMIFLOW account is the employer.
 */
export function offerSectionsForWallets(
  wallets: readonly PublicKey[],
  contracts: readonly ContractView[],
  now: number
): OfferSections {
  const awaitingYourResponse: OfferListItem[] = [];
  const waitingForFreelancer: OfferListItem[] = [];

  for (const contract of contracts) {
    if (!isPendingOffer(contract)) continue;

    if (walletSetIncludesParty(wallets, contract.freelancer)) {
      awaitingYourResponse.push(
        toOfferItem(contract, "employer", now)
      );
    } else if (walletSetIncludesParty(wallets, contract.employer)) {
      waitingForFreelancer.push(
        toOfferItem(contract, "freelancer", now)
      );
    }
  }

  awaitingYourResponse.sort(byDeadline);
  waitingForFreelancer.sort(byDeadline);

  return { awaitingYourResponse, waitingForFreelancer };
}

export function offerItemCopy(
  item: OfferListItem,
  formatTime: (seconds: number) => string = formatUnix
): OfferItemCopy {
  const deadlineText = formatTime(item.acceptanceDeadline);
  if (item.counterpartyRole === "employer") {
    // Viewer is the freelancer on this contract.
    return {
      statusLabel: item.deadlinePassed
        ? OFFER_SECTIONS_COPY.expiredFreelancerStatus
        : OFFER_SECTIONS_COPY.awaitingStatus,
      counterpartyLabel: OFFER_SECTIONS_COPY.employerLabel,
      deadlineNote: item.deadlinePassed
        ? "The acceptance deadline has passed. This offer can only be declined."
        : `Respond by ${deadlineText}`,
      deadlineText,
      actionLabel: OFFER_SECTIONS_COPY.awaitingAction,
    };
  }
  // Viewer is the employer: informational only.
  return {
    statusLabel: item.deadlinePassed
      ? OFFER_SECTIONS_COPY.deadlinePassedStatus
      : OFFER_SECTIONS_COPY.waitingStatus,
    counterpartyLabel: OFFER_SECTIONS_COPY.freelancerLabel,
    deadlineNote: item.deadlinePassed
      ? "The acceptance deadline has passed, so the freelancer can no longer accept this offer."
      : `The freelancer can accept until ${deadlineText}`,
    deadlineText,
    actionLabel: OFFER_SECTIONS_COPY.waitingAction,
  };
}

/**
 * Status label for lists and cards. PendingAcceptance reads from the viewer's
 * side (freelancer first); all other statuses keep the shared presentStatus
 * output. On-chain status values are never changed.
 */
export function roleAwareStatusLabel(
  wallet: PublicKey | null | undefined,
  contract: Pick<ContractView, "status" | "employer" | "freelancer"> & EndedStatusFields,
  now?: number
): string {
  if (contract.status === "PendingAcceptance") {
    if (walletIsParty(wallet, contract.freelancer)) return ROLE_AWARE_STATUS_COPY.freelancerOffer;
    if (walletIsParty(wallet, contract.employer)) return ROLE_AWARE_STATUS_COPY.employerOffer;
  }
  return endedAwareStatus(contract, now);
}

/**
 * Employer next steps shown on the home page. Mirrors availableActions only:
 * Milestone Draft offers addMilestone/finalizeTerms while now < acceptanceDeadline,
 * and PendingEmployerApproval always offers the employer an activation decision.
 * Links go to the detail page; no action or transaction logic lives here.
 */
/**
 * Account-facing status wording across all verified linked wallets.
 */
export function roleAwareStatusLabelForWallets(
  wallets: readonly PublicKey[],
  contract: Pick<ContractView, "status" | "employer" | "freelancer"> & EndedStatusFields,
  now?: number
): string {
  if (contract.status === "PendingAcceptance") {
    if (walletSetIncludesParty(wallets, contract.freelancer)) {
      return ROLE_AWARE_STATUS_COPY.freelancerOffer;
    }

    if (walletSetIncludesParty(wallets, contract.employer)) {
      return ROLE_AWARE_STATUS_COPY.employerOffer;
    }
  }

  return endedAwareStatus(contract, now);
}

export function actionRequiredItems(
  wallet: PublicKey | null,
  contracts: readonly ContractView[],
  now: number
): ActionRequiredItem[] {
  const items: ActionRequiredItem[] = [];
  if (!wallet) return items;
  for (const contract of contracts) {
    if (!walletIsParty(wallet, contract.employer)) continue;
    let kind: ActionRequiredItem["kind"] | null = null;
    if (
      contract.status === "Draft" &&
      contract.paymentMode === "Milestone" &&
      now < contract.acceptanceDeadline
    ) {
      kind = "finishSetup";
    } else if (contract.status === "PendingEmployerApproval") {
      kind = "reviewActivation";
    } else if (contract.status === "Draft" && now >= contract.acceptanceDeadline) {
      // availableActions offers the employer expireAcceptance on a Draft past its deadline.
      kind = "expiredDraft";
    }
    if (!kind) continue;
    const address = contract.address.toBase58();
    items.push({
      address,
      href: contractHref(address),
      mode: contract.paymentMode,
      kind,
      freelancerAddress: contract.freelancer.toBase58(),
      note:
        ACTION_REQUIRED_COPY[kind],
      actionLabel: ACTION_REQUIRED_COPY.action,
    });
  }
  return items;
}

/**
 * Employer next steps across all verified wallets linked to the account.
 *
 * This only discovers/display actions. Executing an action still requires
 * the specific connected signing wallet with on-chain authority.
 */
export function actionRequiredItemsForWallets(
  wallets: readonly PublicKey[],
  contracts: readonly ContractView[],
  now: number
): ActionRequiredItem[] {
  const items: ActionRequiredItem[] = [];

  for (const contract of contracts) {
    if (!walletSetIncludesParty(wallets, contract.employer)) continue;

    let kind: ActionRequiredItem["kind"] | null = null;

    if (
      contract.status === "Draft" &&
      contract.paymentMode === "Milestone" &&
      now < contract.acceptanceDeadline
    ) {
      kind = "finishSetup";
    } else if (contract.status === "PendingEmployerApproval") {
      kind = "reviewActivation";
    } else if (
      contract.status === "Draft" &&
      now >= contract.acceptanceDeadline
    ) {
      kind = "expiredDraft";
    }

    if (!kind) continue;

    const address = contract.address.toBase58();

    items.push({
      address,
      href: contractHref(address),
      mode: contract.paymentMode,
      kind,
      freelancerAddress: contract.freelancer.toBase58(),
      note: ACTION_REQUIRED_COPY[kind],
      actionLabel: ACTION_REQUIRED_COPY.action,
    });
  }

  return items;
}

/**
 * "Streaming now": Active streaming contracts only (never PendingAcceptance).
 * With `now`, streams at or after end_time are excluded (they show "Streaming ended").
 */
export function liveStreamContracts<
  T extends Pick<ContractView, "paymentMode" | "status"> &
    Partial<Pick<ContractView, "startTime" | "endTime">>,
>(contracts: readonly T[], now?: number): T[] {
  return contracts.filter(
    (c) =>
      c.paymentMode === "Streaming" &&
      c.status === "Active" &&
      !(
        now !== undefined &&
        c.startTime !== undefined &&
        c.endTime !== undefined &&
        isStreamEnded(
          { paymentMode: c.paymentMode, status: c.status, startTime: c.startTime, endTime: c.endTime },
          now
        )
      )
  );
}

/** Viewer's side on one contract; "both" when one wallet is employer and freelancer. */
export type ViewerPartyRole = "employer" | "freelancer" | "both" | "resolver" | "none";

export const BOTH_PARTIES_CARD_LABEL = "You are both employer and freelancer";

export function viewerPartyRole(
  wallet: PublicKey | null | undefined,
  contract: Pick<ContractView, "employer" | "freelancer" | "resolver">
): ViewerPartyRole {
  if (!wallet) return "none";
  const isEmployer = walletIsParty(wallet, contract.employer);
  const isFreelancer = walletIsParty(wallet, contract.freelancer);
  if (isEmployer && isFreelancer) return "both";
  if (isFreelancer) return "freelancer";
  if (isEmployer) return "employer";
  if (walletIsParty(wallet, contract.resolver)) return "resolver";
  return "none";
}

/**
 * accept_contract only checks `has_one = freelancer` (there is no
 * employer != freelancer rule), so a wallet that is both parties may accept or
 * decline its own offer. availableActions resolves such a wallet as employer
 * first; this UI-layer helper restores the freelancer response with the same
 * deadline rule (accept only before acceptanceDeadline, decline always) and
 * leaves availableActions and on-chain permissions unchanged.
 */
export function withSameWalletOfferActions(
  actions: readonly UiAction[],
  wallet: PublicKey | null | undefined,
  contract: Pick<
    ContractView,
    "employer" | "freelancer" | "resolver" | "status" | "acceptanceDeadline"
  >,
  now: number
): UiAction[] {
  if (contract.status !== "PendingAcceptance") return [...actions];
  if (viewerPartyRole(wallet, contract) !== "both") return [...actions];
  const next = new Set<UiAction>(actions);
  if (now < contract.acceptanceDeadline) next.add("acceptContract");
  next.add("declineContract");
  return [...next];
}
