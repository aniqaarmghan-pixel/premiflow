//! V2 error codes.
//!
//! V1's `StreamPayError` uses Anchor's default base and occupies codes
//! 6000..=6004. It must never be reordered or extended.
//!
//! This enum therefore declares an explicit base of 6100, leaving V1's range
//! plus headroom untouched. Note that Anchor's `offset` argument *replaces*
//! `ERROR_CODE_OFFSET` (6000) rather than adding to it, so the value here is
//! absolute. A relative-looking value such as 100 would land inside Anchor's
//! reserved instruction-error range (100..=999).
//!
//! Later phases append to this enum; nothing here is ever reordered.

use anchor_lang::prelude::*;

#[error_code(offset = 6100)]
pub enum StreamPayV2Error {
    // -----------------------------------------------------------------
    // Term validation at contract creation.
    // -----------------------------------------------------------------
    #[msg("Amount must be greater than zero.")]
    InvalidAmount,

    #[msg("Duration is outside the permitted range.")]
    InvalidDuration,

    #[msg("Checkpoint interval is invalid for this duration.")]
    InvalidCheckpointInterval,

    #[msg("Review duration is outside the permitted range or exceeds the checkpoint interval.")]
    InvalidReviewDuration,

    #[msg("This configuration would create too many checkpoints.")]
    TooManyCheckpoints,

    #[msg("Maximum revisions exceeds the permitted limit.")]
    InvalidMaxRevisions,

    #[msg("Acceptance deadline must be in the future.")]
    InvalidAcceptanceDeadline,

    #[msg("Scheduled start must not precede the acceptance deadline.")]
    InvalidScheduledStart,

    #[msg("Metadata reference is missing or exceeds the maximum length.")]
    InvalidMetadata,

    #[msg("Employer and freelancer must be different wallets.")]
    SelfContract,

    #[msg("This operation is not valid for the contract's payment mode.")]
    InvalidPaymentMode,

    // -----------------------------------------------------------------
    // Contract lifecycle.
    // -----------------------------------------------------------------
    #[msg("The contract is not in the required state for this operation.")]
    InvalidState,

    #[msg("The contract has not started; terms are not yet accepted.")]
    ContractNotStarted,

    #[msg("The contract is in a terminal state.")]
    ContractTerminal,

    #[msg("Contract terms have not been finalized.")]
    TermsNotFinalized,

    #[msg("The acceptance deadline has passed.")]
    AcceptanceExpired,

    #[msg("The acceptance deadline has not yet passed.")]
    AcceptanceNotExpired,

    #[msg("Outstanding obligations remain on this contract.")]
    ObligationsOutstanding,

    #[msg("The signer is not authorized for this operation.")]
    Unauthorized,

    // -----------------------------------------------------------------
    // Milestone allocation.
    // -----------------------------------------------------------------
    #[msg("Milestone amounts exceed the funded total.")]
    MilestoneAllocationExceeded,

    #[msg("Milestone amounts do not sum to the funded total.")]
    MilestoneAllocationIncomplete,

    #[msg("This payment mode requires at least one milestone.")]
    NoMilestones,

    #[msg("A fixed contract requires exactly one work unit.")]
    FixedNeedsOneUnit,

    #[msg("A streaming contract cannot define milestones.")]
    StreamingHasNoMilestones,

    // -----------------------------------------------------------------
    // Work unit lifecycle.
    // -----------------------------------------------------------------
    #[msg("The work unit is invalid or does not belong to this contract.")]
    InvalidWorkUnit,

    #[msg("Work unit index does not match the expected next index.")]
    BadUnitIndex,

    #[msg("The work unit is not awaiting submission.")]
    UnitNotSubmittable,

    #[msg("The work unit is not under review.")]
    UnitNotUnderReview,

    #[msg("The work unit has already been released.")]
    UnitAlreadyReleased,

    #[msg("The work unit has been voided.")]
    UnitVoided,

    #[msg("The work unit is not stale and cannot be voided.")]
    UnitNotStale,

    #[msg("Another work unit is still awaiting review.")]
    ReviewAlreadyOpen,

    #[msg("The review window is still open.")]
    ReviewWindowOpen,

    #[msg("The review window has already closed.")]
    ReviewWindowClosed,

    #[msg("The maximum number of revisions has been reached.")]
    RevisionLimitReached,

    // -----------------------------------------------------------------
    // Streaming checkpoints.
    // -----------------------------------------------------------------
    #[msg("The checkpoint period is not yet complete.")]
    PeriodNotComplete,

    #[msg("All streaming periods have already been checkpointed.")]
    StreamFullyCheckpointed,

    #[msg("This checkpoint period has no earned amount.")]
    EmptyCheckpoint,

    #[msg("The post-termination grace window has closed.")]
    GraceWindowClosed,

    // -----------------------------------------------------------------
    // Settlement.
    // -----------------------------------------------------------------
    #[msg("There is nothing available to withdraw.")]
    NothingToWithdraw,

    #[msg("There is nothing available to refund.")]
    NothingToRefund,

    #[msg("Nothing has been released on this contract.")]
    NothingReleasable,

    #[msg("Cannot cancel while a work unit is under review.")]
    OpenReviewBlocksCancel,

    #[msg("Escrow still holds funds owed to a party.")]
    EscrowNotSettled,

    // -----------------------------------------------------------------
    // Arithmetic.
    // -----------------------------------------------------------------
    #[msg("A math calculation overflowed.")]
    ArithmeticOverflow,
}

#[cfg(test)]
mod tests {
    use super::StreamPayV2Error;
    use crate::StreamPayError;

    /// V1's error codes are a frozen wire interface: clients and the existing
    /// regression tests depend on these exact numbers.
    #[test]
    fn v1_error_codes_are_unchanged() {
        assert_eq!(u32::from(StreamPayError::InvalidAmount), 6000);
        assert_eq!(u32::from(StreamPayError::InvalidDuration), 6001);
        assert_eq!(u32::from(StreamPayError::MathOverflow), 6002);
        assert_eq!(u32::from(StreamPayError::NothingToWithdraw), 6003);
        assert_eq!(u32::from(StreamPayError::StreamCancelled), 6004);
    }

    /// V2 codes must clear V1's range, and must not fall into Anchor's reserved
    /// ranges: 100..=999 instruction, 1000..=1999 IDL, 2000..=2999 constraint,
    /// 3000..=3999 account. Anchor's `offset` argument replaces the 6000 base
    /// rather than adding to it, so this asserts the absolute value.
    #[test]
    fn v2_error_codes_start_clear_of_v1() {
        assert_eq!(u32::from(StreamPayV2Error::InvalidAmount), 6100);
        assert!(u32::from(StreamPayV2Error::ArithmeticOverflow) > 6100);
        assert!(u32::from(StreamPayV2Error::InvalidAmount) > 6004);
    }
}
