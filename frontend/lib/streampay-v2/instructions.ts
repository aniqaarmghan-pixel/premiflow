import { SystemProgram } from "@solana/web3.js";
import type { PublicKey } from "@solana/web3.js";

import { assertMetadataUri } from "./metadata";
import {
  deriveContractAddresses,
  deriveContractEscrowPda,
  deriveHourlySessionPda,
  deriveHourlyStatePda,
  deriveTrialWorkUnitPda,
  deriveWorkUnitPda,
} from "./pda";
import type { StreamPayV2Program } from "./program";
import { fetchContract, fetchHourlyState, fetchWorkUnit } from "./accounts";
import { txResult, type TransactionResult } from "./results";
import { TOKEN_PROGRAM_ID, deriveEmployerSourceAta, deriveFreelancerDestinationAta } from "./tokens";
import { toHashArray } from "./bytes";
import { requireU64 } from "./format";
import { HOURLY_NO_ACTIVE_SESSION } from "./constants";
import { sendV2Method } from "./send";
import {
  encodePaymentMode,
  encodeStartMode,
  toBn,
  type CreateContractRequest,
  type CreateHourlyContractRequest,
  type PaymentModeName,
} from "./types";
import { hasActiveHourlySession } from "./hourly";

function connectedWallet(program: StreamPayV2Program): PublicKey {
  const key = program.provider.publicKey;
  if (!key) {
    throw new Error("wallet is not connected");
  }
  return key;
}

export function toCreateContractArgs(request: CreateContractRequest) {
  assertMetadataUri(request.metadataUri);
  requireU64(request.totalAmount, "totalAmount");
  requireU64(request.trialAmount, "trialAmount");
  requireU64(request.contractId, "contractId");
  return {
    contractId: toBn(request.contractId),
    paymentMode: encodePaymentMode(request.paymentMode),
    startMode: encodeStartMode(request.startMode),
    totalAmount: toBn(request.totalAmount),
    acceptanceDeadline: toBn(request.acceptanceDeadline),
    scheduledStartTime: toBn(request.scheduledStartTime),
    durationSeconds: toBn(request.durationSeconds),
    checkpointInterval: toBn(request.checkpointInterval),
    reviewDuration: toBn(request.reviewDuration),
    activationReviewDuration: toBn(request.activationReviewDuration),
    maxRevisions: request.maxRevisions,
    trialAmount: toBn(request.trialAmount),
    resolver: request.resolver,
    metadataUri: request.metadataUri,
    metadataHash: toHashArray(request.metadataHash),
  };
}

export function withdrawFreelancerAccounts(params: {
  freelancer: PublicKey;
  contract: PublicKey;
  tokenMint: PublicKey;
  contractEscrow: PublicKey;
  freelancerTokenAccount: PublicKey;
}) {
  return {
    freelancer: params.freelancer,
    contract: params.contract,
    tokenMint: params.tokenMint,
    contractEscrow: params.contractEscrow,
    freelancerTokenAccount: params.freelancerTokenAccount,
    tokenProgram: TOKEN_PROGRAM_ID,
  };
}

export function claimEmployerRefundAccounts(params: {
  employer: PublicKey;
  contract: PublicKey;
  tokenMint: PublicKey;
  contractEscrow: PublicKey;
  employerTokenAccount: PublicKey;
}) {
  return {
    employer: params.employer,
    contract: params.contract,
    tokenMint: params.tokenMint,
    contractEscrow: params.contractEscrow,
    employerTokenAccount: params.employerTokenAccount,
    tokenProgram: TOKEN_PROGRAM_ID,
  };
}

export function openDisputeAccounts(params: {
  party: PublicKey;
  contract: PublicKey;
  hourlyState: PublicKey | null;
  hourlySession: PublicKey | null;
}) {
  return {
    party: params.party,
    contract: params.contract,
    hourlyState: params.hourlyState,
    hourlySession: params.hourlySession,
  };
}

export function cancelActiveContractAccounts(params: {
  employer: PublicKey;
  contract: PublicKey;
  hourlyState: PublicKey | null;
}) {
  return {
    employer: params.employer,
    contract: params.contract,
    hourlyState: params.hourlyState,
  };
}

