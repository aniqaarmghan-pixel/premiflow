//! The V2 `Contract` account: the authoritative record of a funded, mutually
//! agreed payment agreement.
//!
//! Field ordering is deliberate. Every fixed-size field comes first and the one
//! variable-length field comes last, because Borsh serializes sequentially: a
//! `String` shifts the byte offset of everything after it, which would make any
//! later field unusable as a client-side `memcmp` filter target. With this
//! ordering the following offsets are permanently stable:
//!
//! | offset | field      |
//! |--------|------------|
//! | 0      | discriminator (8 bytes) |
//! | 8      | version    |
//! | 9      | employer   |
//! | 41     | freelancer |
//! | 73     | token_mint |
//!
//! Clients should nonetheless filter on the account discriminator at offset 0
//! rather than on `dataSize`, so that a future layout change cannot silently
//! empty a dashboard.

use anchor_lang::prelude::*;

use crate::v2::constants::MAX_URI_LEN;
use crate::v2::enums::{ContractStatus, DisputeParty, PaymentMode, StartMode};
use crate::v2::errors::StreamPayV2Error;

#[account]
#[derive(InitSpace)]
pub struct Contract {
    // -----------------------------------------------------------------
    // Identity. Fixed offsets; safe as `memcmp` filter targets.
    // -----------------------------------------------------------------
    /// On-chain layout version, for forward migration.
    pub version: u8,
    /// The client funding the work.
    pub employer: Pubkey,
    /// The worker performing it.
    pub freelancer: Pubkey,
    /// SPL mint of the escrowed token. Classic SPL Token only.
    pub token_mint: Pubkey,
    /// Employer-scoped identifier; part of the PDA seeds.
    pub contract_id: u64,

    // -----------------------------------------------------------------
    // Classification. Authoritative for lifecycle and mode decisions.
    // -----------------------------------------------------------------
    pub payment_mode: PaymentMode,
    pub status: ContractStatus,
    pub start_mode: StartMode,

    // -----------------------------------------------------------------
    // Money. Raw token base units throughout; decimals are never stored.
    //
    // Escrow invariant:
    //   escrow_balance == total_amount - withdrawn_amount - refunded_amount
    // Entitlement invariant:
    //   withdrawn_amount <= released_amount <= total_amount
    //
    // `total_amount` is written once at creation and never mutated. The other
    // four only ever increase, which is what makes double-release and
    // double-refund detectable by assertion.
    // -----------------------------------------------------------------
    /// Amount funded into escrow at creation. Immutable.
    pub total_amount: u64,
    /// Reserved pre-activation trial compensation, included in `total_amount`.
    /// Zero means no trial is configured. Not a lifecycle predicate: whether a
    /// trial WorkUnit exists is answered by this being positive *and* the
    /// `trial_unit` PDA being initialized.
    pub trial_amount: u64,
    /// Main-contract economic base: `total_amount - trial_amount`. Future
    /// streaming, fixed and milestone settlement uses this, never the trial
    /// reservation. Equals `total_amount` when there is no trial.
    pub main_amount: u64,
    /// Sum of defined milestone work unit amounts. Milestone/Fixed only.
    /// At finalize this must equal `main_amount`, not `total_amount`.
    pub allocated_amount: u64,
    /// Freelancer entitlement unlocked by approval or review timeout.
    pub released_amount: u64,
    /// Portion of `released_amount` already transferred out.
    pub withdrawn_amount: u64,
    /// Unreleased funds already returned to the employer.
    pub refunded_amount: u64,
    /// Streaming main-work already materialized into `released_amount`.
    /// Independent of any trial credit, so
    /// `released_amount` conceptually equals `trial_released + stream_released_amount`
    /// on an Active streaming contract. Never inferred from `released_amount`.
    pub stream_released_amount: u64,
    /// Frozen freelancer entitlement after cancellation, dispute resolution,
    /// or successful completion. Zero until those terminal settlements.
    /// Equals `released_amount` at freeze.
    pub freelancer_settlement_amount: u64,
    /// Frozen employer refundable entitlement after cancellation, dispute
    /// resolution, or successful completion. Zero until settlement. Not tokens
    /// transferred: that is `refunded_amount`.
    pub employer_refundable_amount: u64,

    /// Per-contract arbitrator. Bound at creation; never the employer,
    /// freelancer, or default. Immutable after `create_contract`.
    pub resolver: Pubkey,
    /// Unresolved remainder at dispute open:
    /// `total_amount - released_amount - refunded_amount` after any stream freeze.
    pub contested_amount: u64,
    /// Instant `open_dispute` (or submitted-trial reject) froze economics.
    pub disputed_at: i64,
    pub dispute_initiator: DisputeParty,

