//! The V2 `WorkUnit` account: one reviewable unit of work belonging to a
//! `Contract`.
//!
//! A single type serves all three payment modes, because the modes are mutually
//! exclusive — a streaming contract has only checkpoints, a milestone or fixed
//! contract has only milestones — so one index space can never collide.
//!
//! | field                       | as `Checkpoint`                          | as `Milestone` / `Fixed`             |
//! |-----------------------------|------------------------------------------|--------------------------------------|
//! | created by                  | freelancer, at submission                | employer, while the contract is Draft |
//! | `amount`                    | derived from the agreed vesting formula   | negotiated before acceptance         |
//! | initial `status`            | `Submitted`                              | `Defined`                            |
//! | `period_start`/`period_end` | the streaming period, half-open           | unused                               |
//! | `due_offset_seconds`        | unused                                   | seconds after contract start         |
//! | concurrency                 | serialized, one open at a time            | reviewable in parallel               |
//!
//! Field ordering follows the same rule as `Contract`: fixed-size fields first
//! so `contract` stays at a stable offset (9) for client-side filtering, with
//! the single variable-length field last.

use anchor_lang::prelude::*;

use crate::v2::constants::{MAX_URI_LEN, V2_LAYOUT_VERSION};
use crate::v2::enums::{ReleaseTrigger, WorkUnitKind, WorkUnitStatus};
use crate::v2::errors::StreamPayV2Error;

#[account]
#[derive(InitSpace)]
pub struct WorkUnit {
    /// On-chain layout version, for forward migration.
    pub version: u8,

    /// Parent contract. Stored in addition to being a PDA seed: the seed
    /// constraint proves derivation and this field enables a `has_one` check,
    /// so cross-contract substitution is caught two independent ways.
    pub contract: Pubkey,

    /// Zero-based index within the parent contract, and part of the PDA seeds,
    /// which makes a duplicate unit unrepresentable.
    pub index: u32,

    pub kind: WorkUnitKind,
    pub status: WorkUnitStatus,

    /// Amount credited to `Contract::released_amount` when this unit is
    /// released. Immutable once submitted.
    pub amount: u64,

    // -----------------------------------------------------------------
    // Scheduling. Which of these is meaningful is determined by `kind`, never
    // by a field being zero.
    // -----------------------------------------------------------------
    /// Inclusive start of the streaming period. `Checkpoint` only.
    pub period_start: i64,
    /// Exclusive end of the streaming period. `Checkpoint` only.
    pub period_end: i64,
    /// Seconds after `Contract::start_time` when this deliverable is due.
    /// `Milestone` / `Fixed` only. Always a duration, never a calendar
    /// timestamp, so the same field is valid under both `OnActivation` and
    /// `Scheduled`. Absolute due time is `start_time + due_offset_seconds`
    /// once the contract has actually started.
    pub due_offset_seconds: i64,

    // -----------------------------------------------------------------
    // Review lifecycle.
    // -----------------------------------------------------------------
    /// When the current submission was made.
    pub submitted_at: i64,

    /// Deadline for whichever party must act next, determined by `status`:
    ///
    /// - `Submitted`: the employer's review deadline. Once it passes, review
    ///   timeout finalization may release the amount.
    /// - `Revising`: the freelancer's resubmission deadline. Once it passes,
    ///   the employer may void the stale unit, which is what stops an absent
    ///   freelancer from blocking cancellation forever.
    /// - any other status: not read, and never used as a lifecycle predicate.
    pub action_deadline: i64,

    /// When the employer signed an approval.
    pub approved_at: i64,
    /// When the amount was credited to the contract's released total.
    pub released_at: i64,

    /// Revision cycles consumed, bounded by `Contract::max_revisions`.
    pub revision_count: u8,

    /// Why the unit was released. Only meaningful once `status == Released`.
    pub release_trigger: ReleaseTrigger,

    /// Hash of the off-chain deliverable, making it tamper-evident.
    pub submission_hash: [u8; 32],

    pub bump: u8,

    /// Upgrade headroom; see `Contract::reserved`.
    pub reserved: [u8; 64],

    // -----------------------------------------------------------------
    // Variable length. Must remain the final field.
    // -----------------------------------------------------------------
    /// Bounded pointer to the off-chain deliverable. Work files themselves are
    /// never stored on-chain.
    #[max_len(MAX_URI_LEN)]
    pub submission_uri: String,
}