export function resolveOpenDisputeHourlyOptionals(params: {
  paymentMode: PaymentModeName;
  contract: PublicKey;
  programId: PublicKey;
  activeSessionIndex?: number;
}): { hourlyState: PublicKey | null; hourlySession: PublicKey | null } {
  if (params.paymentMode !== "Hourly") {
    return { hourlyState: null, hourlySession: null };
  }
  const hourlyState = deriveHourlyStatePda(
    params.contract,
    params.programId
  ).address;
  const hourlySession = hasActiveHourlySession({
    activeSessionIndex: params.activeSessionIndex ?? HOURLY_NO_ACTIVE_SESSION,
  })
    ? deriveHourlySessionPda(
        params.contract,
        params.activeSessionIndex as number,
        params.programId
      ).address
    : null;
  return { hourlyState, hourlySession };
}

export function toCreateHourlyContractArgs(request: CreateHourlyContractRequest) {
  assertMetadataUri(request.metadataUri);
  requireU64(request.hourlyRate, "hourlyRate");
  requireU64(request.authorizedSeconds, "authorizedSeconds");
  requireU64(request.trialAmount, "trialAmount");
  requireU64(request.contractId, "contractId");
  return {
    contractId: toBn(request.contractId),
    hourlyRate: toBn(request.hourlyRate),
    authorizedSeconds: toBn(request.authorizedSeconds),
    acceptanceDeadline: toBn(request.acceptanceDeadline),
    durationSeconds: toBn(request.durationSeconds),
    reviewDuration: toBn(request.reviewDuration),
    activationReviewDuration: toBn(request.activationReviewDuration),
    maxRevisions: request.maxRevisions,
    trialAmount: toBn(request.trialAmount),
    resolver: request.resolver,
    metadataUri: request.metadataUri,
    metadataHash: toHashArray(request.metadataHash),
  };
}

export class StreamPayV2Client {
  constructor(readonly program: StreamPayV2Program) {}

