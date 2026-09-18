//! `finalize_review_timeout`: permissionless auto-release of expired review.
//!
//! Any signer may invoke this. The outcome does not depend on caller identity.
//! Applies only to post-activation Milestone/Fixed units currently `Submitted`.
//! Trial timeout remains a separate product-policy problem.

use anchor_lang::prelude::*;

use crate::v2::constants::{CONTRACT_SEED, WORK_UNIT_SEED};
use crate::v2::enums::{ContractStatus, PaymentMode, ReleaseTrigger, WorkUnitStatus};
use crate::v2::errors::StreamPayV2Error;
use crate::v2::events::WorkUnitReviewTimedOut;
use crate::v2::state::{Contract, WorkUnit};

#[derive(Accounts)]
pub struct FinalizeReviewTimeout<'info> {
    /// Permissionless: the result is determined by clock and unit state, not
    /// by who pays the fee.
    pub caller: Signer<'info>,

    #[account(
        mut,
        seeds = [
            CONTRACT_SEED,
            contract.employer.as_ref(),
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

pub fn handle_finalize_review_timeout(ctx: Context<FinalizeReviewTimeout>) -> Result<()> {
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
    require!(
        now >= work_unit.action_deadline,
        StreamPayV2Error::ReviewWindowOpen
    );

    let amount = work_unit.amount;
    let work_unit_index = work_unit.index;
    let contract_key = contract.key();
    let work_unit_key = work_unit.key();

    let work_unit = &mut ctx.accounts.work_unit;
    work_unit.mark_released(now, ReleaseTrigger::ReviewTimeout);

    let contract = &mut ctx.accounts.contract;
    contract.credit_main_release(amount)?;

    emit!(WorkUnitReviewTimedOut {
        contract: contract_key,
        work_unit: work_unit_key,
        work_unit_index,
        amount,
        released_at: now,
    });

    Ok(())
}
