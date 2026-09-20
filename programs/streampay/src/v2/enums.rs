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
/// Existing modes are mutually exclusive: a streaming contract never has
/// milestones, and a milestone/fixed contract never has checkpoints. Hourly
/// is appended as discriminant 3 and uses its own `HourlyState` /
/// `HourlySession` PDAs, not WorkUnits. H1 does not implement Hourly
/// instructions; existing handlers must reject it explicitly.
#[derive(AnchorSerialize, AnchorDeserialize, InitSpace, Clone, Copy, PartialEq, Eq, Debug)]
pub enum PaymentMode {
    /// Compensation accrues continuously with time. Phase 6 materializes
    /// earnings into `released_amount` from the canonical cumulative formula;
    /// checkpoint WorkUnits are not the release mechanism.
    Streaming,
    /// Fixed price split across several agreed deliverables.
    Milestone,
    /// One deliverable, one price. The deliverable is created at
    /// `create_contract` as a single `WorkUnit` of kind `Fixed` at index 0,
    /// amount equal to `main_amount`.
    Fixed,
    /// Pay for recorded work sessions at an agreed hourly rate.
    /// Discriminant 3; Streaming/Milestone/Fixed keep 0/1/2.
    Hourly,
}

impl PaymentMode {
    /// Whether this mode derives work units from elapsed time.
    /// Hourly is session-based, not a wall-clock stream.
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
/// | Resolved                 | —   | 10  |
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
    /// Economic disagreement is frozen. No new entitlement; no clean refund.
    /// Opened by `open_dispute` or by rejecting a submitted paid trial.
    Disputed,
    /// A disputed contract was resolved. Settlement fields are frozen and
    /// Phase 8 claims are allowed. Appended; previous discriminants unchanged.
    Resolved,
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
                | Self::Resolved
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
                | Self::Resolved
        )
    }

    /// Whether terms may still be edited by the employer.
    pub fn allows_term_changes(&self) -> bool {
        matches!(self, Self::Draft)
    }

    /// Whether Phase 8 may pay frozen settlement (cancel, resolved dispute,
    /// successful completion, pre-submission activation rejection, freelancer
    /// decline, or lapsed offer expiry).
    ///
    /// `Disputed` stays frozen until resolve. `Declined` and `Expired` are
    /// unpaid pre-acceptance exits with a full employer refund entitlement.
    pub fn allows_settlement_claims(&self) -> bool {
        matches!(
            self,
            Self::Cancelled
                | Self::Resolved
                | Self::Completed
                | Self::ActivationRejected
                | Self::Declined
                | Self::Expired
        )
    }
}

/// Who opened an on-chain dispute. `None` until `open_dispute` / trial reject.
#[derive(
    AnchorSerialize, AnchorDeserialize, InitSpace, Clone, Copy, PartialEq, Eq, Debug, Default,
)]
pub enum DisputeParty {
    #[default]
    None,
    Employer,
    Freelancer,
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

/// Lifecycle of one Hourly work session. H1 defines the states only;
/// Start/Stop instructions that transition them belong to H2.
#[derive(AnchorSerialize, AnchorDeserialize, InitSpace, Clone, Copy, PartialEq, Eq, Debug)]
pub enum HourlySessionStatus {
    /// Freelancer has started; Clock is the start authority. Not yet paid.
    Open,
    /// Freelancer stopped; duration and cumulative earnings are recorded.
    Recorded,
    /// Abandoned or voided without pay (cancel/dispute of an open session).
    Void,
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

#[cfg(test)]
mod tests {
    use super::{
        ContractStatus, DisputeParty, HourlySessionStatus, PaymentMode, ReleaseTrigger, StartMode,
        WorkUnitKind,
        WorkUnitStatus,
    };
    use anchor_lang::AnchorSerialize;

    fn disc<T: AnchorSerialize>(value: T) -> u8 {
        let mut bytes = Vec::new();
        value.serialize(&mut bytes).expect("unit enum serializes");
        assert_eq!(bytes.len(), 1);
        bytes[0]
    }

