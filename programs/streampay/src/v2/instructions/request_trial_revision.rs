//! `request_trial_revision`: the employer asks for a bounded trial resubmission.
//!
//! Does not transfer tokens and does not activate the main contract.

use anchor_lang::prelude::*;

use crate::v2::constants::{CONTRACT_SEED, TRIAL_UNIT_SEED};
use crate::v2::enums::{ContractStatus, WorkUnitKind, WorkUnitStatus};
use crate::v2::errors::StreamPayV2Error;
use crate::v2::events::TrialRevisionRequested;
use crate::v2::state::{Contract, WorkUnit};

#[derive(Accounts)]
pub struct RequestTrialRevision<'info> {
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

pub fn handle_request_trial_revision(ctx: Context<RequestTrialRevision>) -> Result<()> {
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
        now < trial.action_deadline,
        StreamPayV2Error::ReviewWindowClosed
    );
    require!(
        trial.revision_count < contract.max_revisions,
        StreamPayV2Error::RevisionLimitReached
    );

    let revision_count = trial
        .revision_count
        .checked_add(1)
        .ok_or(StreamPayV2Error::ArithmeticOverflow)?;
    let action_deadline = now
        .checked_add(contract.review_duration)
        .ok_or(StreamPayV2Error::ArithmeticOverflow)?;

    let contract_key = contract.key();
    let trial_key = trial.key();
    let employer = contract.employer;

    let trial = &mut ctx.accounts.trial_work_unit;
    trial.revision_count = revision_count;
    trial.status = WorkUnitStatus::Revising;
    trial.action_deadline = action_deadline;

    emit!(TrialRevisionRequested {
        contract: contract_key,
        trial_work_unit: trial_key,
        employer,
        revision_count,
        action_deadline,
    });

    Ok(())
}