    // -----------------------------------------------------------------
    // Negotiated terms. Frozen once the contract leaves `Draft`.
    // -----------------------------------------------------------------
    /// Latest instant at which the freelancer may accept.
    pub acceptance_deadline: i64,
    /// Agreed start instant. Only read when `start_mode == Scheduled`.
    pub scheduled_start_time: i64,
    /// Streaming length. Needed to resolve `end_time` at activation, since
    /// under `OnActivation` the start instant is unknown at creation.
    pub duration_seconds: i64,
    /// Streaming checkpoint period length. Only read when the payment mode
    /// uses checkpoints.
    pub checkpoint_interval: i64,
    /// Length of both the employer review window and the freelancer
    /// resubmission window.
    pub review_duration: i64,
    /// How long the employer has, after freelancer acceptance, to approve or
    /// reject activation. Frozen at creation. The deadline is derived as
    /// `accepted_at + activation_review_duration` once the freelancer accepts.
    pub activation_review_duration: i64,
    /// Agreed cap on revision cycles per work unit. Together with
    /// `review_duration` this bounds worst-case withholding.
    pub max_revisions: u8,

    // -----------------------------------------------------------------
    // Lifecycle timestamps. These answer *when*, never *whether*: a lifecycle
    // question is always answered by `status` or `payment_mode`.
    // -----------------------------------------------------------------
    /// Resolved at employer activation from `start_mode`.
    pub start_time: i64,
    /// Resolved at employer activation as `start_time + duration_seconds`.
    pub end_time: i64,
    /// Streaming checkpoint cursor: the end of the most recently created
    /// period. Guarantees periods are contiguous and non-overlapping.
    pub last_period_end: i64,
    pub created_at: i64,
    pub accepted_at: i64,
    pub completed_at: i64,
    /// Instant the contract was cancelled or completed; anchors the
    /// post-termination grace window.
    pub terminated_at: i64,

    // -----------------------------------------------------------------
    // Child bookkeeping. O(1) counters so no instruction ever iterates
    // children.
    // -----------------------------------------------------------------
    /// Next work unit index to allocate.
    pub work_unit_count: u32,
    pub released_unit_count: u32,
    pub voided_unit_count: u32,
    /// Units currently in a non-terminal reviewable state. A non-zero value
    /// blocks employer cancellation.
    pub open_review_count: u16,
    /// Due offset of the most recently defined milestone, in seconds after
    /// start. Zero until the first milestone exists. Used so `add_milestone`
    /// can enforce strictly increasing offsets without iterating children.
    pub last_milestone_due_offset: i64,

    // -----------------------------------------------------------------
    // Off-chain metadata reference. Project titles, descriptions, profiles,
    // portfolios and attachments live off-chain; only a bounded reference and
    // a content hash are stored here.
    // -----------------------------------------------------------------
    /// Hash of the canonical off-chain record, making it tamper-evident.
    pub metadata_hash: [u8; 32],

    pub bump: u8,
    pub escrow_bump: u8,

    /// Upgrade headroom. Adding a field means shrinking this, which leaves
    /// account size and every client offset unchanged.
    ///
    /// Started at 128 bytes; `voided_unit_count` (4),
    /// `last_milestone_due_offset` (8), `activation_review_duration` (8),
    /// `trial_amount` (8), `main_amount` (8), `stream_released_amount` (8),
    /// `freelancer_settlement_amount` (8) and `employer_refundable_amount` (8)
    /// were taken from it.
    ///
    /// Phase 7 layout: two u64 settlement fields after `stream_released_amount`;
    /// reserved 84 → 68. Phase 9 consumed 49 more bytes for `resolver` (32),
    /// `contested_amount` (8), `disputed_at` (8) and `dispute_initiator` (1);
    /// reserved 68 → 19. `INIT_SPACE` remains 621.
    pub reserved: [u8; 19],

    // -----------------------------------------------------------------
    // Variable length. Must remain the final field.
    // -----------------------------------------------------------------
    /// Bounded pointer to the off-chain record.
    #[max_len(MAX_URI_LEN)]
    pub metadata_uri: String,
}

impl Contract {
    /// Whether a paid trial is configured. `trial_amount` is the reservation,
    /// not a timestamp sentinel.
    pub fn has_trial(&self) -> bool {
        self.trial_amount > 0
    }

    /// Latest instant the employer may approve or reject activation.
    ///
    /// Only meaningful once the freelancer has accepted (`accepted_at` is set
    /// by `accept_contract`). Status, not a zero timestamp, is what tells a
    /// caller whether that has happened.
    pub fn activation_deadline(&self) -> Result<i64> {
        self.accepted_at
            .checked_add(self.activation_review_duration)
            .ok_or(StreamPayV2Error::ArithmeticOverflow.into())
    }

