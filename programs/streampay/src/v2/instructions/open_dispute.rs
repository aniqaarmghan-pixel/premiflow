//! `open_dispute`: freeze contested escrow. No SPL transfer.
//!
//! Either contract party may open. Streaming accrual is materialized at Clock
//! using the Phase 6 formula, then frozen. Open reviews are allowed — that is
//! often why a dispute exists. Clean-settled contracts cannot reopen economics.

use anchor_lang::prelude::*;

use crate::v2::constants::CONTRACT_SEED;
use crate::v2::enums::DisputeParty;
use crate::v2::errors::StreamPayV2Error;
use crate::v2::events::DisputeOpened;
use crate::v2::state::Contract;

#[derive(Accounts)]
pub struct OpenDispute<'info> {
    /// Employer or freelancer. Identity is checked against stored keys.
    pub party: Signer<'info>,

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
}

pub fn handle_open_dispute(ctx: Context<OpenDispute>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let party = ctx.accounts.party.key();
    let contract = &ctx.accounts.contract;

    let initiator = if party == contract.employer {
        DisputeParty::Employer
    } else if party == contract.freelancer {
        DisputeParty::Freelancer
    } else {
        return Err(StreamPayV2Error::Unauthorized.into());
    };

    let contract_key = contract.key();
    let employer = contract.employer;
    let freelancer = contract.freelancer;
    let resolver = contract.resolver;

    let contract = &mut ctx.accounts.contract;
    let (_protected_f, _protected_e, contested) = contract.freeze_for_dispute(now, initiator)?;

    emit!(DisputeOpened {
        contract: contract_key,
        employer,
        freelancer,
        initiator,
        resolver,
        disputed_at: now,
        contested_amount: contested,
        released_amount: contract.released_amount,
        stream_released_amount: contract.stream_released_amount,
    });

    Ok(())
}
