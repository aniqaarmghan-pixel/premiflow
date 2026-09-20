//! V2 events.
//!
//! Event structs are introduced in the phase that emits them, rather than all
//! at once, so that each event's field set is fixed alongside the instruction
//! that produces it:
//!
//! - Phase 1: `ContractCreated`
//! - Phase 2: `MilestoneAdded`, `TermsFinalized`
//! - Phase 3: `ContractAccepted`, `ContractDeclined`, `ContractActivated`,
//!   `ActivationRejected`, `ContractExpired`
//! - Phase 4: `TrialConfigured`, `TrialSubmitted`, `TrialRevisionRequested`,
//!   `TrialApproved`, `TrialRejected`, `TrialSettledAndEnded`
//! - Phase 5: `WorkUnitSubmitted`, `WorkUnitApproved`,
//!   `WorkUnitRevisionRequested`, `WorkUnitReviewTimedOut`
//! - Phase 6: `StreamAccrualReleased`
//! - Phase 7: `ContractCancellationSettled`
//! - Phase 8: `FreelancerWithdrawal`, `EmployerRefundClaimed`
//! - Phase 9: `DisputeOpened`, `DisputeResolved`
//! - Phase 10: `ContractCompleted`
//! - Phase H2: `HourlyContractCreated`, `HourlySessionStarted`,
//!   `HourlySessionRecorded`, `HourlyContractEnded`
//!
//! Every event carries `contract` as its first field so a client can index a
//! single contract's full history with one filter. Off-chain metadata URIs and
//! deliverable references are deliberately kept out of events: they are already
//! readable from account state, and duplicating them would bloat every log.

use anchor_lang::prelude::*;

use crate::v2::enums::{ContractStatus, DisputeParty, HourlySessionStatus, PaymentMode};

/// A contract was created and fully funded into escrow.
///
/// `status` is included because it is the one field an indexer cannot infer:
/// it distinguishes a contract that is immediately offerable
/// (`PendingAcceptance`) from a milestone contract still awaiting its
/// allocation (`Draft`).
#[event]
pub struct ContractCreated {
    pub contract: Pubkey,
    pub employer: Pubkey,
    pub freelancer: Pubkey,
    pub token_mint: Pubkey,
    pub contract_id: u64,
    pub payment_mode: PaymentMode,
    pub status: ContractStatus,
    pub total_amount: u64,
    pub created_at: i64,
}

/// One milestone was defined on a draft contract.
///
/// `allocated_amount` is the running total after this milestone, so an indexer
/// can tell how much of the escrow is still unallocated without re-reading the
/// contract. Titles and specifications are not here: they live in the
/// contract's off-chain record.
#[event]
pub struct MilestoneAdded {
    pub contract: Pubkey,
    pub work_unit: Pubkey,
    pub index: u32,
    pub amount: u64,
    pub due_offset_seconds: i64,
    pub allocated_amount: u64,
}

/// A milestone contract's terms became immutable and the contract is now
/// offered to the freelancer.
#[event]
pub struct TermsFinalized {
    pub contract: Pubkey,
    pub employer: Pubkey,
    pub work_unit_count: u32,
    pub total_amount: u64,
    pub finalized_at: i64,
}

/// The freelancer accepted a funded offer. The main stream has not started.
#[event]
pub struct ContractAccepted {
    pub contract: Pubkey,
    pub employer: Pubkey,
    pub freelancer: Pubkey,
    pub accepted_at: i64,
    pub activation_deadline: i64,
}

/// The freelancer refused a funded offer.
#[event]
pub struct ContractDeclined {
    pub contract: Pubkey,
    pub employer: Pubkey,
    pub freelancer: Pubkey,
    pub declined_at: i64,
}

/// A funded offer lapsed without acceptance. No SPL transfer. Not a dispute.
#[event]
pub struct ContractExpired {
    pub contract: Pubkey,
    pub employer: Pubkey,
    pub freelancer: Pubkey,
    pub expired_at: i64,
    pub employer_refundable: u64,
}

/// The employer approved activation. Main-contract timing is now established.
#[event]
pub struct ContractActivated {
    pub contract: Pubkey,
    pub employer: Pubkey,
    pub freelancer: Pubkey,
    pub activated_at: i64,
    pub start_time: i64,
    pub end_time: i64,
}

