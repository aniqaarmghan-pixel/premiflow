//! `accept_contract`: the freelancer agrees to a funded, complete offer.
//!
//! This is consent, not activation. The contract moves to
//! `PendingEmployerApproval` and records `accepted_at`. The main earning clock
//! stays stopped until the employer later calls `approve_activation`.
//!
//! No tokens move.

use anchor_lang::prelude::*;

use crate::v2::constants::CONTRACT_SEED;
use crate::v2::enums::ContractStatus;
use crate::v2::errors::StreamPayV2Error;
use crate::v2::events::ContractAccepted;
use crate::v2::state::Contract;

#[derive(Accounts)]
pub struct AcceptContract<'info> {
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

pub fn handle_accept_contract(ctx: Context<AcceptContract>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let contract = &ctx.accounts.contract;

    require!(
        contract.status == ContractStatus::PendingAcceptance,
        StreamPayV2Error::InvalidState
    );
    require!(
        now < contract.acceptance_deadline,
        StreamPayV2Error::AcceptanceExpired
    );

    let activation_deadline = now
        .checked_add(contract.activation_review_duration)
        .ok_or(StreamPayV2Error::ArithmeticOverflow)?;

    let contract_key = contract.key();
    let employer = contract.employer;
    let freelancer = contract.freelancer;

    let contract = &mut ctx.accounts.contract;
    contract.accepted_at = now;
    contract.status = ContractStatus::PendingEmployerApproval;

    emit!(ContractAccepted {
        contract: contract_key,
        employer,
        freelancer,
        accepted_at: now,
        activation_deadline,
    });

    Ok(())
}
