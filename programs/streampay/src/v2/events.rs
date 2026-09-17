//! V2 events.
//!
//! Event structs are introduced in the phase that emits them, rather than all
//! at once, so that each event's field set is fixed alongside the instruction
//! that produces it:
//!
//! - Phase 1: `ContractCreated`
//! - Phase 2: `MilestoneAdded`, `TermsFinalized`
//! - later: `ContractAccepted`, `ContractDeclined`, `ContractExpired`,
//!   `WorkUnitSubmitted`, `WorkUnitRevisionRequested`, `WorkUnitReleased`,
//!   `WorkUnitVoided`, `FundsWithdrawn`, `FundsRefunded`, `ContractCancelled`,
//!   `ContractCompleted`
//!
//! Every event carries `contract` as its first field so a client can index a
//! single contract's full history with one filter. Off-chain metadata URIs and
//! deliverable references are deliberately kept out of events: they are already
//! readable from account state, and duplicating them would bloat every log.

use anchor_lang::prelude::*;

use crate::v2::enums::{ContractStatus, PaymentMode};

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
