//! `settle_trial_and_end`: pay a submitted trial and end without activating.
//!
//! Employer accepts that the trial is owed, declines the main engagement, and
//! freezes a Cancelled split. No SPL transfer. No dispute. No stream or Hourly
//! start.

use anchor_lang::prelude::*;

use crate::v2::constants::{CONTRACT_SEED, TRIAL_UNIT_SEED};
use crate::v2::enums::{ContractStatus, ReleaseTrigger, WorkUnitKind, WorkUnitStatus};
use crate::v2::errors::StreamPayV2Error;
use crate::v2::events::TrialSettledAndEnded;
use crate::v2::state::{Contract, WorkUnit};

#[derive(Accounts)]
pub struct SettleTrialAndEnd<'info> {
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
    )]
    pub contract: Account<'info, Contract>,

    #[account(
        mut,
        seeds = [TRIAL_UNIT_SEED, contract.key().as_ref()],
        bump = trial_work_unit.bump,
        has_one = contract @ StreamPayV2Error::InvalidWorkUnit,
        constraint = trial_work_unit.kind == WorkUnitKind::Trial @ StreamPayV2Error::InvalidWorkUnit,
    )]
    pub trial_work_unit: Account<'info, WorkUnit>,
}

pub fn handle_settle_trial_and_end(ctx: Context<SettleTrialAndEnd>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let contract = &ctx.accounts.contract;
    let trial = &ctx.accounts.trial_work_unit;

    require!(
        contract.status == ContractStatus::PendingEmployerApproval,
        StreamPayV2Error::InvalidState
    );
    require!(contract.has_trial(), StreamPayV2Error::TrialNotConfigured);
    require!(
        trial.status == WorkUnitStatus::Submitted,
        StreamPayV2Error::InvalidTrialState
    );
    require!(
        trial.amount == contract.trial_amount,
        StreamPayV2Error::InvalidTrialAmount
    );

    let contract_key = contract.key();
    let trial_key = trial.key();
    let employer = contract.employer;
    let freelancer = contract.freelancer;
    let trial_amount = trial.amount;
    let start_time_before = contract.start_time;
    let end_time_before = contract.end_time;

    let trial = &mut ctx.accounts.trial_work_unit;
    trial.status = WorkUnitStatus::Released;
    trial.approved_at = now;
    trial.released_at = now;
    trial.release_trigger = ReleaseTrigger::EmployerApproval;

    let contract = &mut ctx.accounts.contract;
    let (freelancer_settlement, employer_refundable) =
        contract.settle_submitted_trial_without_activation(now, trial_amount)?;

    require!(
        contract.status == ContractStatus::Cancelled,
        StreamPayV2Error::InvalidState
    );
    require!(
        contract.start_time == start_time_before && contract.end_time == end_time_before,
        StreamPayV2Error::InvalidState
    );
    require!(
        contract.stream_released_amount == 0,
        StreamPayV2Error::ReleaseAmountExceeded
    );

    emit!(TrialSettledAndEnded {
        contract: contract_key,
        trial_work_unit: trial_key,
        employer,
        freelancer,
        settled_at: now,
        trial_amount,
        freelancer_settlement,
        employer_refundable,
    });

    Ok(())
}