    /// Resolve main-contract timing at employer activation.
    ///
    /// Enforces the approval window and the Scheduled no-retroactive-earning
    /// rule. Does not mutate; callers write the returned values.
    pub fn resolve_activation_timing(&self, now: i64) -> Result<(i64, i64, i64)> {
        let activation_deadline = self.activation_deadline()?;
        require!(
            now < activation_deadline,
            StreamPayV2Error::ApprovalWindowExpired
        );

        let (start_time, end_time) = match self.start_mode {
            StartMode::OnActivation => {
                let end = now
                    .checked_add(self.duration_seconds)
                    .ok_or(StreamPayV2Error::ArithmeticOverflow)?;
                (now, end)
            }
            StartMode::Scheduled => {
                require!(
                    now <= self.scheduled_start_time,
                    StreamPayV2Error::ScheduledStartElapsed
                );
                let end = self
                    .scheduled_start_time
                    .checked_add(self.duration_seconds)
                    .ok_or(StreamPayV2Error::ArithmeticOverflow)?;
                (self.scheduled_start_time, end)
            }
        };

        let last_period_end = if self.payment_mode.uses_checkpoints() {
            start_time
        } else {
            0
        };

        Ok((start_time, end_time, last_period_end))
    }

    /// The latest instant at which this contract's term can possibly end.
    ///
    /// Under `OnActivation` the real start is the employer's approval, which
    /// can land as late as `acceptance_deadline + activation_review_duration`.
    /// Under `Scheduled` the start instant is already agreed.
    pub fn latest_possible_end(&self) -> Result<i64> {
        let anchor_point = match self.start_mode {
            StartMode::OnActivation => self
                .acceptance_deadline
                .checked_add(self.activation_review_duration)
                .ok_or(StreamPayV2Error::ArithmeticOverflow)?,
            StartMode::Scheduled => self.scheduled_start_time,
        };

        let end = anchor_point
            .checked_add(self.duration_seconds)
            .ok_or(StreamPayV2Error::ArithmeticOverflow)?;

        Ok(end)
    }

    /// Canonical streaming accrual at `now`, using only `main_amount`.
    ///
    /// Cumulative from `start_time`, never per-interval, so repeated
    /// materialization cannot change the total entitlement. `last_period_end`
    /// is not consulted: it remains a checkpoint cursor, not an accrual clock.
    pub fn stream_accrued_at(&self, now: i64) -> Result<u64> {
        canonical_stream_accrued(self.main_amount, self.start_time, self.end_time, now)
    }

    /// Credit a post-activation main-work release.
    ///
    /// Trial compensation already sitting in `released_amount` is not counted
    /// again: the new main-released total cannot exceed `main_amount`, and
    /// `released_amount + refunded_amount` cannot exceed `total_amount`.
    /// `released_unit_count` and `open_review_count` move with the credit.
    pub fn credit_main_release(&mut self, amount: u64) -> Result<()> {
        let new_released = self
            .released_amount
            .checked_add(amount)
            .ok_or(StreamPayV2Error::ArithmeticOverflow)?;
        let released_plus_refunded = new_released
            .checked_add(self.refunded_amount)
            .ok_or(StreamPayV2Error::ArithmeticOverflow)?;
        require!(
            released_plus_refunded <= self.total_amount,
            StreamPayV2Error::ReleaseAmountExceeded
        );

        // Once Active, a trial-configured contract has already credited
        // `trial_amount` via `approve_trial_and_activate`.
        let trial_released = if self.has_trial() {
            self.trial_amount
        } else {
            0
        };
        let main_released = new_released
            .checked_sub(trial_released)
            .ok_or(StreamPayV2Error::ReleaseAmountExceeded)?;
        require!(
            main_released <= self.main_amount,
            StreamPayV2Error::ReleaseAmountExceeded
        );

        self.released_amount = new_released;
        self.released_unit_count = self
            .released_unit_count
            .checked_add(1)
            .ok_or(StreamPayV2Error::ArithmeticOverflow)?;
        self.open_review_count = self
            .open_review_count
            .checked_sub(1)
            .ok_or(StreamPayV2Error::ArithmeticOverflow)?;
        Ok(())
    }

    /// Credit Hourly main-work earnings. Does not touch work-unit counters.
    /// Trial already sitting in `released_amount` is not counted as Hourly
    /// time: only the main remainder may grow, and never past `main_amount`.
    pub fn credit_hourly_main_release(&mut self, amount: u64) -> Result<()> {
        let new_released = self
            .released_amount
            .checked_add(amount)
            .ok_or(StreamPayV2Error::ArithmeticOverflow)?;
        let released_plus_refunded = new_released
            .checked_add(self.refunded_amount)
            .ok_or(StreamPayV2Error::ArithmeticOverflow)?;
        require!(
            released_plus_refunded <= self.total_amount,
            StreamPayV2Error::ReleaseAmountExceeded
        );

        let trial_released = if self.has_trial() {
            self.trial_amount
        } else {
            0
        };
        let main_released = new_released
            .checked_sub(trial_released)
            .ok_or(StreamPayV2Error::ReleaseAmountExceeded)?;
        require!(
            main_released <= self.main_amount,
            StreamPayV2Error::ReleaseAmountExceeded
        );

        self.released_amount = new_released;
        Ok(())
    }

