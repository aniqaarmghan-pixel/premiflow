//! `cancel_active_contract`: freeze the economic split of an Active contract.
//!
//! Employer only. No SPL tokens move. Open reviews cannot be bypassed.
//! Streaming cancellation reuses Phase 6 canonical accrual so unreleased
//! earned time is materialized even if `release_stream_accrual` was never
//! called.

use anchor_lang::prelude::*;

use crate::v2::constants::CONTRACT_SEED;
use crate::v2::enums::{ContractStatus, PaymentMode};
use crate::v2::errors::StreamPayV2Error;
use crate::v2::events::ContractCancellationSettled;
use crate::v2::hourly::require_hourly_state_account;
use crate::v2::state::{Contract, HourlyState};

#[derive(Accounts)]
pub struct CancelActiveContract<'info> {
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

    /// Required for Hourly so an Open session cannot be cancelled away.
    /// Must be absent for Fixed / Milestone / Streaming.
    #[account(mut)]
    pub hourly_state: Option<Account<'info, HourlyState>>,
}

pub fn handle_cancel_active_contract(ctx: Context<CancelActiveContract>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let contract = &ctx.accounts.contract;

    require!(
        !contract.status.is_terminal(),
        StreamPayV2Error::ContractTerminal
    );
    require!(
        contract.status == ContractStatus::Active,
        StreamPayV2Error::InvalidState
    );
    require!(
        contract.open_review_count == 0,
        StreamPayV2Error::OpenReviewBlocksCancel
    );

    if contract.payment_mode == PaymentMode::Hourly {
        let state = ctx
            .accounts
            .hourly_state
            .as_ref()
            .ok_or(StreamPayV2Error::HourlyStateMissing)?;
        require_hourly_state_account(
            &contract.key(),
            state,
            &state.key(),
            ctx.program_id,
        )?;
        require!(
            !state.has_active_session(),
            StreamPayV2Error::HourlyOpenSessionBlocksClose
        );
    } else {
        require!(
            ctx.accounts.hourly_state.is_none(),
            StreamPayV2Error::InvalidPaymentMode
        );
    }

    let contract_key = contract.key();
    let employer = contract.employer;
    let freelancer = contract.freelancer;
    let payment_mode = contract.payment_mode;

    let contract = &mut ctx.accounts.contract;
    let (freelancer_entitlement, employer_refundable) = contract.settle_active_cancellation(now)?;

    emit!(ContractCancellationSettled {
        contract: contract_key,
        employer,
        freelancer,
        payment_mode,
        settled_at: now,
        freelancer_entitlement,
        employer_refundable,
        released_amount: contract.released_amount,
        stream_released_amount: contract.stream_released_amount,
    });

    Ok(())
}
