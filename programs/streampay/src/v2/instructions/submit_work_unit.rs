//! `submit_work_unit`: the freelancer delivers post-activation normal work.
//!
//! Applies to Milestone and Fixed work units only. Does not release money and
//! does not move SPL tokens. Trial work keeps `submit_trial_work`. Streaming
//! earnings are time-based (`release_stream_accrual`); checkpoint WorkUnits
//! are not a Phase 6 release path.

use anchor_lang::prelude::*;

use crate::v2::constants::{CONTRACT_SEED, MAX_URI_LEN, WORK_UNIT_SEED};
use crate::v2::enums::{ContractStatus, PaymentMode, WorkUnitStatus};
use crate::v2::errors::StreamPayV2Error;
use crate::v2::events::WorkUnitSubmitted;
use crate::v2::state::{Contract, WorkUnit};

#[derive(Accounts)]
pub struct SubmitWorkUnit<'info> {
    pub freelancer: Signer<'info>,

    #[account(
        mut,
        has_one = freelancer @ StreamPayV2Error::Unauthorized,
        seeds = [
            CONTRACT_SEED,
            contract.employer.as_ref(),
            freelancer.key().as_ref(),
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

pub fn handle_submit_work_unit(
    ctx: Context<SubmitWorkUnit>,
    submission_uri: String,
    submission_hash: [u8; 32],
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let contract = &ctx.accounts.contract;
    let work_unit = &ctx.accounts.work_unit;

    require!(
        contract.status == ContractStatus::Active,
        StreamPayV2Error::InvalidState
    );
    require!(
        now >= contract.start_time,
        StreamPayV2Error::ContractNotStarted
    );
    match contract.payment_mode {
        PaymentMode::Milestone | PaymentMode::Fixed => {}
        PaymentMode::Streaming | PaymentMode::Hourly => {
            return Err(StreamPayV2Error::InvalidPaymentMode.into())
        }
    }
    work_unit.require_main_deliverable()?;
    require!(
        work_unit.status.accepts_submission(),
        StreamPayV2Error::UnitNotSubmittable
    );
    require!(
        !submission_uri.is_empty() && submission_uri.len() <= MAX_URI_LEN,
        StreamPayV2Error::InvalidMetadata
    );

    let action_deadline = now
        .checked_add(contract.review_duration)
        .ok_or(StreamPayV2Error::ArithmeticOverflow)?;

    let was_defined = work_unit.status == WorkUnitStatus::Defined;
    let revision_count = work_unit.revision_count;
    let work_unit_index = work_unit.index;
    let contract_key = contract.key();
    let work_unit_key = work_unit.key();
    let freelancer = contract.freelancer;

    let work_unit = &mut ctx.accounts.work_unit;
    work_unit.status = WorkUnitStatus::Submitted;
    work_unit.submission_uri = submission_uri;
    work_unit.submission_hash = submission_hash;
    work_unit.submitted_at = now;
    work_unit.action_deadline = action_deadline;

    if was_defined {
        let contract = &mut ctx.accounts.contract;
        contract.open_review_count = contract
            .open_review_count
            .checked_add(1)
            .ok_or(StreamPayV2Error::ArithmeticOverflow)?;
    }

    emit!(WorkUnitSubmitted {
        contract: contract_key,
        work_unit: work_unit_key,
        freelancer,
        work_unit_index,
        submitted_at: now,
        action_deadline,
        revision_count,
    });

    Ok(())
}