    /// Freeze a clean active-contract cancellation split.
    ///
    /// Streaming: `stream_accrued_at(now)` is materialized into
    /// `released_amount` / `stream_released_amount` first so unreleased earned
    /// time is not lost. Fixed/Milestone: `released_amount` is left as-is —
    /// unreleased future work is never auto-paid, and unresolved review cannot
    /// reach this method (`open_review_count` must be 0).
    ///
    /// Hourly: same released / remainder split. Callers must already reject
    /// an Open HourlySession (`HourlyOpenSessionBlocksClose`). Hourly `end`
    /// also uses this Cancelled terminal as unused-budget settlement — not a
    /// punitive cancellation.
    pub fn settle_active_cancellation(&mut self, now: i64) -> Result<(u64, u64)> {
        require!(
            self.status == ContractStatus::Active,
            StreamPayV2Error::InvalidState
        );
        require!(
            self.open_review_count == 0,
            StreamPayV2Error::OpenReviewBlocksCancel
        );

        if self.payment_mode.uses_checkpoints() {
            self.materialize_stream_at(now)?;
        }

        let freelancer = self.released_amount;
        require!(
            freelancer <= self.total_amount,
            StreamPayV2Error::ReleaseAmountExceeded
        );
        let employer = self
            .total_amount
            .checked_sub(freelancer)
            .ok_or(StreamPayV2Error::ArithmeticOverflow)?;
        let conserved = freelancer
            .checked_add(employer)
            .ok_or(StreamPayV2Error::ArithmeticOverflow)?;
        require!(
            conserved == self.total_amount,
            StreamPayV2Error::ReleaseAmountExceeded
        );
        require!(
            self.withdrawn_amount <= freelancer,
            StreamPayV2Error::ReleaseAmountExceeded
        );
        require!(
            self.refunded_amount <= employer,
            StreamPayV2Error::ReleaseAmountExceeded
        );

        self.freelancer_settlement_amount = freelancer;
        self.employer_refundable_amount = employer;
        self.status = ContractStatus::Cancelled;
        self.terminated_at = now;
        self.assert_terminal_settlement_invariants()?;
        Ok((freelancer, employer))
    }

    /// Pay a submitted trial and end without activating the main engagement.
    ///
    /// No stream materialization. No activation timing. Status becomes
    /// `Cancelled` so existing Collect pay / Claim refund paths apply.
    pub fn settle_submitted_trial_without_activation(
        &mut self,
        now: i64,
        trial_amount: u64,
    ) -> Result<(u64, u64)> {
        require!(
            self.status == ContractStatus::PendingEmployerApproval,
            StreamPayV2Error::InvalidState
        );
        require!(self.has_trial(), StreamPayV2Error::TrialNotConfigured);
        require!(
            trial_amount == self.trial_amount,
            StreamPayV2Error::InvalidTrialAmount
        );
        require!(
            self.released_amount == 0
                && self.withdrawn_amount == 0
                && self.refunded_amount == 0
                && self.stream_released_amount == 0
                && self.contested_amount == 0
                && self.freelancer_settlement_amount == 0
                && self.employer_refundable_amount == 0,
            StreamPayV2Error::ReleaseAmountExceeded
        );
        require!(
            self.open_review_count > 0,
            StreamPayV2Error::InvalidTrialState
        );

        let released = self
            .released_amount
            .checked_add(trial_amount)
            .ok_or(StreamPayV2Error::ArithmeticOverflow)?;
        require!(
            released <= self.total_amount,
            StreamPayV2Error::ReleaseAmountExceeded
        );
        let released_unit_count = self
            .released_unit_count
            .checked_add(1)
            .ok_or(StreamPayV2Error::ArithmeticOverflow)?;
        let open_review_count = self
            .open_review_count
            .checked_sub(1)
            .ok_or(StreamPayV2Error::ArithmeticOverflow)?;

        self.released_amount = released;
        self.released_unit_count = released_unit_count;
        self.open_review_count = open_review_count;

        let freelancer = self.released_amount;
        let employer = self
            .total_amount
            .checked_sub(freelancer)
            .ok_or(StreamPayV2Error::ArithmeticOverflow)?;
        require!(
            freelancer == self.trial_amount,
            StreamPayV2Error::ReleaseAmountExceeded
        );
        require!(
            employer == self.main_amount,
            StreamPayV2Error::ReleaseAmountExceeded
        );
        let conserved = freelancer
            .checked_add(employer)
            .ok_or(StreamPayV2Error::ArithmeticOverflow)?;
        require!(
            conserved == self.total_amount,
            StreamPayV2Error::ReleaseAmountExceeded
        );

        self.freelancer_settlement_amount = freelancer;
        self.employer_refundable_amount = employer;
        self.contested_amount = 0;
        self.status = ContractStatus::Cancelled;
        self.terminated_at = now;
        self.assert_terminal_settlement_invariants()?;
        Ok((freelancer, employer))
    }

