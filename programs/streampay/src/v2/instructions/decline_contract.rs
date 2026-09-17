//! `decline_contract`: the freelancer refuses a funded offer.
//!
//! The contract becomes `Declined` and records `terminated_at`. Escrow stays
//! funded; a later reclaim instruction returns it. No tokens move here.

use anchor_lang::prelude::*;

use crate::v2::constants::CONTRACT_SEED;
use crate::v2::enums::ContractStatus;
use crate::v2::errors::StreamPayV2Error;
use crate::v2::events::ContractDeclined;
use crate::v2::state::Contract;

#[derive(Accounts)]
pub struct DeclineContract<'info> {
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
}

pub fn handle_decline_contract(ctx: Context<DeclineContract>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let contract = &ctx.accounts.contract;

    require!(
        contract.status == ContractStatus::PendingAcceptance,
        StreamPayV2Error::InvalidState
    );

    let contract_key = contract.key();
    let employer = contract.employer;
    let freelancer = contract.freelancer;

    let contract = &mut ctx.accounts.contract;
    contract.status = ContractStatus::Declined;
    contract.terminated_at = now;

    emit!(ContractDeclined {
        contract: contract_key,
        employer,
        freelancer,
        declined_at: now,
    });

    Ok(())
}
