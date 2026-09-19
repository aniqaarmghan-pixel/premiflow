//! `add_milestone`: the employer defines one deliverable of a milestone
//! contract while it is still a draft.
//!
//! The contract's money is already fully escrowed by `create_contract`. What is
//! still missing is *what the money buys*, and this instruction supplies one
//! piece of that at a time until the allocation is complete.
//!
//! The index is not a caller input. It is read from `Contract::work_unit_count`
//! and used directly in the `WorkUnit` seeds, which makes several classes of
//! bug unrepresentable rather than merely rejected: indices are always
//! contiguous from zero, a duplicate index is impossible because the address is
//! already taken, and a caller cannot skip ahead to reserve index 500.
//!
//! On milestone descriptions: this instruction stores only the terms that the
//! program must enforce — the amount, the due offset from start, and the
//! position in the sequence. Human-readable titles and specifications stay in
//! the contract's off-chain record referenced by `Contract::metadata_uri`. The
//! `WorkUnit`'s `submission_uri` / `submission_hash` fields belong to the
//! *freelancer's* deliverable and are deliberately left empty here; reusing
//! them for employer descriptions would make it impossible to tell a
//! specification from a submission, and would let "defining a milestone" and
//! "delivering it" write the same bytes.
//!
//! Due offsets, not calendar dates: a milestone is due
//! `due_offset_seconds` after the contract actually starts. That is the same
//! representation under `OnActivation` and `Scheduled`, so a late acceptance
//! cannot make a milestone due before work begins. Absolute time is
//! `start_time + due_offset_seconds`, resolved only after employer activation.
//!
//! No tokens move in this instruction.

use anchor_lang::prelude::*;

use crate::v2::constants::{CONTRACT_SEED, MAX_MILESTONES, V2_LAYOUT_VERSION, WORK_UNIT_SEED};
use crate::v2::enums::{PaymentMode, ReleaseTrigger, WorkUnitKind, WorkUnitStatus};
use crate::v2::errors::StreamPayV2Error;
use crate::v2::events::MilestoneAdded;
use crate::v2::state::{Contract, WorkUnit};

#[derive(Accounts)]
pub struct AddMilestone<'info> {
    /// Pays rent for the new `WorkUnit`, so must be mutable, and must sign.
    /// `has_one` on the contract below is what ties this signer to *this*
    /// contract's employer.
    #[account(mut)]
    pub employer: Signer<'info>,

    /// `Account<Contract>` already proves this is a genuine contract owned by
    /// this program with the right discriminator. Re-deriving the PDA from the
    /// stored identity fields then proves the account sits at its canonical
    /// address, so a cloned copy at some other key cannot be substituted.
    /// `has_one` proves the signer is this contract's employer.
    #[account(
        mut,
        has_one = employer @ StreamPayV2Error::Unauthorized,
        seeds = [
            CONTRACT_SEED,
            employer.key().as_ref(),
            contract.freelancer.as_ref(),
            &contract.contract_id.to_le_bytes(),
        ],
        bump = contract.bump,
    )]
    pub contract: Account<'info, Contract>,

    /// The new milestone. Its address is derived from the parent contract and
    /// the parent's current unit count, so the caller has no say in either.
    #[account(
        init,
        payer = employer,
        space = 8 + WorkUnit::INIT_SPACE,
        seeds = [
            WORK_UNIT_SEED,
            contract.key().as_ref(),
            &contract.work_unit_count.to_le_bytes(),
        ],
        bump,
    )]
    pub work_unit: Account<'info, WorkUnit>,

    pub system_program: Program<'info, System>,
}

