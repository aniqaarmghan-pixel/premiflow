//! `finalize_trial_review_timeout`: permissionless T1-shaped close of a
//! Submitted paid trial whose review window has elapsed.
//!
//! Anyone may pay the fee. Outcome is determined by `Clock` vs
//! `trial.action_deadline` and by unstarted Submitted-trial accounting, not by
//! who signs. Revising is rejected: that state still has an employer quality
//! decision (resubmit while the activation window is open, or dispute).
//! Defined trials use `expire_activation`. Does not reuse
//! `finalize_review_timeout` against the trial PDA.
//! No SPL transfer. No dispute. No activation. Collect / Claim are later.

use anchor_lang::prelude::*;

use crate::v2::constants::{CONTRACT_SEED, TRIAL_UNIT_SEED};
use crate::v2::enums::{ContractStatus, ReleaseTrigger, WorkUnitKind, WorkUnitStatus};
use crate::v2::errors::StreamPayV2Error;
use crate::v2::events::TrialReviewTimedOut;
use crate::v2::state::{Contract, WorkUnit};

#[derive(Accounts)]
pub struct FinalizeTrialReviewTimeout<'info> {
    /// Permissionless: the result is determined by clock and trial state.
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

pub fn handle_finalize_trial_review_timeout(
    ctx: Context<FinalizeTrialReviewTimeout>,
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
        trial.status == WorkUnitStatus::Submitted,
        StreamPayV2Error::InvalidTrialState
    );
    require!(
        trial.amount == contract.trial_amount,
        StreamPayV2Error::InvalidTrialAmount
    );
    require!(
        now >= trial.action_deadline,
        StreamPayV2Error::ReviewWindowOpen
    );

    let contract_key = contract.key();
    let trial_key = trial.key();
    let employer = contract.employer;
    let freelancer = contract.freelancer;
    let trial_amount = trial.amount;
    let start_time_before = contract.start_time;
    let end_time_before = contract.end_time;

    let trial = &mut ctx.accounts.trial_work_unit;
    trial.mark_released(now, ReleaseTrigger::ReviewTimeout);

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
        contract.start_time == 0 && contract.end_time == 0,
        StreamPayV2Error::InvalidState
    );
    require!(
        contract.stream_released_amount == 0,
        StreamPayV2Error::ReleaseAmountExceeded
    );
    require!(
        freelancer_settlement == trial_amount && employer_refundable == contract.main_amount,
        StreamPayV2Error::ReleaseAmountExceeded
    );

    emit!(TrialReviewTimedOut {
        contract: contract_key,
        trial_work_unit: trial_key,
        employer,
        freelancer,
        timed_out_at: now,
        trial_amount,
        freelancer_settlement,
        employer_refundable,
    });

    Ok(())
}