    /// End before any trial work is submitted. Nothing is earned.
    ///
    /// Used by employer `reject_activation` (T2) and permissionless
    /// `expire_activation` (T4). No stream materialization. No activation
    /// timing. Trial, if present, stays Defined. Status becomes
    /// `ActivationRejected` so existing Claim refund applies and Collect pay
    /// has a zero cap.
    pub fn settle_unsubmitted_activation_rejection(
        &mut self,
        now: i64,
    ) -> Result<(u64, u64)> {
        require!(
            self.status == ContractStatus::PendingEmployerApproval,
            StreamPayV2Error::InvalidState
        );
        require!(
            self.released_amount == 0
                && self.withdrawn_amount == 0
                && self.refunded_amount == 0
                && self.stream_released_amount == 0
                && self.contested_amount == 0
                && self.freelancer_settlement_amount == 0
                && self.employer_refundable_amount == 0
                && self.released_unit_count == 0,
            StreamPayV2Error::ReleaseAmountExceeded
        );
        require!(
            self.open_review_count == 0,
            StreamPayV2Error::InvalidTrialState
        );
        require!(
            self.start_time == 0 && self.end_time == 0,
            StreamPayV2Error::InvalidState
        );

        let freelancer = 0u64;
        let employer = self.total_amount;
        let conserved = freelancer
            .checked_add(employer)
            .ok_or(StreamPayV2Error::ArithmeticOverflow)?;
        require!(
            conserved == self.total_amount,
            StreamPayV2Error::ReleaseAmountExceeded
        );

        self.freelancer_settlement_amount = freelancer;
        self.employer_refundable_amount = employer;
        self.contested_amount = 0;
        self.status = ContractStatus::ActivationRejected;
        self.terminated_at = now;
        self.assert_terminal_settlement_invariants()?;
        Ok((freelancer, employer))
    }

    /// Peaceful pre-acceptance exit. Nothing is earned.
    ///
    /// Used by freelancer `decline_contract` (`Declined`) and permissionless
    /// `expire_acceptance` (`Expired`, including funded Milestone `Draft`).
    /// No stream materialization. No activation timing. Trial, if present,
    /// stays Defined.
    pub fn settle_unaccepted_offer(
        &mut self,
        now: i64,
        terminal: ContractStatus,
    ) -> Result<(u64, u64)> {
        require!(
            terminal == ContractStatus::Declined || terminal == ContractStatus::Expired,
            StreamPayV2Error::InvalidState
        );
        match self.status {
            ContractStatus::PendingAcceptance => {}
            ContractStatus::Draft => {
                require!(
                    terminal == ContractStatus::Expired,
                    StreamPayV2Error::InvalidState
                );
                require!(
                    self.payment_mode == PaymentMode::Milestone,
                    StreamPayV2Error::InvalidPaymentMode
                );
            }
            _ => return Err(StreamPayV2Error::InvalidState.into()),
        }
        require!(self.accepted_at == 0, StreamPayV2Error::InvalidState);
        require!(
            self.released_amount == 0
                && self.withdrawn_amount == 0
                && self.refunded_amount == 0
                && self.stream_released_amount == 0
                && self.contested_amount == 0
                && self.freelancer_settlement_amount == 0
                && self.employer_refundable_amount == 0
                && self.released_unit_count == 0,
            StreamPayV2Error::ReleaseAmountExceeded
        );
        require!(
            self.open_review_count == 0,
            StreamPayV2Error::InvalidTrialState
        );
        require!(
            self.start_time == 0 && self.end_time == 0,
            StreamPayV2Error::InvalidState
        );

        let freelancer = 0u64;
        let employer = self.total_amount;
        let conserved = freelancer
            .checked_add(employer)
            .ok_or(StreamPayV2Error::ArithmeticOverflow)?;
        require!(
            conserved == self.total_amount,
            StreamPayV2Error::ReleaseAmountExceeded
        );

        self.freelancer_settlement_amount = freelancer;
        self.employer_refundable_amount = employer;
        self.contested_amount = 0;
        self.status = terminal;
        self.terminated_at = now;
        self.assert_terminal_settlement_invariants()?;
        Ok((freelancer, employer))
    }

    /// Materialize canonical stream accrual into released accounting.
    /// Used by Phase 7 cancel and Phase 9 dispute freeze. Status is unchanged.
    pub fn materialize_stream_at(&mut self, now: i64) -> Result<()> {
        let accrued = self.stream_accrued_at(now)?;
        let delta = accrued
            .checked_sub(self.stream_released_amount)
            .ok_or(StreamPayV2Error::ReleaseAmountExceeded)?;
        if delta > 0 {
            self.stream_released_amount = accrued;
            self.released_amount = self
                .released_amount
                .checked_add(delta)
                .ok_or(StreamPayV2Error::ArithmeticOverflow)?;
        }
        Ok(())
    }

