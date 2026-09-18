//! `approve_work_unit`: the employer releases a submitted post-activation unit.
//!
//! Credits `released_amount` by the unit's agreed amount. Does not transfer
//! SPL tokens and does not change `withdrawn_amount`.

use anchor_lang::prelude::*;

use crate::v2::constants::{CONTRACT_SEED, WORK_UNIT_SEED};
use crate::v2::enums::{ContractStatus, PaymentMode, ReleaseTrigger, WorkUnitStatus};
use crate::v2::errors::StreamPayV2Error;
use crate::v2::events::WorkUnitApproved;
use crate::v2::state::{Contract, WorkUnit};

#[derive(Accounts)]
pub struct ApproveWorkUnit<'info> {
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

pub fn handle_approve_work_unit(ctx: Context<ApproveWorkUnit>) -> Result<()> {
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
        work_unit.status != WorkUnitStatus::Released && work_unit.status != WorkUnitStatus::Void,
        StreamPayV2Error::UnitAlreadyReleased
    );
    require!(
        work_unit.status == WorkUnitStatus::Submitted,
        StreamPayV2Error::UnitNotUnderReview
    );
    require!(
        !work_unit.submission_uri.is_empty(),
        StreamPayV2Error::InvalidMetadata
    );

    let amount = work_unit.amount;
    let work_unit_index = work_unit.index;
    let contract_key = contract.key();
    let work_unit_key = work_unit.key();
    let employer = contract.employer;

    let work_unit = &mut ctx.accounts.work_unit;
    work_unit.mark_released(now, ReleaseTrigger::EmployerApproval);

    let contract = &mut ctx.accounts.contract;
    contract.credit_main_release(amount)?;

    emit!(WorkUnitApproved {
        contract: contract_key,
        work_unit: work_unit_key,
        employer,
        work_unit_index,
        amount,
        approved_at: now,
    });

    Ok(())
}
