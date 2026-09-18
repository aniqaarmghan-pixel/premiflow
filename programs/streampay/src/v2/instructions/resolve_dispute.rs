//! `resolve_dispute`: allocate the contested remainder. No SPL transfer.
//!
//! Only the per-contract resolver may sign. The award is a split of
//! `contested_amount`, not a rewrite of already-released or withdrawn value.
//! Phase 8 claims the resulting settlement.

use anchor_lang::prelude::*;

use crate::v2::constants::CONTRACT_SEED;
use crate::v2::errors::StreamPayV2Error;
use crate::v2::events::DisputeResolved;
use crate::v2::state::Contract;

#[derive(Accounts)]
pub struct ResolveDispute<'info> {
    pub resolver: Signer<'info>,

    #[account(
        mut,
        has_one = resolver @ StreamPayV2Error::Unauthorized,
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

pub fn handle_resolve_dispute(
    ctx: Context<ResolveDispute>,
    freelancer_contested_award: u64,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let contract = &ctx.accounts.contract;

    let contract_key = contract.key();
    let employer = contract.employer;
    let freelancer = contract.freelancer;
    let resolver = contract.resolver;
    let contested_amount = contract.contested_amount;

    let contract = &mut ctx.accounts.contract;
    let (freelancer_award, employer_award, freelancer_final, employer_final) =
        contract.apply_dispute_resolution(now, freelancer_contested_award)?;

    emit!(DisputeResolved {
        contract: contract_key,
        employer,
        freelancer,
        resolver,
        resolved_at: now,
        contested_amount,
        freelancer_contested_award: freelancer_award,
        employer_contested_award: employer_award,
        final_freelancer_entitlement: freelancer_final,
        final_employer_entitlement: employer_final,
    });

    Ok(())
}
