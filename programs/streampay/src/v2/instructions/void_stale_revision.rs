//! `void_stale_revision`: employer terminates a stale Revising main unit.
//!
//! Applies to Fixed and Milestone deliverables only. Does not release money,
//! does not create a refund entitlement, and does not transfer SPL tokens.
//! Escrow is unchanged; later employer recovery still goes through the
//! existing cancel / dispute / refund path.

use anchor_lang::prelude::*;

use crate::v2::constants::{CONTRACT_SEED, WORK_UNIT_SEED};
use crate::v2::enums::{ContractStatus, PaymentMode, WorkUnitStatus};
use crate::v2::errors::StreamPayV2Error;
use crate::v2::events::WorkUnitStaleRevisionVoided;
use crate::v2::state::{Contract, WorkUnit};

#[derive(Accounts)]
pub struct VoidStaleRevision<'info> {
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

pub fn handle_void_stale_revision(ctx: Context<VoidStaleRevision>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let contract = &ctx.accounts.contract;
    let work_unit = &ctx.accounts.work_unit;

    require!(
        contract.status == ContractStatus::Active,
        StreamPayV2Error::InvalidState
    );
    match contract.payment_mode {
        PaymentMode::Milestone | PaymentMode::Fixed => {}
        PaymentMode::Streaming => return Err(StreamPayV2Error::InvalidPaymentMode.into()),
    }
    work_unit.require_main_deliverable()?;
    require!(
        work_unit.status != WorkUnitStatus::Void,
        StreamPayV2Error::UnitVoided
    );
    require!(
        work_unit.status != WorkUnitStatus::Released,
        StreamPayV2Error::UnitAlreadyReleased
    );
    require!(
        work_unit.status == WorkUnitStatus::Revising,
        StreamPayV2Error::UnitNotUnderReview
    );
    require!(
        now >= work_unit.action_deadline,
        StreamPayV2Error::UnitNotStale
    );

    let work_unit_index = work_unit.index;
    let contract_key = contract.key();
    let work_unit_key = work_unit.key();
    let employer = contract.employer;

    let work_unit = &mut ctx.accounts.work_unit;
    work_unit.mark_voided();

    let contract = &mut ctx.accounts.contract;
    contract.open_review_count = contract
        .open_review_count
        .checked_sub(1)
        .ok_or(StreamPayV2Error::ArithmeticOverflow)?;
    contract.voided_unit_count = contract
        .voided_unit_count
        .checked_add(1)
        .ok_or(StreamPayV2Error::ArithmeticOverflow)?;

    emit!(WorkUnitStaleRevisionVoided {
        contract: contract_key,
        work_unit: work_unit_key,
        employer,
        work_unit_index,
        voided_at: now,
    });

    Ok(())
}
