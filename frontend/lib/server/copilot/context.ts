import { PublicKey } from "@solana/web3.js";

import {
  detectWalletRole,
  deterministicActions,
  roleLabelForAssistant,
} from "@/lib/app/copilot-live";
import type { CopilotRoleLabel } from "@/lib/app/copilot-schemas";
import type { ContractView, HourlyStateView, UiAction, WorkUnitView } from "@/lib/streampay-v2";

import type { AccountReader } from "../solana/read-contract-parties";
import {
  ContractSnapshotError,
  readContractSnapshot,
  snapshotToContractView,
  type ContractSnapshot,
} from "../solana/read-contract-snapshot";
import { readRelatedLiveAccounts } from "../solana/read-work-unit-snapshot";

export type LiveAssistantContext = {
  snapshot: ContractSnapshot;
  contract: ContractView;
  trial: WorkUnitView | null;
  workUnits: WorkUnitView[];
  hourlyState: HourlyStateView | null;
  role: CopilotRoleLabel;
  actions: UiAction[];
  now: number;
  privateMessagesIncluded: false;
};

export async function loadLiveAssistantContext(input: {
  reader: AccountReader;
  contractAddress: string;
  wallet: string;
  now?: number;
  browserClaim?: { status?: string; totalAmount?: string };
}): Promise<LiveAssistantContext> {
  const snapshot = await readContractSnapshot(input.reader, input.contractAddress);
  if (input.browserClaim?.status && input.browserClaim.status !== snapshot.facts.status) {
    // Authoritative chain status always wins. Browser claim is ignored.
  }
  if (
    input.browserClaim?.totalAmount &&
    input.browserClaim.totalAmount !== snapshot.totalAmount
  ) {
    // Authoritative chain amount always wins.
  }
  const contract = snapshotToContractView(snapshot);
  const related = await readRelatedLiveAccounts(
    input.reader,
    new PublicKey(snapshot.address),
    snapshot.workUnitCount,
    snapshot.facts.paymentMode,
    BigInt(snapshot.trialAmount) > 0n
  );
  const now = input.now ?? Math.floor(Date.now() / 1000);
  const role = roleLabelForAssistant(detectWalletRole(input.wallet, contract));
  const actions = deterministicActions({
    wallet: input.wallet,
    contract,
    trial: related.trial,
    workUnit: related.workUnits[0] ?? related.trial,
    hourlyState: related.hourlyState,
    now,
  });
  return {
    snapshot,
    contract,
    trial: related.trial,
    workUnits: related.workUnits,
    hourlyState: related.hourlyState,
    role,
    actions,
    now,
    privateMessagesIncluded: false,
  };
}

export { ContractSnapshotError };