  async createContract(params: {
    request: CreateContractRequest;
    freelancer: PublicKey;
    tokenMint: PublicKey;
    employerTokenAccount?: PublicKey;
  }): Promise<TransactionResult> {
    const employer = connectedWallet(this.program);
    const args = toCreateContractArgs(params.request);
    const pdas = deriveContractAddresses(
      employer,
      params.freelancer,
      params.request.contractId,
      this.program.programId
    );
    const employerTokenAccount =
      params.employerTokenAccount ??
      deriveEmployerSourceAta(employer, params.tokenMint);
    const trialWorkUnit =
      params.request.trialAmount > 0n ? pdas.trialWorkUnit.address : null;
    const fixedWorkUnit =
      params.request.paymentMode === "Fixed" ? pdas.fixedWorkUnit.address : null;

    const signature = await sendV2Method(this.program, this.program.methods
      .createContract(args)
      .accountsPartial({
        employer,
        freelancer: params.freelancer,
        tokenMint: params.tokenMint,
        employerTokenAccount,
        contract: pdas.contract.address,
        contractEscrow: pdas.escrow.address,
        trialWorkUnit,
        fixedWorkUnit,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
    );

    return txResult({
      signature,
      contract: pdas.contract.address,
      trialWorkUnit: trialWorkUnit ?? undefined,
      workUnit: fixedWorkUnit ?? undefined,
      escrow: pdas.escrow.address,
      extra: {
        employer,
        freelancer: params.freelancer,
        tokenMint: params.tokenMint,
        employerTokenAccount,
      },
    });
  }

  async createHourlyContract(params: {
    request: CreateHourlyContractRequest;
    freelancer: PublicKey;
    tokenMint: PublicKey;
    employerTokenAccount?: PublicKey;
  }): Promise<TransactionResult> {
    const employer = connectedWallet(this.program);
    const args = toCreateHourlyContractArgs(params.request);
    const pdas = deriveContractAddresses(
      employer,
      params.freelancer,
      params.request.contractId,
      this.program.programId
    );
    const hourlyState = deriveHourlyStatePda(
      pdas.contract.address,
      this.program.programId
    ).address;
    const employerTokenAccount =
      params.employerTokenAccount ??
      deriveEmployerSourceAta(employer, params.tokenMint);
    const trialWorkUnit =
      params.request.trialAmount > 0n ? pdas.trialWorkUnit.address : null;

    const signature = await sendV2Method(this.program, this.program.methods
      .createHourlyContract(args)
      .accountsPartial({
        employer,
        freelancer: params.freelancer,
        tokenMint: params.tokenMint,
        employerTokenAccount,
        contract: pdas.contract.address,
        contractEscrow: pdas.escrow.address,
        hourlyState,
        trialWorkUnit,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
    );

    return txResult({
      signature,
      contract: pdas.contract.address,
      trialWorkUnit: trialWorkUnit ?? undefined,
      escrow: pdas.escrow.address,
      extra: {
        employer,
        freelancer: params.freelancer,
        tokenMint: params.tokenMint,
        employerTokenAccount,
        hourlyState,
      },
    });
  }

  async startHourlySession(contract: PublicKey): Promise<TransactionResult> {
    const freelancer = connectedWallet(this.program);
    const hourlyState = deriveHourlyStatePda(
      contract,
      this.program.programId
    ).address;
    const state = await fetchHourlyState(this.program, hourlyState);
    const hourlySession = deriveHourlySessionPda(
      contract,
      state.sessionCount,
      this.program.programId
    ).address;
    const signature = await sendV2Method(this.program, this.program.methods
      .startHourlySession()
      .accountsPartial({
        freelancer,
        contract,
        hourlyState,
        hourlySession,
        systemProgram: SystemProgram.programId,
      })
    );
    return txResult({
      signature,
      contract,
      extra: { hourlyState, hourlySession },
    });
  }

  async stopHourlySession(params: {
    contract: PublicKey;
    workLogUri: string;
    workLogHash: Uint8Array | number[];
  }): Promise<TransactionResult> {
    const freelancer = connectedWallet(this.program);
    assertMetadataUri(params.workLogUri);
    const hourlyState = deriveHourlyStatePda(
      params.contract,
      this.program.programId
    ).address;
    const state = await fetchHourlyState(this.program, hourlyState);
    const hourlySession = deriveHourlySessionPda(
      params.contract,
      state.activeSessionIndex,
      this.program.programId
    ).address;
    const signature = await sendV2Method(this.program, this.program.methods
      .stopHourlySession(params.workLogUri, toHashArray(params.workLogHash))
      .accountsPartial({
        freelancer,
        contract: params.contract,
        hourlyState,
        hourlySession,
      })
    );
    return txResult({
      signature,
      contract: params.contract,
      extra: { hourlyState, hourlySession },
    });
  }

  async endHourlyContract(contract: PublicKey): Promise<TransactionResult> {
    const employer = connectedWallet(this.program);
    const hourlyState = deriveHourlyStatePda(
      contract,
      this.program.programId
    ).address;
    const signature = await sendV2Method(this.program, this.program.methods
      .endHourlyContract()
      .accountsPartial({ employer, contract, hourlyState })
    );
    return txResult({ signature, contract, extra: { hourlyState } });
  }

  async addMilestone(params: {
    contract: PublicKey;
    amount: bigint;
    dueOffsetSeconds: number;
  }): Promise<TransactionResult> {
    const employer = connectedWallet(this.program);
    requireU64(params.amount, "amount");
    const contract = await fetchContract(this.program, params.contract);
    const workUnit = deriveWorkUnitPda(
      params.contract,
      contract.workUnitCount,
      this.program.programId
    ).address;
    const signature = await sendV2Method(this.program, this.program.methods
      .addMilestone(toBn(params.amount), toBn(params.dueOffsetSeconds))
      .accountsPartial({
        employer,
        contract: params.contract,
        workUnit,
        systemProgram: SystemProgram.programId,
      })
    );
    return txResult({ signature, contract: params.contract, workUnit });
  }

  async finalizeTerms(contract: PublicKey): Promise<TransactionResult> {
    const employer = connectedWallet(this.program);
    const signature = await sendV2Method(this.program, this.program.methods
      .finalizeTerms()
      .accountsPartial({ employer, contract })
    );
    return txResult({ signature, contract });
  }

  async acceptContract(contract: PublicKey): Promise<TransactionResult> {
    const freelancer = connectedWallet(this.program);
    const signature = await sendV2Method(this.program, this.program.methods
      .acceptContract()
      .accountsPartial({ freelancer, contract })
    );
    return txResult({ signature, contract });
  }

  async declineContract(contract: PublicKey): Promise<TransactionResult> {
    const freelancer = connectedWallet(this.program);
    const signature = await sendV2Method(this.program, this.program.methods
      .declineContract()
      .accountsPartial({ freelancer, contract })
    );
    return txResult({ signature, contract });
  }

  async expireAcceptance(contract: PublicKey): Promise<TransactionResult> {
    const caller = connectedWallet(this.program);
    const signature = await sendV2Method(this.program, this.program.methods
      .expireAcceptance()
      .accountsPartial({ caller, contract })
    );
    return txResult({ signature, contract });
  }

  async expireActivation(contract: PublicKey): Promise<TransactionResult> {
    const caller = connectedWallet(this.program);
    const fetched = await fetchContract(this.program, contract);
    const trialWorkUnit =
      fetched.trialAmount > 0n
        ? deriveTrialWorkUnitPda(contract, this.program.programId).address
        : null;
    const signature = await sendV2Method(this.program, this.program.methods
      .expireActivation()
      .accountsPartial({ caller, contract, trialWorkUnit })
    );
    return txResult({
      signature,
      contract,
      trialWorkUnit: trialWorkUnit ?? undefined,
    });
  }

  async approveActivation(contract: PublicKey): Promise<TransactionResult> {
    const employer = connectedWallet(this.program);
    const signature = await sendV2Method(this.program, this.program.methods
      .approveActivation()
      .accountsPartial({ employer, contract })
    );
    return txResult({ signature, contract });
  }

  async rejectActivation(contract: PublicKey): Promise<TransactionResult> {
    const employer = connectedWallet(this.program);
    const fetched = await fetchContract(this.program, contract);
    const trialWorkUnit =
      fetched.trialAmount > 0n
        ? deriveTrialWorkUnitPda(contract, this.program.programId).address
        : null;
    const signature = await sendV2Method(this.program, this.program.methods
      .rejectActivation()
      .accountsPartial({ employer, contract, trialWorkUnit })
    );
    return txResult({
      signature,
      contract,
      trialWorkUnit: trialWorkUnit ?? undefined,
    });
  }

  async submitTrialWork(params: {
    contract: PublicKey;
    submissionUri: string;
    submissionHash: Uint8Array | number[];
  }): Promise<TransactionResult> {
    const freelancer = connectedWallet(this.program);
    assertMetadataUri(params.submissionUri);
    const trialWorkUnit = deriveTrialWorkUnitPda(
      params.contract,
      this.program.programId
    ).address;
    const signature = await sendV2Method(this.program, this.program.methods
      .submitTrialWork(params.submissionUri, toHashArray(params.submissionHash))
      .accountsPartial({
        freelancer,
        contract: params.contract,
        trialWorkUnit,
      })
    );
    return txResult({
      signature,
      contract: params.contract,
      trialWorkUnit,
    });
  }

  async requestTrialRevision(contract: PublicKey): Promise<TransactionResult> {
    const employer = connectedWallet(this.program);
    const trialWorkUnit = deriveTrialWorkUnitPda(
      contract,
      this.program.programId
    ).address;
    const signature = await sendV2Method(this.program, this.program.methods
      .requestTrialRevision()
      .accountsPartial({ employer, contract, trialWorkUnit })
    );
    return txResult({ signature, contract, trialWorkUnit });
  }

  async approveTrialAndActivate(contract: PublicKey): Promise<TransactionResult> {
    const employer = connectedWallet(this.program);
    const trialWorkUnit = deriveTrialWorkUnitPda(
      contract,
      this.program.programId
    ).address;
    const signature = await sendV2Method(this.program, this.program.methods
      .approveTrialAndActivate()
      .accountsPartial({ employer, contract, trialWorkUnit })
    );
    return txResult({ signature, contract, trialWorkUnit });
  }

  async settleTrialAndEnd(contract: PublicKey): Promise<TransactionResult> {
    const employer = connectedWallet(this.program);
    const trialWorkUnit = deriveTrialWorkUnitPda(
      contract,
      this.program.programId
    ).address;
    const signature = await sendV2Method(this.program, this.program.methods
      .settleTrialAndEnd()
      .accountsPartial({ employer, contract, trialWorkUnit })
    );
    return txResult({ signature, contract, trialWorkUnit });
  }

  async finalizeTrialReviewTimeout(contract: PublicKey): Promise<TransactionResult> {
    const caller = connectedWallet(this.program);
    const trialWorkUnit = deriveTrialWorkUnitPda(
      contract,
      this.program.programId
    ).address;
    const signature = await sendV2Method(this.program, this.program.methods
      .finalizeTrialReviewTimeout()
      .accountsPartial({ caller, contract, trialWorkUnit })
    );
    return txResult({ signature, contract, trialWorkUnit });
  }

  async submitWorkUnit(params: {
    contract: PublicKey;
    workUnit: PublicKey;
    submissionUri: string;
    submissionHash: Uint8Array | number[];
  }): Promise<TransactionResult> {
    const freelancer = connectedWallet(this.program);
    assertMetadataUri(params.submissionUri);
    const signature = await sendV2Method(this.program, this.program.methods
      .submitWorkUnit(params.submissionUri, toHashArray(params.submissionHash))
      .accountsPartial({
        freelancer,
        contract: params.contract,
        workUnit: params.workUnit,
      })
    );
    return txResult({
      signature,
      contract: params.contract,
      workUnit: params.workUnit,
    });
  }

  async requestWorkRevision(params: {
    contract: PublicKey;
    workUnit: PublicKey;
  }): Promise<TransactionResult> {
    const employer = connectedWallet(this.program);
    const signature = await sendV2Method(this.program, this.program.methods
      .requestRevision()
      .accountsPartial({
        employer,
        contract: params.contract,
        workUnit: params.workUnit,
      })
    );
    return txResult({
      signature,
      contract: params.contract,
      workUnit: params.workUnit,
    });
  }

  async voidStaleRevision(params: {
    contract: PublicKey;
    workUnit: PublicKey;
  }): Promise<TransactionResult> {
    const employer = connectedWallet(this.program);
    const signature = await sendV2Method(this.program, this.program.methods
      .voidStaleRevision()
      .accountsPartial({
        employer,
        contract: params.contract,
        workUnit: params.workUnit,
      })
    );
    return txResult({
      signature,
      contract: params.contract,
      workUnit: params.workUnit,
    });
  }

  async approveWorkUnit(params: {
    contract: PublicKey;
    workUnit: PublicKey;
  }): Promise<TransactionResult> {
    const employer = connectedWallet(this.program);
    const signature = await sendV2Method(this.program, this.program.methods
      .approveWorkUnit()
      .accountsPartial({
        employer,
        contract: params.contract,
        workUnit: params.workUnit,
      })
    );
    return txResult({
      signature,
      contract: params.contract,
      workUnit: params.workUnit,
    });
  }

  async finalizeReviewTimeout(params: {
    contract: PublicKey;
    workUnit: PublicKey;
  }): Promise<TransactionResult> {
    const caller = connectedWallet(this.program);
    const signature = await sendV2Method(this.program, this.program.methods
      .finalizeReviewTimeout()
      .accountsPartial({
        caller,
        contract: params.contract,
        workUnit: params.workUnit,
      })
    );
    return txResult({
      signature,
      contract: params.contract,
      workUnit: params.workUnit,
    });
  }

  async releaseStreamAccrual(contract: PublicKey): Promise<TransactionResult> {
    const caller = connectedWallet(this.program);
    const signature = await sendV2Method(this.program, this.program.methods
      .releaseStreamAccrual()
      .accountsPartial({ caller, contract })
    );
    return txResult({ signature, contract });
  }

  async cancelActiveContract(contract: PublicKey): Promise<TransactionResult> {
    const employer = connectedWallet(this.program);
    const view = await fetchContract(this.program, contract);
    const hourlyState =
      view.paymentMode === "Hourly"
        ? deriveHourlyStatePda(contract, this.program.programId).address
        : null;
    const signature = await sendV2Method(this.program, this.program.methods
      .cancelActiveContract()
      .accountsPartial(
        cancelActiveContractAccounts({ employer, contract, hourlyState })
      )
    );
    return txResult({
      signature,
      contract,
      extra: hourlyState ? { hourlyState } : {},
    });
  }

  async withdrawFreelancer(params: {
    contract: PublicKey;
    freelancerTokenAccount?: PublicKey;
  }): Promise<TransactionResult> {
    const freelancer = connectedWallet(this.program);
    const contract = await fetchContract(this.program, params.contract);
    const escrow = deriveContractEscrowPda(
      params.contract,
      this.program.programId
    ).address;
    const freelancerTokenAccount =
      params.freelancerTokenAccount ??
      deriveFreelancerDestinationAta(freelancer, contract.tokenMint);
    const signature = await sendV2Method(this.program, this.program.methods
      .withdrawFreelancer()
      .accountsPartial(
        withdrawFreelancerAccounts({
          freelancer,
          contract: params.contract,
          tokenMint: contract.tokenMint,
          contractEscrow: escrow,
          freelancerTokenAccount,
        })
      )
    );
    return txResult({
      signature,
      contract: params.contract,
      escrow,
      extra: { freelancerTokenAccount },
    });
  }

  async claimEmployerRefund(params: {
    contract: PublicKey;
    employerTokenAccount?: PublicKey;
  }): Promise<TransactionResult> {
    const employer = connectedWallet(this.program);
    const contract = await fetchContract(this.program, params.contract);
    const escrow = deriveContractEscrowPda(
      params.contract,
      this.program.programId
    ).address;
    const employerTokenAccount =
      params.employerTokenAccount ??
      deriveEmployerSourceAta(employer, contract.tokenMint);
    const signature = await sendV2Method(this.program, this.program.methods
      .claimEmployerRefund()
      .accountsPartial(
        claimEmployerRefundAccounts({
          employer,
          contract: params.contract,
          tokenMint: contract.tokenMint,
          contractEscrow: escrow,
          employerTokenAccount,
        })
      )
    );
    return txResult({
      signature,
      contract: params.contract,
      escrow,
      extra: { employerTokenAccount },
    });
  }

  async openDispute(contract: PublicKey): Promise<TransactionResult> {
    const party = connectedWallet(this.program);
    const view = await fetchContract(this.program, contract);
    let activeSessionIndex: number | undefined;
    if (view.paymentMode === "Hourly") {
      const hourlyStatePda = deriveHourlyStatePda(
        contract,
        this.program.programId
      ).address;
      const state = await fetchHourlyState(this.program, hourlyStatePda);
      activeSessionIndex = state.activeSessionIndex;
    }
    const { hourlyState, hourlySession } = resolveOpenDisputeHourlyOptionals({
      paymentMode: view.paymentMode,
      contract,
      programId: this.program.programId,
      activeSessionIndex,
    });
    const signature = await sendV2Method(this.program, this.program.methods
      .openDispute()
      .accountsPartial(
        openDisputeAccounts({
          party,
          contract,
          hourlyState,
          hourlySession,
        })
      )
    );
    return txResult({
      signature,
      contract,
      extra: {
        ...(hourlyState ? { hourlyState } : {}),
        ...(hourlySession ? { hourlySession } : {}),
      },
    });
  }

  async resolveDispute(params: {
    contract: PublicKey;
    freelancerContestedAward: bigint;
  }): Promise<TransactionResult> {
    const resolver = connectedWallet(this.program);
    requireU64(params.freelancerContestedAward, "freelancerContestedAward");
    const signature = await sendV2Method(this.program, this.program.methods
      .resolveDispute(toBn(params.freelancerContestedAward))
      .accountsPartial({ resolver, contract: params.contract })
    );
    return txResult({ signature, contract: params.contract });
  }

  async completeContract(contract: PublicKey): Promise<TransactionResult> {
    const caller = connectedWallet(this.program);
    const signature = await sendV2Method(this.program, this.program.methods
      .completeContract()
      .accountsPartial({ caller, contract })
    );
    return txResult({ signature, contract });
  }

  async submitWorkUnitByIndex(params: {
    contract: PublicKey;
    index: number;
    submissionUri: string;
    submissionHash: Uint8Array | number[];
  }): Promise<TransactionResult> {
    const workUnit = deriveWorkUnitPda(
      params.contract,
      params.index,
      this.program.programId
    ).address;
    return this.submitWorkUnit({
      contract: params.contract,
      workUnit,
      submissionUri: params.submissionUri,
      submissionHash: params.submissionHash,
    });
  }

  async fetchWorkUnitOrThrow(address: PublicKey) {
    return fetchWorkUnit(this.program, address);
  }
}
