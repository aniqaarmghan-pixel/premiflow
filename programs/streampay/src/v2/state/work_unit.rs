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
//! | `due_date`                  | unused                                   | advisory deadline                    |
//! | concurrency                 | serialized, one open at a time            | reviewable in parallel               |
//!
//! Field ordering follows the same rule as `Contract`: fixed-size fields first
//! so `contract` stays at a stable offset (9) for client-side filtering, with
//! the single variable-length field last.

use anchor_lang::prelude::*;

use crate::v2::constants::MAX_URI_LEN;
use crate::v2::enums::{ReleaseTrigger, WorkUnitKind, WorkUnitStatus};

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
    /// Advisory delivery deadline. `Milestone` / `Fixed` only.
    pub due_date: i64,

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

/// Documented, compiler-verified account size.
///
/// Allocated with `space = 8 + WorkUnit::INIT_SPACE` (414 bytes total).
pub const WORK_UNIT_INIT_SPACE: usize = 406;
const _: () = assert!(<WorkUnit as anchor_lang::Space>::INIT_SPACE == WORK_UNIT_INIT_SPACE);
const _: () = assert!(WorkUnit::DISCRIMINATOR.len() == 8);
