//! V2 events.
//!
//! Intentionally empty in Phase 0.
//!
//! No V2 instruction exists yet, so no V2 event can be emitted. Declaring
//! `#[event]` structs now would add IDL surface with no emitter, and event
//! field sets are best fixed alongside the instruction that emits them.
//!
//! Each event struct is therefore introduced in the phase that emits it:
//!
//! - Phase 1: `ContractCreated`, `ContractTermsFinalized`, `ContractAccepted`,
//!   `ContractDeclined`, `ContractExpired`, `FundsRefunded`
//! - Phase 2: `WorkUnitSubmitted`, `WorkUnitReleased`, `FundsWithdrawn`
//! - Phase 3: `WorkUnitDefined`, `WorkUnitRevisionRequested`
//! - Phase 5: `WorkUnitVoided`, `ContractCancelled`, `ContractCompleted`
//!
//! Every event carries `contract: Pubkey` as its first field so a client can
//! index a single contract's full history with one filter.
