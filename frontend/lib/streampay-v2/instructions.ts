import { SystemProgram } from "@solana/web3.js";
import type { PublicKey } from "@solana/web3.js";

import { assertMetadataUri } from "./metadata";
import {
  deriveContractAddresses,
  deriveContractEscrowPda,
  deriveTrialWorkUnitPda,
  deriveWorkUnitPda,
} from "./pda";
import type { StreamPayV2Program } from "./program";
import { fetchContract, fetchWorkUnit } from "./accounts";
import { txResult, type TransactionResult } from "./results";
import { TOKEN_PROGRAM_ID, deriveEmployerSourceAta, deriveFreelancerDestinationAta } from "./tokens";
import { toHashArray } from "./bytes";
import { requireU64 } from "./format";
import {
  encodePaymentMode,
  encodeStartMode,
  toBn,
  type CreateContractRequest,
} from "./types";

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

    const signature = await this.program.methods
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
      .rpc();

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
    const signature = await this.program.methods
      .addMilestone(toBn(params.amount), toBn(params.dueOffsetSeconds))
      .accountsPartial({
        employer,
        contract: params.contract,
        workUnit,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    return txResult({ signature, contract: params.contract, workUnit });
  }

  async finalizeTerms(contract: PublicKey): Promise<TransactionResult> {
    const employer = connectedWallet(this.program);
    const signature = await this.program.methods
      .finalizeTerms()
      .accountsPartial({ employer, contract })
      .rpc();
    return txResult({ signature, contract });
  }

  async acceptContract(contract: PublicKey): Promise<TransactionResult> {
    const freelancer = connectedWallet(this.program);
    const signature = await this.program.methods
      .acceptContract()
      .accountsPartial({ freelancer, contract })
      .rpc();
    return txResult({ signature, contract });
  }

  async declineContract(contract: PublicKey): Promise<TransactionResult> {
    const freelancer = connectedWallet(this.program);
    const signature = await this.program.methods
      .declineContract()
      .accountsPartial({ freelancer, contract })
      .rpc();
    return txResult({ signature, contract });
  }

  async approveActivation(contract: PublicKey): Promise<TransactionResult> {
    const employer = connectedWallet(this.program);
    const signature = await this.program.methods
      .approveActivation()
      .accountsPartial({ employer, contract })
      .rpc();
    return txResult({ signature, contract });
  }

  async rejectActivation(contract: PublicKey): Promise<TransactionResult> {
    const employer = connectedWallet(this.program);
    const fetched = await fetchContract(this.program, contract);
    const trialWorkUnit =
      fetched.trialAmount > 0n
        ? deriveTrialWorkUnitPda(contract, this.program.programId).address
        : null;
    const signature = await this.program.methods
      .rejectActivation()
      .accountsPartial({ employer, contract, trialWorkUnit })
      .rpc();
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
    const signature = await this.program.methods
      .submitTrialWork(params.submissionUri, toHashArray(params.submissionHash))
      .accountsPartial({
        freelancer,
        contract: params.contract,
        trialWorkUnit,
      })
      .rpc();
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
    const signature = await this.program.methods
      .requestTrialRevision()
      .accountsPartial({ employer, contract, trialWorkUnit })
      .rpc();
    return txResult({ signature, contract, trialWorkUnit });
  }

  async approveTrialAndActivate(contract: PublicKey): Promise<TransactionResult> {
    const employer = connectedWallet(this.program);
    const trialWorkUnit = deriveTrialWorkUnitPda(
      contract,
      this.program.programId
    ).address;
    const signature = await this.program.methods
      .approveTrialAndActivate()
      .accountsPartial({ employer, contract, trialWorkUnit })
      .rpc();
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
    const signature = await this.program.methods
      .submitWorkUnit(params.submissionUri, toHashArray(params.submissionHash))
      .accountsPartial({
        freelancer,
        contract: params.contract,
        workUnit: params.workUnit,
      })
      .rpc();
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
    const signature = await this.program.methods
      .requestRevision()
      .accountsPartial({
        employer,
        contract: params.contract,
        workUnit: params.workUnit,
      })
      .rpc();
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
    const signature = await this.program.methods
      .approveWorkUnit()
      .accountsPartial({
        employer,
        contract: params.contract,
        workUnit: params.workUnit,
      })
      .rpc();
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
    const signature = await this.program.methods
      .finalizeReviewTimeout()
      .accountsPartial({
        caller,
        contract: params.contract,
        workUnit: params.workUnit,
      })
      .rpc();
    return txResult({
      signature,
      contract: params.contract,
      workUnit: params.workUnit,
    });
  }

  async releaseStreamAccrual(contract: PublicKey): Promise<TransactionResult> {
    const caller = connectedWallet(this.program);
    const signature = await this.program.methods
      .releaseStreamAccrual()
      .accountsPartial({ caller, contract })
      .rpc();
    return txResult({ signature, contract });
  }

  async cancelActiveContract(contract: PublicKey): Promise<TransactionResult> {
    const employer = connectedWallet(this.program);
    const signature = await this.program.methods
      .cancelActiveContract()
      .accountsPartial({ employer, contract })
      .rpc();
    return txResult({ signature, contract });
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
    const signature = await this.program.methods
      .withdrawFreelancer()
      .accountsPartial({
        freelancer,
        contract: params.contract,
        tokenMint: contract.tokenMint,
        contractEscrow: escrow,
        freelancerTokenAccount,
      })
      .rpc();
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
    const signature = await this.program.methods
      .claimEmployerRefund()
      .accountsPartial({
        employer,
        contract: params.contract,
        tokenMint: contract.tokenMint,
        contractEscrow: escrow,
        employerTokenAccount,
      })
      .rpc();
    return txResult({
      signature,
      contract: params.contract,
      escrow,
      extra: { employerTokenAccount },
    });
  }

  async openDispute(contract: PublicKey): Promise<TransactionResult> {
    const party = connectedWallet(this.program);
    const signature = await this.program.methods
      .openDispute()
      .accountsPartial({ party, contract })
      .rpc();
    return txResult({ signature, contract });
  }

  async resolveDispute(params: {
    contract: PublicKey;
    freelancerContestedAward: bigint;
  }): Promise<TransactionResult> {
    const resolver = connectedWallet(this.program);
    requireU64(params.freelancerContestedAward, "freelancerContestedAward");
    const signature = await this.program.methods
      .resolveDispute(toBn(params.freelancerContestedAward))
      .accountsPartial({ resolver, contract: params.contract })
      .rpc();
    return txResult({ signature, contract: params.contract });
  }

  async completeContract(contract: PublicKey): Promise<TransactionResult> {
    const caller = connectedWallet(this.program);
    const signature = await this.program.methods
      .completeContract()
      .accountsPartial({ caller, contract })
      .rpc();
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
