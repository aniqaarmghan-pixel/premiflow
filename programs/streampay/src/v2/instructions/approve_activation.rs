//! `approve_activation`: the employer starts the main paid contract.
//!
//! Valid only when no paid trial is configured. A trial must be approved
//! through `approve_trial_and_activate` so submitted work cannot be bypassed.
//!
//! No tokens move.

use anchor_lang::prelude::*;

use crate::v2::constants::CONTRACT_SEED;
use crate::v2::enums::{ContractStatus, PaymentMode};
use crate::v2::errors::StreamPayV2Error;
use crate::v2::events::ContractActivated;
use crate::v2::state::Contract;

#[derive(Accounts)]
pub struct ApproveActivation<'info> {
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
}

pub fn handle_approve_activation(ctx: Context<ApproveActivation>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let contract = &ctx.accounts.contract;

    require!(
        contract.status == ContractStatus::PendingEmployerApproval,
        StreamPayV2Error::InvalidState
    );
    require!(
        contract.payment_mode != PaymentMode::Hourly,
        StreamPayV2Error::InvalidPaymentMode
    );
    require!(!contract.has_trial(), StreamPayV2Error::TrialRequired);

    let (start_time, end_time, last_period_end) = contract.resolve_activation_timing(now)?;

    let contract_key = contract.key();
    let employer = contract.employer;
    let freelancer = contract.freelancer;

    let contract = &mut ctx.accounts.contract;
    contract.status = ContractStatus::Active;
    contract.start_time = start_time;
    contract.end_time = end_time;
    contract.last_period_end = last_period_end;

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
