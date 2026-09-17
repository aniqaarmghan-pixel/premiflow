//! V2 events.
//!
//! Event structs are introduced in the phase that emits them, rather than all
//! at once, so that each event's field set is fixed alongside the instruction
//! that produces it:
//!
//! - Phase 1: `ContractCreated`
//! - Phase 1+: `ContractTermsFinalized`, `ContractAccepted`, `ContractDeclined`,
//!   `ContractExpired`, `FundsRefunded`
//! - Phase 2: `WorkUnitSubmitted`, `WorkUnitReleased`, `FundsWithdrawn`
//! - Phase 3: `WorkUnitDefined`, `WorkUnitRevisionRequested`
//! - Phase 5: `WorkUnitVoided`, `ContractCancelled`, `ContractCompleted`
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
