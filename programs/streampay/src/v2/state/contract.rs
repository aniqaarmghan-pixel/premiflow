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
use crate::v2::enums::{ContractStatus, PaymentMode, StartMode};
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
    /// `trial_amount` (8) and `main_amount` (8) were taken from it.
    pub reserved: [u8; 92],

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