    /// Existing variants keep their Phase 0–8 discriminants; `Resolved` is
    /// appended as 10. Reordering would silently break every stored Contract.
    #[test]
    fn contract_status_discriminants_are_appended_only() {
        assert_eq!(disc(ContractStatus::Draft), 0);
        assert_eq!(disc(ContractStatus::PendingAcceptance), 1);
        assert_eq!(disc(ContractStatus::PendingEmployerApproval), 2);
        assert_eq!(disc(ContractStatus::Active), 3);
        assert_eq!(disc(ContractStatus::Completed), 4);
        assert_eq!(disc(ContractStatus::Declined), 5);
        assert_eq!(disc(ContractStatus::Expired), 6);
        assert_eq!(disc(ContractStatus::Cancelled), 7);
        assert_eq!(disc(ContractStatus::ActivationRejected), 8);
        assert_eq!(disc(ContractStatus::Disputed), 9);
        assert_eq!(disc(ContractStatus::Resolved), 10);
    }

    #[test]
    fn companion_enum_discriminants_are_stable() {
        assert_eq!(disc(PaymentMode::Streaming), 0);
        assert_eq!(disc(PaymentMode::Milestone), 1);
        assert_eq!(disc(PaymentMode::Fixed), 2);
        assert_eq!(disc(PaymentMode::Hourly), 3);

        assert_eq!(disc(HourlySessionStatus::Open), 0);
        assert_eq!(disc(HourlySessionStatus::Recorded), 1);
        assert_eq!(disc(HourlySessionStatus::Void), 2);

        assert_eq!(disc(StartMode::OnActivation), 0);
        assert_eq!(disc(StartMode::Scheduled), 1);

        assert_eq!(disc(WorkUnitKind::Checkpoint), 0);
        assert_eq!(disc(WorkUnitKind::Milestone), 1);
        assert_eq!(disc(WorkUnitKind::Fixed), 2);
        assert_eq!(disc(WorkUnitKind::Trial), 3);

        assert_eq!(disc(WorkUnitStatus::Defined), 0);
        assert_eq!(disc(WorkUnitStatus::Submitted), 1);
        assert_eq!(disc(WorkUnitStatus::Revising), 2);
        assert_eq!(disc(WorkUnitStatus::Released), 3);
        assert_eq!(disc(WorkUnitStatus::Void), 4);

        assert_eq!(disc(ReleaseTrigger::NotReleased), 0);
        assert_eq!(disc(ReleaseTrigger::EmployerApproval), 1);
        assert_eq!(disc(ReleaseTrigger::ReviewTimeout), 2);

        assert_eq!(disc(DisputeParty::None), 0);
        assert_eq!(disc(DisputeParty::Employer), 1);
        assert_eq!(disc(DisputeParty::Freelancer), 2);
    }

    #[test]
    fn settlement_claims_include_declined_and_expired_not_disputed() {
        assert!(ContractStatus::Cancelled.allows_settlement_claims());
        assert!(ContractStatus::Resolved.allows_settlement_claims());
        assert!(ContractStatus::Completed.allows_settlement_claims());
        assert!(ContractStatus::ActivationRejected.allows_settlement_claims());
        assert!(ContractStatus::Declined.allows_settlement_claims());
        assert!(ContractStatus::Expired.allows_settlement_claims());
        assert!(!ContractStatus::Disputed.allows_settlement_claims());
        assert!(!ContractStatus::Active.allows_settlement_claims());
        assert!(!ContractStatus::PendingEmployerApproval.allows_settlement_claims());
        assert!(!ContractStatus::Draft.allows_settlement_claims());
        assert!(!ContractStatus::PendingAcceptance.allows_settlement_claims());
    }

    #[test]
    fn hourly_is_not_a_stream_or_allocation_mode() {
        assert!(!PaymentMode::Hourly.uses_checkpoints());
        assert!(!PaymentMode::Hourly.requires_allocation());
        assert!(PaymentMode::Streaming.uses_checkpoints());
        assert!(PaymentMode::Fixed.requires_allocation());
        assert!(PaymentMode::Milestone.requires_allocation());
        assert!(!PaymentMode::Streaming.requires_allocation());
    }
}
