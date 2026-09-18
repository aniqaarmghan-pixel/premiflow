//! `reject_activation`: the employer declines to start the main contract.
//!
//! If a paid trial was submitted, the contract becomes `Disputed` rather than
//! `ActivationRejected`, so later settlement can see that real work exists.
//! No tokens move.

use anchor_lang::prelude::*;

use crate::v2::constants::{CONTRACT_SEED, TRIAL_UNIT_SEED};
use crate::v2::enums::{ContractStatus, WorkUnitKind, WorkUnitStatus};
use crate::v2::errors::StreamPayV2Error;
use crate::v2::events::{ActivationRejected, TrialRejected};
use crate::v2::state::{Contract, WorkUnit};

#[derive(Accounts)]
pub struct RejectActivation<'info> {
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

    /// Required when a trial is configured; omitted otherwise.
    #[account(
        seeds = [TRIAL_UNIT_SEED, contract.key().as_ref()],
        bump = trial_work_unit.bump,
        has_one = contract @ StreamPayV2Error::InvalidWorkUnit,
        constraint = trial_work_unit.kind == WorkUnitKind::Trial @ StreamPayV2Error::InvalidWorkUnit,
    )]
    pub trial_work_unit: Option<Account<'info, WorkUnit>>,
}

pub fn handle_reject_activation(ctx: Context<RejectActivation>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let contract = &ctx.accounts.contract;

    require!(
        contract.status == ContractStatus::PendingEmployerApproval,
        StreamPayV2Error::InvalidState
    );

    let contract_key = contract.key();
    let employer = contract.employer;
    let freelancer = contract.freelancer;
    let has_trial = contract.has_trial();

    let new_status = if has_trial {
        let trial = ctx
            .accounts
            .trial_work_unit
            .as_ref()
            .ok_or(StreamPayV2Error::TrialRequired)?;
        match trial.status {
            WorkUnitStatus::Defined => ContractStatus::ActivationRejected,
            WorkUnitStatus::Submitted | WorkUnitStatus::Revising => ContractStatus::Disputed,
            WorkUnitStatus::Released | WorkUnitStatus::Void => {
                return Err(StreamPayV2Error::InvalidTrialState.into());
            }
        }
    } else {
        require!(
            ctx.accounts.trial_work_unit.is_none(),
            StreamPayV2Error::InvalidTrialAmount
        );
        ContractStatus::ActivationRejected
    };

    let contract = &mut ctx.accounts.contract;
    contract.status = new_status;
    contract.terminated_at = now;

    if new_status == ContractStatus::Disputed {
        let trial_key = ctx.accounts.trial_work_unit.as_ref().unwrap().key();
        emit!(TrialRejected {
            contract: contract_key,
            trial_work_unit: trial_key,
            employer,
            freelancer,
            rejected_at: now,
        });
    } else {
        emit!(ActivationRejected {
            contract: contract_key,
            employer,
            freelancer,
            rejected_at: now,
        });
    }

    Ok(())
}
