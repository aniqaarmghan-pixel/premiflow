//! `submit_trial_work`: the freelancer delivers the paid pre-activation trial.
//!
//! Does not release money and does not activate the main contract.

use anchor_lang::prelude::*;

use crate::v2::constants::{CONTRACT_SEED, MAX_URI_LEN, TRIAL_UNIT_SEED};
use crate::v2::enums::{ContractStatus, WorkUnitKind, WorkUnitStatus};
use crate::v2::errors::StreamPayV2Error;
use crate::v2::events::TrialSubmitted;
use crate::v2::state::{Contract, WorkUnit};

#[derive(Accounts)]
pub struct SubmitTrialWork<'info> {
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

pub fn handle_submit_trial_work(
    ctx: Context<SubmitTrialWork>,
    submission_uri: String,
    submission_hash: [u8; 32],
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let contract = &ctx.accounts.contract;
    let trial = &ctx.accounts.trial_work_unit;

    require!(
        contract.status == ContractStatus::PendingEmployerApproval,
        StreamPayV2Error::InvalidState
    );
    require!(contract.has_trial(), StreamPayV2Error::TrialNotConfigured);
    require!(
        trial.amount == contract.trial_amount,
        StreamPayV2Error::InvalidTrialAmount
    );
    require!(
        trial.status.accepts_submission(),
        StreamPayV2Error::InvalidTrialState
    );
    require!(
        now < contract.activation_deadline()?,
        StreamPayV2Error::ApprovalWindowExpired
    );
    require!(
        !submission_uri.is_empty() && submission_uri.len() <= MAX_URI_LEN,
        StreamPayV2Error::InvalidMetadata
    );

    let action_deadline = now
        .checked_add(contract.review_duration)
        .ok_or(StreamPayV2Error::ArithmeticOverflow)?;

    let was_defined = trial.status == WorkUnitStatus::Defined;
    let revision_count = trial.revision_count;
    let contract_key = contract.key();
    let trial_key = trial.key();
    let freelancer = contract.freelancer;

    let trial = &mut ctx.accounts.trial_work_unit;
    trial.status = WorkUnitStatus::Submitted;
    trial.submission_uri = submission_uri;
    trial.submission_hash = submission_hash;
    trial.submitted_at = now;
    trial.action_deadline = action_deadline;

    if was_defined {
        let contract = &mut ctx.accounts.contract;
        contract.open_review_count = contract
            .open_review_count
            .checked_add(1)
            .ok_or(StreamPayV2Error::ArithmeticOverflow)?;
    }

    emit!(TrialSubmitted {
        contract: contract_key,
        trial_work_unit: trial_key,
        freelancer,
        submitted_at: now,
        action_deadline,
        revision_count,
    });

    Ok(())
}
