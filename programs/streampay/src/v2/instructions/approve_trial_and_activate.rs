//! `approve_trial_and_activate`: one employer action that pays the trial
//! (as released, not withdrawn) and starts the main contract.
//!
//! No SPL transfer. Escrow is unchanged until a later withdraw.

use anchor_lang::prelude::*;

use crate::v2::constants::{CONTRACT_SEED, TRIAL_UNIT_SEED};
use crate::v2::enums::{ContractStatus, ReleaseTrigger, WorkUnitKind, WorkUnitStatus};
use crate::v2::errors::StreamPayV2Error;
use crate::v2::events::{ContractActivated, TrialApproved};
use crate::v2::state::{Contract, WorkUnit};

#[derive(Accounts)]
pub struct ApproveTrialAndActivate<'info> {
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

pub fn handle_approve_trial_and_activate(ctx: Context<ApproveTrialAndActivate>) -> Result<()> {
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

    let (start_time, end_time, last_period_end) = contract.resolve_activation_timing(now)?;

    let released_amount = contract
        .released_amount
        .checked_add(trial.amount)
        .ok_or(StreamPayV2Error::ArithmeticOverflow)?;
    require!(
        released_amount <= contract.total_amount,
        StreamPayV2Error::ArithmeticOverflow
    );
    let released_unit_count = contract
        .released_unit_count
        .checked_add(1)
        .ok_or(StreamPayV2Error::ArithmeticOverflow)?;
    let open_review_count = contract
        .open_review_count
        .checked_sub(1)
        .ok_or(StreamPayV2Error::ArithmeticOverflow)?;

    let contract_key = contract.key();
    let trial_key = trial.key();
    let employer = contract.employer;
    let freelancer = contract.freelancer;
    let trial_amount = trial.amount;

    let trial = &mut ctx.accounts.trial_work_unit;
    trial.status = WorkUnitStatus::Released;
    trial.approved_at = now;
    trial.released_at = now;
    trial.release_trigger = ReleaseTrigger::EmployerApproval;

    let contract = &mut ctx.accounts.contract;
    contract.released_amount = released_amount;
    contract.released_unit_count = released_unit_count;
    contract.open_review_count = open_review_count;
    contract.status = ContractStatus::Active;
    contract.start_time = start_time;
    contract.end_time = end_time;
    contract.last_period_end = last_period_end;

    emit!(TrialApproved {
        contract: contract_key,
        trial_work_unit: trial_key,
        employer,
        amount: trial_amount,
        approved_at: now,
    });
    emit!(ContractActivated {
        contract: contract_key,
        employer,
        freelancer,
        activated_at: now,
        start_time,
        end_time,
    });

    Ok(())
}
