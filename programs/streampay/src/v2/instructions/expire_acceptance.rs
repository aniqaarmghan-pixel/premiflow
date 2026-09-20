//! `expire_acceptance`: close a lapsed funded offer before work starts.
//!
//! Permissionless: the outcome is determined by `Clock` vs
//! `acceptance_deadline` and by unstarted accounting, not by who pays the fee.
//! Applies to `PendingAcceptance` and to funded Milestone `Draft` after the
//! deadline. No SPL transfer. No dispute. Employer Claim refund is later.

use anchor_lang::prelude::*;

use crate::v2::constants::CONTRACT_SEED;
use crate::v2::enums::ContractStatus;
use crate::v2::errors::StreamPayV2Error;
use crate::v2::events::ContractExpired;
use crate::v2::state::Contract;

#[derive(Accounts)]
pub struct ExpireAcceptance<'info> {
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
}

pub fn handle_expire_acceptance(ctx: Context<ExpireAcceptance>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let contract = &ctx.accounts.contract;

    require!(
        now >= contract.acceptance_deadline,
        StreamPayV2Error::AcceptanceNotExpired
    );

    let contract_key = contract.key();
    let employer = contract.employer;
    let freelancer = contract.freelancer;
    let start_time_before = contract.start_time;
    let end_time_before = contract.end_time;

    let contract = &mut ctx.accounts.contract;
    let (freelancer_settlement, employer_refundable) =
        contract.settle_unaccepted_offer(now, ContractStatus::Expired)?;

    require!(
        contract.status == ContractStatus::Expired,
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
        freelancer_settlement == 0 && employer_refundable == contract.total_amount,
        StreamPayV2Error::ReleaseAmountExceeded
    );

    emit!(ContractExpired {
        contract: contract_key,
        employer,
        freelancer,
        expired_at: now,
        employer_refundable,
    });

    Ok(())
}