pub fn handle_add_milestone(
    ctx: Context<AddMilestone>,
    amount: u64,
    due_offset_seconds: i64,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let contract = &ctx.accounts.contract;

    // Only milestone contracts have milestones. Matching exhaustively rather
    // than testing for inequality means a future payment mode cannot silently
    // fall into the permitted branch.
    match contract.payment_mode {
        PaymentMode::Milestone => {}
        PaymentMode::Streaming => return Err(StreamPayV2Error::StreamingHasNoMilestones.into()),
        PaymentMode::Fixed | PaymentMode::Hourly => {
            return Err(StreamPayV2Error::InvalidPaymentMode.into())
        }
    }

    // Terms may only be written while the contract is a draft. This single check
    // also covers the two cases that matter most: a contract whose terms were
    // already finalized (now `PendingAcceptance`) and one that is terminal.
    // `status` is the authority here, never a timestamp.
    require!(
        contract.status.allows_term_changes(),
        StreamPayV2Error::InvalidState
    );

    // An expired offer must not be quietly extended by continuing to edit it.
    require!(
        now < contract.acceptance_deadline,
        StreamPayV2Error::AcceptanceExpired
    );

    require!(
        contract.work_unit_count < MAX_MILESTONES,
        StreamPayV2Error::TooManyMilestones
    );

    require!(amount > 0, StreamPayV2Error::InvalidAmount);

    // Relative to start, never a calendar timestamp. `> 0` so a milestone cannot
    // be due at or before the moment work begins, even if the freelancer accepts
    // on the last second of the offer window. `<= duration_seconds` so it cannot
    // fall after the contract term. Strictly greater than the previous offset
    // so milestones are ordered without reading sibling accounts: the previous
    // offset lives on the parent as `last_milestone_due_offset` (zero before
    // the first milestone, which makes the first-offset `> 0` check the same
    // comparison).
    require!(due_offset_seconds > 0, StreamPayV2Error::InvalidDueDate);
    require!(
        due_offset_seconds <= contract.duration_seconds,
        StreamPayV2Error::InvalidDueDate
    );
    require!(
        due_offset_seconds > contract.last_milestone_due_offset,
        StreamPayV2Error::InvalidDueDate
    );

    // Milestones spend the main-contract base, not the trial reservation.
    // `main_amount == total_amount` when there is no trial, so Phase 2
    // behaviour is unchanged for no-trial contracts.
    let new_allocated = contract
        .allocated_amount
        .checked_add(amount)
        .ok_or(StreamPayV2Error::ArithmeticOverflow)?;
    require!(
        new_allocated <= contract.main_amount,
        StreamPayV2Error::MilestoneAllocationExceeded
    );

    let index = contract.work_unit_count;
    let next_count = index
        .checked_add(1)
        .ok_or(StreamPayV2Error::ArithmeticOverflow)?;

    let contract_key = contract.key();
    let work_unit_key = ctx.accounts.work_unit.key();

    {
        let work_unit = &mut ctx.accounts.work_unit;

        work_unit.version = V2_LAYOUT_VERSION;
        work_unit.contract = contract_key;
        work_unit.index = index;
        work_unit.kind = WorkUnitKind::Milestone;
        work_unit.status = WorkUnitStatus::Defined;
        work_unit.amount = amount;
        work_unit.due_offset_seconds = due_offset_seconds;

        // Streaming period bounds do not apply to a milestone. `kind` is what
        // tells later phases which scheduling fields to read, so these are left
        // unwritten rather than filled with a fabricated period.
        work_unit.period_start = 0;
        work_unit.period_end = 0;

        // Nothing has been submitted, reviewed or released. As above, these are
        // zero because no event has happened yet; `status` and `release_trigger`
        // are what answer whether anything has.
        work_unit.submission_uri = String::new();
        work_unit.submission_hash = [0u8; 32];
        work_unit.submitted_at = 0;
        work_unit.action_deadline = 0;
        work_unit.approved_at = 0;
        work_unit.released_at = 0;
        work_unit.revision_count = 0;
        work_unit.release_trigger = ReleaseTrigger::NotReleased;

        work_unit.bump = ctx.bumps.work_unit;
        work_unit.reserved = [0u8; 64];
    }

    // Only the allocation, the unit count and the due-offset cursor change.
    // Release, withdrawal and refund counters belong to settlement and are
    // untouched here.
    let contract = &mut ctx.accounts.contract;
    contract.allocated_amount = new_allocated;
    contract.work_unit_count = next_count;
    contract.last_milestone_due_offset = due_offset_seconds;

    emit!(MilestoneAdded {
        contract: contract_key,
        work_unit: work_unit_key,
        index,
        amount,
        due_offset_seconds,
        allocated_amount: new_allocated,
    });

    Ok(())
}