    /// Freeze economics for a dispute. Streaming accrual is materialized at
    /// `now` first. Contested remainder is everything not already released or
    /// refunded. Does not set `terminated_at`.
    pub fn freeze_for_dispute(
        &mut self,
        now: i64,
        initiator: DisputeParty,
    ) -> Result<(u64, u64, u64)> {
        match self.status {
            ContractStatus::Active => {}
            ContractStatus::PendingEmployerApproval if self.open_review_count > 0 => {}
            ContractStatus::Disputed => {
                return Err(StreamPayV2Error::ContractAlreadyDisputed.into());
            }
            other if other.is_terminal() => {
                return Err(StreamPayV2Error::ContractTerminal.into());
            }
            _ => return Err(StreamPayV2Error::DisputeNotAllowed.into()),
        }

        if self.payment_mode.uses_checkpoints() && self.status == ContractStatus::Active {
            self.materialize_stream_at(now)?;
        }

        let protected_freelancer = self.released_amount;
        let protected_employer = self.refunded_amount;
        let allocated = protected_freelancer
            .checked_add(protected_employer)
            .ok_or(StreamPayV2Error::ArithmeticOverflow)?;
        require!(
            allocated <= self.total_amount,
            StreamPayV2Error::ReleaseAmountExceeded
        );
        let contested = self
            .total_amount
            .checked_sub(allocated)
            .ok_or(StreamPayV2Error::ArithmeticOverflow)?;
        require!(contested > 0, StreamPayV2Error::DisputeNotAllowed);

        self.contested_amount = contested;
        self.disputed_at = now;
        self.dispute_initiator = initiator;
        self.status = ContractStatus::Disputed;
        Ok((protected_freelancer, protected_employer, contested))
    }

    /// Apply the resolver's split of `contested_amount` and freeze settlement.
    pub fn apply_dispute_resolution(
        &mut self,
        now: i64,
        freelancer_contested_award: u64,
    ) -> Result<(u64, u64, u64, u64)> {
        require!(
            self.status == ContractStatus::Disputed,
            StreamPayV2Error::InvalidState
        );
        require!(
            freelancer_contested_award <= self.contested_amount,
            StreamPayV2Error::InvalidDisputeAward
        );
        let employer_contested_award = self
            .contested_amount
            .checked_sub(freelancer_contested_award)
            .ok_or(StreamPayV2Error::ArithmeticOverflow)?;

        let freelancer_final = self
            .released_amount
            .checked_add(freelancer_contested_award)
            .ok_or(StreamPayV2Error::ArithmeticOverflow)?;
        let employer_final = self
            .refunded_amount
            .checked_add(employer_contested_award)
            .ok_or(StreamPayV2Error::ArithmeticOverflow)?;
        let conserved = freelancer_final
            .checked_add(employer_final)
            .ok_or(StreamPayV2Error::ArithmeticOverflow)?;
        require!(
            conserved == self.total_amount,
            StreamPayV2Error::ReleaseAmountExceeded
        );
        require!(
            freelancer_final >= self.withdrawn_amount,
            StreamPayV2Error::ReleaseAmountExceeded
        );
        require!(
            employer_final >= self.refunded_amount,
            StreamPayV2Error::ReleaseAmountExceeded
        );

        self.released_amount = freelancer_final;
        self.freelancer_settlement_amount = freelancer_final;
        self.employer_refundable_amount = employer_final;
        self.status = ContractStatus::Resolved;
        self.terminated_at = now;
        self.assert_terminal_settlement_invariants()?;
        Ok((
            freelancer_contested_award,
            employer_contested_award,
            freelancer_final,
            employer_final,
        ))
    }

    /// Freeze a successful completion split. Permissionless callers reach this
    /// only after objective on-chain conditions are already true.
    ///
    /// Streaming: `now >= end_time`, then remaining canonical accrual is
    /// materialized at `end_time`. Fixed/Milestone: every required main work
    /// unit must already be released; open reviews and unsubmitted units block.
    /// Successful completion pays the full agreed `total_amount` to the
    /// freelancer; unused remainder is a cancellation or dispute path, not
    /// this one. `refunded_amount` must still be zero because Active contracts
    /// have no refund instruction.
    pub fn settle_successful_completion(&mut self, now: i64) -> Result<(u64, u64)> {
        match self.status {
            ContractStatus::Active => {}
            ContractStatus::Completed => {
                return Err(StreamPayV2Error::ContractAlreadyCompleted.into());
            }
            other if other.is_terminal() => {
                return Err(StreamPayV2Error::ContractTerminal.into());
            }
            _ => return Err(StreamPayV2Error::CompletionNotAllowed.into()),
        }

        match self.payment_mode {
            PaymentMode::Streaming => {
                require!(
                    now >= self.end_time,
                    StreamPayV2Error::ContractNotReadyForCompletion
                );
                self.materialize_stream_at(self.end_time)?;
                require!(
                    self.stream_released_amount == self.main_amount,
                    StreamPayV2Error::UnresolvedWorkRemaining
                );
            }
            PaymentMode::Fixed | PaymentMode::Milestone => {
                require!(
                    self.open_review_count == 0,
                    StreamPayV2Error::UnresolvedWorkRemaining
                );
                require!(
                    self.work_unit_count > 0,
                    StreamPayV2Error::UnresolvedWorkRemaining
                );
                require!(
                    self.allocated_amount == self.main_amount,
                    StreamPayV2Error::UnresolvedWorkRemaining
                );
                let trial_units: u32 = if self.has_trial() { 1 } else { 0 };
                let expected_released_units = self
                    .work_unit_count
                    .checked_add(trial_units)
                    .ok_or(StreamPayV2Error::ArithmeticOverflow)?;
                require!(
                    self.released_unit_count == expected_released_units,
                    StreamPayV2Error::UnresolvedWorkRemaining
                );
            }
            PaymentMode::Hourly => return Err(StreamPayV2Error::InvalidPaymentMode.into()),
        }

        self.assert_live_invariants()?;
        require!(
            self.released_amount == self.total_amount,
            StreamPayV2Error::UnresolvedWorkRemaining
        );
        require!(
            self.refunded_amount == 0,
            StreamPayV2Error::ReleaseAmountExceeded
        );

        let freelancer = self.released_amount;
        let employer = 0u64;
        require!(
            freelancer >= self.withdrawn_amount,
            StreamPayV2Error::ReleaseAmountExceeded
        );

        self.freelancer_settlement_amount = freelancer;
        self.employer_refundable_amount = employer;
        self.status = ContractStatus::Completed;
        self.completed_at = now;
        self.terminated_at = now;
        self.assert_terminal_settlement_invariants()?;
        Ok((freelancer, employer))
    }