/// The employer reviewed the trial stage and declined to activate.
#[event]
pub struct ActivationRejected {
    pub contract: Pubkey,
    pub employer: Pubkey,
    pub freelancer: Pubkey,
    pub rejected_at: i64,
}

/// A paid trial was configured at contract creation.
#[event]
pub struct TrialConfigured {
    pub contract: Pubkey,
    pub trial_work_unit: Pubkey,
    pub employer: Pubkey,
    pub freelancer: Pubkey,
    pub amount: u64,
}

/// The freelancer submitted (or resubmitted) trial work.
#[event]
pub struct TrialSubmitted {
    pub contract: Pubkey,
    pub trial_work_unit: Pubkey,
    pub freelancer: Pubkey,
    pub submitted_at: i64,
    pub action_deadline: i64,
    pub revision_count: u8,
}

/// The employer requested a trial revision.
#[event]
pub struct TrialRevisionRequested {
    pub contract: Pubkey,
    pub trial_work_unit: Pubkey,
    pub employer: Pubkey,
    pub revision_count: u8,
    pub action_deadline: i64,
}

/// The employer approved the trial. Compensation is released, not withdrawn.
#[event]
pub struct TrialApproved {
    pub contract: Pubkey,
    pub trial_work_unit: Pubkey,
    pub employer: Pubkey,
    pub amount: u64,
    pub approved_at: i64,
}

/// The employer paid the submitted trial and ended without activating.
/// No SPL transfer. Not a dispute.
#[event]
pub struct TrialSettledAndEnded {
    pub contract: Pubkey,
    pub trial_work_unit: Pubkey,
    pub employer: Pubkey,
    pub freelancer: Pubkey,
    pub settled_at: i64,
    pub trial_amount: u64,
    pub freelancer_settlement: u64,
    pub employer_refundable: u64,
}

/// The employer rejected submitted trial work. No tokens moved.
#[event]
pub struct TrialRejected {
    pub contract: Pubkey,
    pub trial_work_unit: Pubkey,
    pub employer: Pubkey,
    pub freelancer: Pubkey,
    pub rejected_at: i64,
}

/// The freelancer submitted (or resubmitted) post-activation work.
#[event]
pub struct WorkUnitSubmitted {
    pub contract: Pubkey,
    pub work_unit: Pubkey,
    pub freelancer: Pubkey,
    pub work_unit_index: u32,
    pub submitted_at: i64,
    pub action_deadline: i64,
    pub revision_count: u8,
}

/// The employer approved a submitted work unit. Compensation is released, not withdrawn.
#[event]
pub struct WorkUnitApproved {
    pub contract: Pubkey,
    pub work_unit: Pubkey,
    pub employer: Pubkey,
    pub work_unit_index: u32,
    pub amount: u64,
    pub approved_at: i64,
}

/// The employer requested a bounded resubmission of post-activation work.
#[event]
pub struct WorkUnitRevisionRequested {
    pub contract: Pubkey,
    pub work_unit: Pubkey,
    pub employer: Pubkey,
    pub work_unit_index: u32,
    pub revision_count: u8,
    pub action_deadline: i64,
}

/// The employer voided a stale Revising main deliverable. No SPL transfer.
#[event]
pub struct WorkUnitStaleRevisionVoided {
    pub contract: Pubkey,
    pub work_unit: Pubkey,
    pub employer: Pubkey,
    pub work_unit_index: u32,
    pub voided_at: i64,
}

/// Review timed out and the submitted unit was auto-released. No SPL transfer.
#[event]
pub struct WorkUnitReviewTimedOut {
    pub contract: Pubkey,
    pub work_unit: Pubkey,
    pub work_unit_index: u32,
    pub amount: u64,
    pub released_at: i64,
}

/// Time-based streaming earnings were materialized into released accounting.
/// No SPL transfer.
#[event]
pub struct StreamAccrualReleased {
    pub contract: Pubkey,
    pub freelancer: Pubkey,
    pub newly_released: u64,
    pub cumulative_stream_released: u64,
    pub total_released: u64,
    pub accrual_time: i64,
}

