//! `request_revision`: the employer asks for a bounded post-activation resubmit.
//!
//! Does not release money and does not transfer tokens. After this call the
//! unit is `Revising`, which is not under employer review, so a stale
//! `action_deadline` cannot be timeout-finalized.

use anchor_lang::prelude::*;

use crate::v2::constants::{CONTRACT_SEED, WORK_UNIT_SEED};
use crate::v2::enums::{ContractStatus, PaymentMode, WorkUnitStatus};
use crate::v2::errors::StreamPayV2Error;
use crate::v2::events::WorkUnitRevisionRequested;
use crate::v2::state::{Contract, WorkUnit};

#[derive(Accounts)]
pub struct RequestRevision<'info> {
    pub employer: Signer<'info>,

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
        constraint = !contract.payment_mode.uses_checkpoints() @ StreamPayV2Error::InvalidPaymentMode,
    )]
    pub contract: Account<'info, Contract>,

    #[account(
        mut,
        seeds = [
            WORK_UNIT_SEED,
            contract.key().as_ref(),
            &work_unit.index.to_le_bytes(),
        ],
        bump = work_unit.bump,
        has_one = contract @ StreamPayV2Error::InvalidWorkUnit,
    )]
    pub work_unit: Account<'info, WorkUnit>,
}

pub fn handle_request_revision(ctx: Context<RequestRevision>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let contract = &ctx.accounts.contract;
    let work_unit = &ctx.accounts.work_unit;

    require!(
        contract.status == ContractStatus::Active,
        StreamPayV2Error::InvalidState
    );
    match contract.payment_mode {
        PaymentMode::Milestone | PaymentMode::Fixed => {}
        PaymentMode::Streaming | PaymentMode::Hourly => {
            return Err(StreamPayV2Error::InvalidPaymentMode.into())
        }
    }
    work_unit.require_main_deliverable()?;
    require!(
        work_unit.status != WorkUnitStatus::Released && work_unit.status != WorkUnitStatus::Void,
        StreamPayV2Error::UnitAlreadyReleased
    );
    require!(
        work_unit.status == WorkUnitStatus::Submitted,
        StreamPayV2Error::UnitNotUnderReview
    );
    require!(
        now < work_unit.action_deadline,
        StreamPayV2Error::ReviewWindowClosed
    );
    require!(
        work_unit.revision_count < contract.max_revisions,
        StreamPayV2Error::RevisionLimitReached
    );

    let revision_count = work_unit
        .revision_count
        .checked_add(1)
        .ok_or(StreamPayV2Error::ArithmeticOverflow)?;
    let action_deadline = now
        .checked_add(contract.review_duration)
        .ok_or(StreamPayV2Error::ArithmeticOverflow)?;

    let work_unit_index = work_unit.index;
    let contract_key = contract.key();
    let work_unit_key = work_unit.key();
    let employer = contract.employer;

    let work_unit = &mut ctx.accounts.work_unit;
    work_unit.revision_count = revision_count;
    work_unit.status = WorkUnitStatus::Revising;
    work_unit.action_deadline = action_deadline;

    emit!(WorkUnitRevisionRequested {
        contract: contract_key,
        work_unit: work_unit_key,
        employer,
        work_unit_index,
        revision_count,
        action_deadline,
    });

    Ok(())
}
