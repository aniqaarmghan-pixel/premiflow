//! V2 lifecycle enums.
//!
//! These enums are the authoritative source of lifecycle truth. Timestamps
//! answer *when*; status and mode answer *whether*. No code in V2 may infer a
//! lifecycle state from a timestamp being zero.
//!
//! Every enum's first variant is its natural zero value, so a freshly
//! zero-initialized account deserializes into a coherent starting state.

use anchor_lang::prelude::*;

/// How compensation is structured and released.
///
/// The three modes are mutually exclusive: a streaming contract never has
/// milestones, and a milestone/fixed contract never has checkpoints. That
/// exclusivity is what lets a single `WorkUnit` type and a single index space
/// serve all three.
#[derive(AnchorSerialize, AnchorDeserialize, InitSpace, Clone, Copy, PartialEq, Eq, Debug)]
pub enum PaymentMode {
    /// Compensation accrues continuously with time; released per checkpoint.
    Streaming,
    /// Fixed price split across several agreed deliverables.
    Milestone,
    /// One deliverable, one price. Implemented as a single-unit milestone
    /// contract so it reuses the same primitives.
    Fixed,
}

impl PaymentMode {
    /// Whether this mode derives work units from elapsed time.
    pub fn uses_checkpoints(&self) -> bool {
        matches!(self, Self::Streaming)
    }

    /// Whether milestone amounts must be pre-allocated to equal the funded
    /// total before the contract can be offered.
    pub fn requires_allocation(&self) -> bool {
        matches!(self, Self::Milestone | Self::Fixed)
    }
}

/// When the main earning clock starts.
///
/// Discriminants are stable: `OnActivation` is 0, `Scheduled` is 1. This was
/// previously named `OnAcceptance`; it was renamed before V2 deployment because
/// freelancer acceptance no longer starts the stream.
#[derive(AnchorSerialize, AnchorDeserialize, InitSpace, Clone, Copy, PartialEq, Eq, Debug)]
pub enum StartMode {
    /// `start_time` becomes the instant the employer approves activation.
    OnActivation,
    /// `start_time` becomes the pre-agreed `scheduled_start_time`, which is
    /// constrained to fall on or after the acceptance deadline so acceptance
    /// always precedes the contractual start. Earning still cannot begin until
    /// `current_time >= start_time`.
    Scheduled,
}

/// Authoritative contract lifecycle state.
///
/// Borsh unit-enum discriminants, old → new (V2 was never deployed):
///
/// | variant                  | old | new |
/// |--------------------------|-----|-----|
/// | Draft                    | 0   | 0   |
/// | PendingAcceptance        | 1   | 1   |
/// | PendingEmployerApproval  | —   | 2   |
/// | Active                   | 2   | 3   |
/// | Completed                | 3   | 4   |
/// | Declined                 | 4   | 5   |
/// | Expired                  | 5   | 6   |
/// | Cancelled                | 6   | 7   |
/// | ActivationRejected       | —   | 8   |
/// | Disputed                 | —   | 9   |
///
/// `PendingEmployerApproval` is the employer-approval gate: the freelancer has
/// accepted, the main stream has not started. `ActivationRejected` is the
/// employer's "no" at that gate, distinct from `Declined` (the freelancer
/// refused the offer). Events distinguish the two paths for indexers; status
/// distinguishes them for on-chain logic.
#[derive(AnchorSerialize, AnchorDeserialize, InitSpace, Clone, Copy, PartialEq, Eq, Debug)]
pub enum ContractStatus {
    /// Funded, but terms are still being defined by the employer.
    Draft,
    /// Funded, terms locked, offered to the freelancer.
    PendingAcceptance,
    /// Freelancer accepted. Awaiting the employer's activation approval.
    /// The main payment stream has not started.
    PendingEmployerApproval,
    /// Employer approved activation. Timing is established; earning is gated
    /// on `current_time >= start_time`.
    Active,
    /// All obligations resolved.
    Completed,
    /// The freelancer refused the offer.
    Declined,
    /// The acceptance deadline passed without acceptance.
    Expired,
    /// The employer terminated an offered or accepted contract.
    Cancelled,
    /// The employer reviewed the trial stage and declined to activate.
    ActivationRejected,
    /// Pre-activation trial work was submitted and then rejected. Terminal for
    /// the main contract; token distribution is deferred so neither an instant
    /// employer refund nor an automatic freelancer payout can be assumed.
    Disputed,
}

