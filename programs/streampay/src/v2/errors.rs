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

    // -----------------------------------------------------------------
    // Appended in Phase 1. New variants go at the END, always, so that no
    // existing numeric code is ever renumbered.
    // -----------------------------------------------------------------
    #[msg("Escrow did not receive the full contract amount.")]
    EscrowFundingMismatch,

    // -----------------------------------------------------------------
    // Appended in Phase 2.
    // -----------------------------------------------------------------
    #[msg("This contract already has the maximum number of milestones.")]
    TooManyMilestones,

    #[msg("Milestone due offset is not a positive duration within the contract term, or is not later than the previous milestone.")]
    InvalidDueDate,

    // -----------------------------------------------------------------
    // Appended in Phase 3.
    // -----------------------------------------------------------------
    #[msg("Activation review duration is outside the permitted range.")]
    InvalidActivationReview,

    #[msg("The employer activation window has closed.")]
    ApprovalWindowExpired,

    #[msg("The scheduled start has already elapsed; activating now would create retroactive earnings.")]
    ScheduledStartElapsed,

    // -----------------------------------------------------------------
    // Appended in Phase 4.
    // -----------------------------------------------------------------
    #[msg("Trial amount is zero, equals or exceeds the funded total, or does not match the trial account.")]
    InvalidTrialAmount,

    #[msg("This contract has no paid trial configured.")]
    TrialNotConfigured,

    #[msg("A paid trial is configured; this instruction cannot bypass it.")]
    TrialRequired,

    #[msg("The trial work unit is not in the required state for this operation.")]
    InvalidTrialState,

    // -----------------------------------------------------------------
    // Appended in Phase 5.
    // -----------------------------------------------------------------
    #[msg("This work unit kind cannot use the post-activation review instructions.")]
    UnsupportedWorkUnitKind,

    #[msg("This release would exceed the contract's main or total amount.")]
    ReleaseAmountExceeded,
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

    /// Codes that `create_contract` and its tests depend on. Pinning them
    /// individually means an inserted or reordered variant fails here rather
    /// than silently changing the meaning of a code already in use.
    #[test]
    fn v2_error_codes_in_use_are_pinned() {
        assert_eq!(u32::from(StreamPayV2Error::InvalidAmount), 6100);
        assert_eq!(u32::from(StreamPayV2Error::InvalidDuration), 6101);
        assert_eq!(u32::from(StreamPayV2Error::InvalidCheckpointInterval), 6102);
        assert_eq!(u32::from(StreamPayV2Error::InvalidReviewDuration), 6103);
        assert_eq!(u32::from(StreamPayV2Error::TooManyCheckpoints), 6104);
        assert_eq!(u32::from(StreamPayV2Error::InvalidMaxRevisions), 6105);
        assert_eq!(u32::from(StreamPayV2Error::InvalidAcceptanceDeadline), 6106);
        assert_eq!(u32::from(StreamPayV2Error::InvalidScheduledStart), 6107);
        assert_eq!(u32::from(StreamPayV2Error::InvalidMetadata), 6108);
        assert_eq!(u32::from(StreamPayV2Error::SelfContract), 6109);
    }

    /// Codes that `add_milestone` and `finalize_terms` depend on.
    #[test]
    fn v2_phase_2_error_codes_are_pinned() {
        assert_eq!(u32::from(StreamPayV2Error::InvalidPaymentMode), 6110);
        assert_eq!(u32::from(StreamPayV2Error::InvalidState), 6111);
        assert_eq!(u32::from(StreamPayV2Error::AcceptanceExpired), 6115);
        assert_eq!(u32::from(StreamPayV2Error::Unauthorized), 6118);
        assert_eq!(
            u32::from(StreamPayV2Error::MilestoneAllocationExceeded),
            6119
        );
        assert_eq!(
            u32::from(StreamPayV2Error::MilestoneAllocationIncomplete),
            6120
        );
        assert_eq!(u32::from(StreamPayV2Error::NoMilestones), 6121);
        assert_eq!(u32::from(StreamPayV2Error::StreamingHasNoMilestones), 6123);
        assert_eq!(u32::from(StreamPayV2Error::TooManyMilestones), 6146);
        assert_eq!(u32::from(StreamPayV2Error::InvalidDueDate), 6147);
    }

    /// Codes that the Phase 3 acceptance/activation instructions depend on.
    #[test]
    fn v2_phase_3_error_codes_are_pinned() {
        assert_eq!(u32::from(StreamPayV2Error::InvalidActivationReview), 6148);
        assert_eq!(u32::from(StreamPayV2Error::ApprovalWindowExpired), 6149);
        assert_eq!(u32::from(StreamPayV2Error::ScheduledStartElapsed), 6150);
    }

    /// Codes that the Phase 4 trial instructions depend on.
    #[test]
    fn v2_phase_4_error_codes_are_pinned() {
        assert_eq!(u32::from(StreamPayV2Error::InvalidTrialAmount), 6151);
        assert_eq!(u32::from(StreamPayV2Error::TrialNotConfigured), 6152);
        assert_eq!(u32::from(StreamPayV2Error::TrialRequired), 6153);
        assert_eq!(u32::from(StreamPayV2Error::InvalidTrialState), 6154);
    }

    /// Codes that the Phase 5 work-review instructions depend on.
    #[test]
    fn v2_phase_5_error_codes_are_pinned() {
        assert_eq!(u32::from(StreamPayV2Error::ReviewWindowOpen), 6132);
        assert_eq!(u32::from(StreamPayV2Error::ReviewWindowClosed), 6133);
        assert_eq!(u32::from(StreamPayV2Error::RevisionLimitReached), 6134);
        assert_eq!(u32::from(StreamPayV2Error::UnitNotSubmittable), 6126);
        assert_eq!(u32::from(StreamPayV2Error::UnitNotUnderReview), 6127);
        assert_eq!(u32::from(StreamPayV2Error::UnitAlreadyReleased), 6128);
        assert_eq!(u32::from(StreamPayV2Error::UnsupportedWorkUnitKind), 6155);
        assert_eq!(u32::from(StreamPayV2Error::ReleaseAmountExceeded), 6156);
    }

    /// Codes that the Phase 6 streaming-accrual instruction depends on.
    /// No new variants: existing codes are semantically exact.
    #[test]
    fn v2_phase_6_error_codes_are_pinned() {
        assert_eq!(u32::from(StreamPayV2Error::InvalidDuration), 6101);
        assert_eq!(u32::from(StreamPayV2Error::InvalidPaymentMode), 6110);
        assert_eq!(u32::from(StreamPayV2Error::InvalidState), 6111);
        assert_eq!(u32::from(StreamPayV2Error::ContractNotStarted), 6112);
        assert_eq!(u32::from(StreamPayV2Error::ArithmeticOverflow), 6144);
        assert_eq!(u32::from(StreamPayV2Error::ReleaseAmountExceeded), 6156);
    }

    /// The last variant, which is where every future append must land.
    #[test]
    fn v2_error_enum_tail_is_stable() {
        assert_eq!(u32::from(StreamPayV2Error::ArithmeticOverflow), 6144);
        assert_eq!(u32::from(StreamPayV2Error::EscrowFundingMismatch), 6145);
        assert_eq!(u32::from(StreamPayV2Error::InvalidDueDate), 6147);
        assert_eq!(u32::from(StreamPayV2Error::ScheduledStartElapsed), 6150);
        assert_eq!(u32::from(StreamPayV2Error::InvalidTrialState), 6154);
        assert_eq!(u32::from(StreamPayV2Error::ReleaseAmountExceeded), 6156);
    }
}