    /// Always-on money bounds. Independent of status.
    pub fn assert_live_invariants(&self) -> Result<()> {
        require!(
            self.withdrawn_amount <= self.released_amount,
            StreamPayV2Error::ReleaseAmountExceeded
        );
        require!(
            self.released_amount <= self.total_amount,
            StreamPayV2Error::ReleaseAmountExceeded
        );
        require!(
            self.refunded_amount <= self.total_amount,
            StreamPayV2Error::ReleaseAmountExceeded
        );
        let moved = self
            .withdrawn_amount
            .checked_add(self.refunded_amount)
            .ok_or(StreamPayV2Error::ArithmeticOverflow)?;
        require!(
            moved <= self.total_amount,
            StreamPayV2Error::ReleaseAmountExceeded
        );
        Ok(())
    }

    /// Frozen settlement after Cancelled, Resolved, Completed,
    /// ActivationRejected, Declined, or Expired.
    pub fn assert_terminal_settlement_invariants(&self) -> Result<()> {
        self.assert_live_invariants()?;
        require!(
            self.status.allows_settlement_claims(),
            StreamPayV2Error::InvalidState
        );
        let conserved = self
            .freelancer_settlement_amount
            .checked_add(self.employer_refundable_amount)
            .ok_or(StreamPayV2Error::ArithmeticOverflow)?;
        require!(
            conserved == self.total_amount,
            StreamPayV2Error::ReleaseAmountExceeded
        );
        require!(
            self.released_amount == self.freelancer_settlement_amount,
            StreamPayV2Error::ReleaseAmountExceeded
        );
        require!(
            self.withdrawn_amount <= self.freelancer_settlement_amount,
            StreamPayV2Error::ReleaseAmountExceeded
        );
        require!(
            self.refunded_amount <= self.employer_refundable_amount,
            StreamPayV2Error::ReleaseAmountExceeded
        );
        Ok(())
    }

    /// Cap on freelancer SPL that may ever leave escrow in the current status.
    ///
    /// Active: currently released accounting. Cancelled / Resolved / Completed:
    /// frozen settlement, already reconciled with `released_amount`. Other
    /// statuses cannot withdraw.
    pub fn freelancer_withdraw_cap(&self) -> Result<u64> {
        match self.status {
            ContractStatus::Active => Ok(self.released_amount),
            status if status.allows_settlement_claims() => {
                require!(
                    self.freelancer_settlement_amount == self.released_amount,
                    StreamPayV2Error::ReleaseAmountExceeded
                );
                Ok(self.freelancer_settlement_amount)
            }
            other if other.is_terminal() => Err(StreamPayV2Error::ContractTerminal.into()),
            _ => Err(StreamPayV2Error::InvalidState.into()),
        }
    }

    /// `cap - withdrawn_amount`. Caller must still reject a zero result.
    pub fn available_to_withdraw(&self) -> Result<u64> {
        let cap = self.freelancer_withdraw_cap()?;
        cap.checked_sub(self.withdrawn_amount)
            .ok_or(StreamPayV2Error::ReleaseAmountExceeded.into())
    }

    /// Remaining employer SPL after Phase 7 freeze: `refundable - refunded`.
    /// Active contracts have no refund path.
    pub fn available_to_refund(&self) -> Result<u64> {
        match self.status {
            status if status.allows_settlement_claims() => {}
            other if other.is_terminal() => {
                return Err(StreamPayV2Error::ContractTerminal.into());
            }
            _ => return Err(StreamPayV2Error::InvalidState.into()),
        }
        self.employer_refundable_amount
            .checked_sub(self.refunded_amount)
            .ok_or(StreamPayV2Error::ReleaseAmountExceeded.into())
    }
}