impl ContractStatus {
    /// Whether the main contract timing has been established.
    ///
    /// This is the authoritative replacement for a `start_time == 0` check.
    /// `PendingEmployerApproval` is deliberately excluded: acceptance is not
    /// activation.
    pub fn is_started(&self) -> bool {
        matches!(self, Self::Active | Self::Completed | Self::Cancelled)
    }

    /// Whether the contract has reached a state it can never leave.
    ///
    /// Terminal does not mean inert: withdrawal of already-released funds and
    /// employer refund of unreleased funds both remain possible.
    pub fn is_terminal(&self) -> bool {
        matches!(
            self,
            Self::Completed
                | Self::Declined
                | Self::Expired
                | Self::Cancelled
                | Self::ActivationRejected
                | Self::Disputed
        )
    }

    /// Whether the freelancer has committed to the contract.
    pub fn is_accepted(&self) -> bool {
        matches!(
            self,
            Self::PendingEmployerApproval
                | Self::Active
                | Self::Completed
                | Self::Cancelled
                | Self::ActivationRejected
                | Self::Disputed
        )
    }

    /// Whether terms may still be edited by the employer.
    pub fn allows_term_changes(&self) -> bool {
        matches!(self, Self::Draft)
    }
}

/// Which flavour of work unit this account represents.
///
/// Checkpoints are created by the freelancer at submission time with an amount
/// derived from the agreed vesting formula. Milestones are created by the
/// employer before acceptance with a negotiated amount.
#[derive(AnchorSerialize, AnchorDeserialize, InitSpace, Clone, Copy, PartialEq, Eq, Debug)]
pub enum WorkUnitKind {
    /// A streaming period `[period_start, period_end)`.
    Checkpoint,
    /// One deliverable of a multi-deliverable contract.
    Milestone,
    /// The single deliverable of a fixed-price contract.
    Fixed,
    /// Bounded paid pre-activation trial. Discriminant 3; earlier variants
    /// keep their Phase 0–3 values. Lives at the `trial_unit` PDA, not in the
    /// milestone/checkpoint index space.
    Trial,
}

/// Authoritative work unit lifecycle state.
#[derive(AnchorSerialize, AnchorDeserialize, InitSpace, Clone, Copy, PartialEq, Eq, Debug)]
pub enum WorkUnitStatus {
    /// Agreed and funded, awaiting the freelancer's submission.
    /// Checkpoints skip this state; they are born `Submitted`.
    Defined,
    /// Awaiting employer review. `action_deadline` is the review deadline.
    Submitted,
    /// Employer requested changes. `action_deadline` is the resubmission
    /// deadline, after which the unit may be voided.
    Revising,
    /// Amount credited to `Contract::released_amount`. Terminal and immutable.
    Released,
    /// Invalidated without any release. Terminal.
    Void,
}

impl WorkUnitStatus {
    /// Whether this unit still occupies an open review slot.
    ///
    /// Units in this state block employer cancellation, which is what prevents
    /// an employer from cancelling around delivered-but-unapproved work.
    pub fn is_open_review(&self) -> bool {
        matches!(self, Self::Submitted | Self::Revising)
    }

    /// Whether this unit has reached a state it can never leave.
    pub fn is_terminal(&self) -> bool {
        matches!(self, Self::Released | Self::Void)
    }

    /// Whether the freelancer may submit or resubmit against this unit.
    pub fn accepts_submission(&self) -> bool {
        matches!(self, Self::Defined | Self::Revising)
    }
}

/// Why a work unit's amount became released.
///
/// A typed "not yet" variant rather than a sentinel value; only meaningful
/// once `WorkUnitStatus::Released`.
#[derive(AnchorSerialize, AnchorDeserialize, InitSpace, Clone, Copy, PartialEq, Eq, Debug)]
pub enum ReleaseTrigger {
    /// Not released.
    NotReleased,
    /// The employer signed an approval.
    EmployerApproval,
    /// The review deadline lapsed and finalization was invoked.
    ReviewTimeout,
}
