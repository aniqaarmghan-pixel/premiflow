//! `expire_activation`: close a lapsed post-acceptance activation window.
//!
//! Permissionless: the outcome is determined by `Clock` vs
//! `accepted_at + activation_review_duration` and by unstarted accounting,
//! not by who pays the fee. Applies only while `PendingEmployerApproval` and
//! the main engagement has never started. Submitted or Revising trials are
//! excluded so T1 / reject / dispute remain the quality decision.
//! No SPL transfer. No dispute. Employer Claim refund is later.

use anchor_lang::prelude::*;

use crate::v2::constants::{CONTRACT_SEED, TRIAL_UNIT_SEED};
use crate::v2::enums::{ContractStatus, ReleaseTrigger, WorkUnitKind, WorkUnitStatus};
use crate::v2::errors::StreamPayV2Error;
use crate::v2::events::ActivationWindowExpired;
use crate::v2::state::{Contract, WorkUnit};

#[derive(Accounts)]
pub struct ExpireActivation<'info> {
    /// Permissionless: the result is determined by clock and contract state.
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

    /// Required when a trial is configured; omitted otherwise.
    #[account(
        seeds = [TRIAL_UNIT_SEED, contract.key().as_ref()],
        bump = trial_work_unit.bump,
        has_one = contract @ StreamPayV2Error::InvalidWorkUnit,
        constraint = trial_work_unit.kind == WorkUnitKind::Trial @ StreamPayV2Error::InvalidWorkUnit,
    )]
    pub trial_work_unit: Option<Account<'info, WorkUnit>>,
}

pub fn handle_expire_activation(ctx: Context<ExpireActivation>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let contract = &ctx.accounts.contract;

    require!(
        contract.status == ContractStatus::PendingEmployerApproval,
        StreamPayV2Error::InvalidState
    );
    require!(
        now >= contract.activation_deadline()?,
        StreamPayV2Error::ApprovalWindowNotExpired
    );

    let has_trial = contract.has_trial();
    if has_trial {
        let trial = ctx
            .accounts
            .trial_work_unit
            .as_ref()
            .ok_or(StreamPayV2Error::TrialRequired)?;
        require!(
            trial.status == WorkUnitStatus::Defined,
            StreamPayV2Error::InvalidTrialState
        );
        require!(
            trial.release_trigger == ReleaseTrigger::NotReleased,
            StreamPayV2Error::InvalidTrialState
        );
    } else {
        require!(
            ctx.accounts.trial_work_unit.is_none(),
            StreamPayV2Error::InvalidTrialAmount
        );
    }

    let contract_key = contract.key();
    let employer = contract.employer;
    let freelancer = contract.freelancer;
    let start_time_before = contract.start_time;
    let end_time_before = contract.end_time;

    let contract = &mut ctx.accounts.contract;
    let (freelancer_settlement, employer_refundable) =
        contract.settle_unsubmitted_activation_rejection(now)?;

    require!(
        contract.status == ContractStatus::ActivationRejected,
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
        freelancer_settlement == 0 && employer_refundable == contract.total_amount,
        StreamPayV2Error::ReleaseAmountExceeded
    );

    emit!(ActivationWindowExpired {
        contract: contract_key,
        employer,
        freelancer,
        expired_at: now,
        employer_refundable,
    });

    Ok(())
}