/// Floor-division streaming accrual: `floor(main_amount * elapsed / duration)`.
///
/// `now <= start_time` → 0. `now >= end_time` → `main_amount` exactly.
/// Intermediate arithmetic is `u128` so `main_amount * elapsed` cannot wrap.
pub fn canonical_stream_accrued(
    main_amount: u64,
    start_time: i64,
    end_time: i64,
    now: i64,
) -> Result<u64> {
    if now <= start_time {
        return Ok(0);
    }

    let duration = end_time
        .checked_sub(start_time)
        .ok_or(StreamPayV2Error::ArithmeticOverflow)?;
    require!(duration > 0, StreamPayV2Error::InvalidDuration);

    if now >= end_time {
        return Ok(main_amount);
    }

    let elapsed = now
        .checked_sub(start_time)
        .ok_or(StreamPayV2Error::ArithmeticOverflow)?;
    let product = (main_amount as u128)
        .checked_mul(elapsed as u128)
        .ok_or(StreamPayV2Error::ArithmeticOverflow)?;
    let accrued = product
        .checked_div(duration as u128)
        .ok_or(StreamPayV2Error::ArithmeticOverflow)?;
    u64::try_from(accrued).map_err(|_| StreamPayV2Error::ArithmeticOverflow.into())
}

#[cfg(test)]
mod accrual_tests {
    use super::canonical_stream_accrued;

    #[test]
    fn ten_over_three_seconds_is_3_6_10() {
        assert_eq!(canonical_stream_accrued(10, 0, 3, 0).unwrap(), 0);
        assert_eq!(canonical_stream_accrued(10, 0, 3, 1).unwrap(), 3);
        assert_eq!(canonical_stream_accrued(10, 0, 3, 2).unwrap(), 6);
        assert_eq!(canonical_stream_accrued(10, 0, 3, 3).unwrap(), 10);
        assert_eq!(canonical_stream_accrued(10, 0, 3, 100).unwrap(), 10);
    }

    #[test]
    fn three_over_ten_seconds_reaches_exactly_three() {
        assert_eq!(canonical_stream_accrued(3, 0, 10, 0).unwrap(), 0);
        assert_eq!(canonical_stream_accrued(3, 0, 10, 3).unwrap(), 0);
        assert_eq!(canonical_stream_accrued(3, 0, 10, 4).unwrap(), 1);
        assert_eq!(canonical_stream_accrued(3, 0, 10, 9).unwrap(), 2);
        assert_eq!(canonical_stream_accrued(3, 0, 10, 10).unwrap(), 3);
    }

    #[test]
    fn before_or_at_start_is_zero() {
        assert_eq!(canonical_stream_accrued(1_000, 50, 110, 49).unwrap(), 0);
        assert_eq!(canonical_stream_accrued(1_000, 50, 110, 50).unwrap(), 0);
    }

    #[test]
    fn primes_and_uneven_durations_reach_exact_total() {
        for amount in [1u64, 2, 3, 7, 10, 11, 13, 97] {
            let start = 1_000i64;
            let duration = 10i64;
            let end = start + duration;
            let mut previous = 0u64;
            for elapsed in 0..=duration {
                let accrued =
                    canonical_stream_accrued(amount, start, end, start + elapsed).unwrap();
                assert!(accrued >= previous, "monotonic {amount} @{elapsed}");
                assert!(accrued <= amount);
                previous = accrued;
            }
            assert_eq!(
                canonical_stream_accrued(amount, start, end, end).unwrap(),
                amount
            );
            assert_eq!(
                canonical_stream_accrued(amount, start, end, end + 1_000).unwrap(),
                amount
            );
        }
        assert_eq!(canonical_stream_accrued(1, 0, 60, 59).unwrap(), 0);
        assert_eq!(canonical_stream_accrued(1, 0, 60, 60).unwrap(), 1);
        assert_eq!(canonical_stream_accrued(7, 0, 10, 5).unwrap(), 3);
        assert_eq!(canonical_stream_accrued(7, 0, 10, 10).unwrap(), 7);
    }

    #[test]
    fn large_safe_u64_values_do_not_overflow_or_over_accrue() {
        let amount = 1_000_000_000_000u64;
        assert_eq!(canonical_stream_accrued(amount, 0, 3, 0).unwrap(), 0);
        assert_eq!(
            canonical_stream_accrued(amount, 0, 3, 1).unwrap(),
            333_333_333_333
        );
        assert_eq!(
            canonical_stream_accrued(amount, 0, 3, 2).unwrap(),
            666_666_666_666
        );
        assert_eq!(canonical_stream_accrued(amount, 0, 3, 3).unwrap(), amount);
        assert_eq!(canonical_stream_accrued(amount, 0, 3, 30).unwrap(), amount);
    }
}

/// Documented, compiler-verified account size.
///
/// `INIT_SPACE` excludes the 8-byte discriminator, so an account is allocated
/// with `space = 8 + Contract::INIT_SPACE` (629 bytes total). Because
/// allocation uses the maximum URI length, every `Contract` account is the same
/// on-chain size regardless of the URI actually stored.
pub const CONTRACT_INIT_SPACE: usize = 621;
const _: () = assert!(<Contract as anchor_lang::Space>::INIT_SPACE == CONTRACT_INIT_SPACE);
const _: () = assert!(Contract::DISCRIMINATOR.len() == 8);
