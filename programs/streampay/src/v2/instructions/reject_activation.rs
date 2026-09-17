//! `reject_activation`: the employer declines to start the main contract.
//!
//! Valid only from `PendingEmployerApproval`. The contract becomes
//! `ActivationRejected` and records `terminated_at`. Escrow is untouched:
//! trial compensation and refunds are a later settlement phase, so this
//! instruction cannot be used as a free-work harvest followed by an instant
//! full refund.
//!
//! Distinct from `decline_contract`, which is the freelancer refusing the offer
//! before any trial work.

use anchor_lang::prelude::*;

use crate::v2::constants::CONTRACT_SEED;
use crate::v2::enums::ContractStatus;
use crate::v2::errors::StreamPayV2Error;
use crate::v2::events::ActivationRejected;
use crate::v2::state::Contract;

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

    let contract = &mut ctx.accounts.contract;
    contract.status = ContractStatus::ActivationRejected;
    contract.terminated_at = now;

    emit!(ActivationRejected {
        contract: contract_key,
        employer,
        freelancer,
        rejected_at: now,
    });

    Ok(())
}
