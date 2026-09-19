//! `end_hourly_contract`: employer unused-budget settlement for Hourly.
//!
//! Does not route through `complete_contract` (that path pays 100% to the
//! freelancer). Uses the existing Cancelled settlement so
//! `withdraw_freelancer` / `claim_employer_refund` remain the SPL movers.
//!
//! Rejects while an Hourly session is Open — do not materialize through
//! employer end. The freelancer can Stop, or either party can dispute.
//!
//! Hourly "End" is a normal unused-budget close, not a punitive cancellation.

use anchor_lang::prelude::*;

use crate::v2::constants::{CONTRACT_SEED, HOURLY_STATE_SEED};
use crate::v2::enums::{ContractStatus, PaymentMode};
use crate::v2::errors::StreamPayV2Error;
use crate::v2::events::HourlyContractEnded;
use crate::v2::state::{Contract, HourlyState};

#[derive(Accounts)]
pub struct EndHourlyContract<'info> {
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

    #[account(
        seeds = [HOURLY_STATE_SEED, contract.key().as_ref()],
        bump = hourly_state.bump,
        has_one = contract @ StreamPayV2Error::InvalidHourlyState,
    )]
    pub hourly_state: Account<'info, HourlyState>,
}

pub fn handle_end_hourly_contract(ctx: Context<EndHourlyContract>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let contract = &ctx.accounts.contract;

    require!(
        contract.status == ContractStatus::Active,
        StreamPayV2Error::InvalidState
    );
    require!(
        contract.payment_mode == PaymentMode::Hourly,
        StreamPayV2Error::InvalidPaymentMode
    );
    require!(
        !ctx.accounts.hourly_state.has_active_session(),
        StreamPayV2Error::HourlyOpenSessionBlocksClose
    );
    require!(
        contract.open_review_count == 0,
        StreamPayV2Error::OpenReviewBlocksCancel
    );

    let contract_key = contract.key();
    let employer = contract.employer;
    let freelancer = contract.freelancer;

    let contract = &mut ctx.accounts.contract;
    let (freelancer_settlement, employer_refundable) = contract.settle_active_cancellation(now)?;

    emit!(HourlyContractEnded {
        contract: contract_key,
        employer,
        freelancer,
        ended_at: now,
        freelancer_settlement_amount: freelancer_settlement,
        employer_refundable_amount: employer_refundable,
        released_amount: contract.released_amount,
    });

    Ok(())
}
