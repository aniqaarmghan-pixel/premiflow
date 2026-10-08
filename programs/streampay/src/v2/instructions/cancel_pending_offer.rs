//! `cancel_pending_offer`: employer withdraws a funded offer before acceptance.
//!
//! PendingAcceptance only. Freelancer has not accepted. No active work, trial,
//! or release. Settlement freezes a full employer refund entitlement (principal
//! + later claim of unearned fee reserve via `claim_employer_refund`). Escrow
//! stays funded until Claim refund. No tokens move here. Not a dispute. Terms
//! of this contract are never mutated ? issue a replacement offer with a new
//! contract id instead.

use anchor_lang::prelude::*;

use crate::v2::constants::CONTRACT_SEED;
use crate::v2::enums::ContractStatus;
use crate::v2::errors::StreamPayV2Error;
use crate::v2::events::PendingOfferCancelled;
use crate::v2::state::Contract;

#[derive(Accounts)]
pub struct CancelPendingOffer<'info> {
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

pub fn handle_cancel_pending_offer(ctx: Context<CancelPendingOffer>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let contract = &ctx.accounts.contract;

    require!(
        contract.status == ContractStatus::PendingAcceptance,
        StreamPayV2Error::InvalidState
    );

    let contract_key = contract.key();
    let employer = contract.employer;
    let freelancer = contract.freelancer;
    let start_time_before = contract.start_time;
    let end_time_before = contract.end_time;
    let total_amount = contract.total_amount;

    let contract = &mut ctx.accounts.contract;
    let (freelancer_settlement, employer_refundable) =
        contract.settle_unaccepted_offer(now, ContractStatus::Cancelled)?;

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
        freelancer_settlement == 0 && employer_refundable == total_amount,
        StreamPayV2Error::ReleaseAmountExceeded
    );

    emit!(PendingOfferCancelled {
        contract: contract_key,
        employer,
        freelancer,
        cancelled_at: now,
        employer_refundable,
    });

    Ok(())
}