impl WorkUnit {
    /// Populate a newly allocated trial WorkUnit. Index is 0 and is *not* a
    /// `work_unit_count` slot; identity is the `trial_unit` PDA.
    pub fn init_as_trial(&mut self, contract: Pubkey, amount: u64, bump: u8) {
        self.version = V2_LAYOUT_VERSION;
        self.contract = contract;
        self.index = 0;
        self.kind = WorkUnitKind::Trial;
        self.status = WorkUnitStatus::Defined;
        self.amount = amount;
        self.period_start = 0;
        self.period_end = 0;
        // Unused for Trial; `kind` is the authority, not a zero offset.
        self.due_offset_seconds = 0;
        self.submitted_at = 0;
        self.action_deadline = 0;
        self.approved_at = 0;
        self.released_at = 0;
        self.revision_count = 0;
        self.release_trigger = ReleaseTrigger::NotReleased;
        self.submission_hash = [0u8; 32];
        self.bump = bump;
        self.reserved = [0u8; 64];
        self.submission_uri = String::new();
    }

    /// Populate the single main deliverable of a Fixed contract. Lives at
    /// `work_unit` index 0 with amount equal to `Contract::main_amount`.
    pub fn init_as_fixed(
        &mut self,
        contract: Pubkey,
        amount: u64,
        due_offset_seconds: i64,
        bump: u8,
    ) {
        self.version = V2_LAYOUT_VERSION;
        self.contract = contract;
        self.index = 0;
        self.kind = WorkUnitKind::Fixed;
        self.status = WorkUnitStatus::Defined;
        self.amount = amount;
        self.period_start = 0;
        self.period_end = 0;
        self.due_offset_seconds = due_offset_seconds;
        self.submitted_at = 0;
        self.action_deadline = 0;
        self.approved_at = 0;
        self.released_at = 0;
        self.revision_count = 0;
        self.release_trigger = ReleaseTrigger::NotReleased;
        self.submission_hash = [0u8; 32];
        self.bump = bump;
        self.reserved = [0u8; 64];
        self.submission_uri = String::new();
    }

    /// Phase 5 generic review is only for post-activation Milestone/Fixed units.
    /// Trial keeps its dedicated instructions. Streaming earnings are
    /// contract-level time accrual (`release_stream_accrual`), not a WorkUnit.
    pub fn require_main_deliverable(&self) -> Result<()> {
        match self.kind {
            WorkUnitKind::Milestone | WorkUnitKind::Fixed => Ok(()),
            WorkUnitKind::Checkpoint | WorkUnitKind::Trial => {
                Err(StreamPayV2Error::UnsupportedWorkUnitKind.into())
            }
        }
    }

    /// Credit this unit as released. Idempotency is the caller's problem:
    /// `status` must already have been proven `Submitted`.
    pub fn mark_released(&mut self, now: i64, trigger: ReleaseTrigger) {
        self.status = WorkUnitStatus::Released;
        if trigger == ReleaseTrigger::EmployerApproval {
            self.approved_at = now;
        }
        self.released_at = now;
        self.release_trigger = trigger;
    }

    /// Terminate a stale Revising unit. Idempotency is the caller's problem:
    /// `status` must already have been proven `Revising`. Submission evidence,
    /// revision_count, action_deadline, and amount are left untouched.
    pub fn mark_voided(&mut self) {
        self.status = WorkUnitStatus::Void;
    }

    /// Calendar due instant once the contract has a real `start_time`.
    ///
    /// Do not call this with a fabricated start. For a defined milestone the
    /// offset is strictly positive, so the result is always after `start_time`.
    pub fn due_at(&self, start_time: i64) -> Result<i64> {
        start_time
            .checked_add(self.due_offset_seconds)
            .ok_or(StreamPayV2Error::ArithmeticOverflow.into())
    }
}

/// Documented, compiler-verified account size.
///
/// Allocated with `space = 8 + WorkUnit::INIT_SPACE` (414 bytes total).
pub const WORK_UNIT_INIT_SPACE: usize = 406;
const _: () = assert!(<WorkUnit as anchor_lang::Space>::INIT_SPACE == WORK_UNIT_INIT_SPACE);
const _: () = assert!(WorkUnit::DISCRIMINATOR.len() == 8);