/// An Active contract was cancelled and its economic split was frozen.
/// No SPL transfer.
#[event]
pub struct ContractCancellationSettled {
    pub contract: Pubkey,
    pub employer: Pubkey,
    pub freelancer: Pubkey,
    pub payment_mode: PaymentMode,
    pub settled_at: i64,
    pub freelancer_entitlement: u64,
    pub employer_refundable: u64,
    pub released_amount: u64,
    pub stream_released_amount: u64,
}

/// SPL tokens left escrow for the freelancer. Real token movement.
#[event]
pub struct FreelancerWithdrawal {
    pub contract: Pubkey,
    pub freelancer: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub withdrawn_amount: u64,
    pub remaining_entitlement: u64,
}

/// SPL tokens left escrow back to the employer. Real token movement.
#[event]
pub struct EmployerRefundClaimed {
    pub contract: Pubkey,
    pub employer: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub refunded_amount: u64,
    pub remaining_refundable: u64,
}

/// A party froze the contract into Disputed. No SPL transfer.
#[event]
pub struct DisputeOpened {
    pub contract: Pubkey,
    pub employer: Pubkey,
    pub freelancer: Pubkey,
    pub initiator: DisputeParty,
    pub resolver: Pubkey,
    pub disputed_at: i64,
    pub contested_amount: u64,
    pub released_amount: u64,
    pub stream_released_amount: u64,
}

/// The contract resolver allocated the contested remainder. No SPL transfer.
#[event]
pub struct DisputeResolved {
    pub contract: Pubkey,
    pub employer: Pubkey,
    pub freelancer: Pubkey,
    pub resolver: Pubkey,
    pub resolved_at: i64,
    pub contested_amount: u64,
    pub freelancer_contested_award: u64,
    pub employer_contested_award: u64,
    pub final_freelancer_entitlement: u64,
    pub final_employer_entitlement: u64,
}

/// Successful completion froze the agreed economic end. No SPL transfer.
#[event]
pub struct ContractCompleted {
    pub contract: Pubkey,
    pub employer: Pubkey,
    pub freelancer: Pubkey,
    pub completed_at: i64,
    pub final_freelancer_entitlement: u64,
    pub final_employer_entitlement: u64,
    pub released_amount: u64,
    pub withdrawn_amount: u64,
    pub refunded_amount: u64,
}

/// Dedicated Hourly create. Also accompanied by `ContractCreated`.
#[event]
pub struct HourlyContractCreated {
    pub contract: Pubkey,
    pub employer: Pubkey,
    pub freelancer: Pubkey,
    pub contract_id: u64,
    pub hourly_rate: u64,
    pub authorized_seconds: u64,
    pub main_amount: u64,
    pub trial_amount: u64,
    pub total_amount: u64,
    pub created_at: i64,
}

/// Freelancer opened an Hourly session. No SPL transfer.
#[event]
pub struct HourlySessionStarted {
    pub contract: Pubkey,
    pub session: Pubkey,
    pub freelancer: Pubkey,
    pub session_index: u32,
    pub started_at: i64,
}

/// An Hourly session was closed (Stop or dispute materialization).
/// `status` is Recorded or Void. No work-log URI. No SPL transfer.
#[event]
pub struct HourlySessionRecorded {
    pub contract: Pubkey,
    pub session: Pubkey,
    pub freelancer: Pubkey,
    pub session_index: u32,
    pub stopped_at: i64,
    pub credited_duration: u64,
    pub approved_seconds: u64,
    pub release_delta: u64,
    pub released_amount: u64,
    pub status: HourlySessionStatus,
    pub materialized_by_dispute: bool,
}

/// Employer ended an Hourly contract. Unused-budget settlement uses the
/// Cancelled terminal so existing claim instructions apply. Not punitive.
/// No SPL transfer.
#[event]
pub struct HourlyContractEnded {
    pub contract: Pubkey,
    pub employer: Pubkey,
    pub freelancer: Pubkey,
    pub ended_at: i64,
    pub freelancer_settlement_amount: u64,
    pub employer_refundable_amount: u64,
    pub released_amount: u64,
}
