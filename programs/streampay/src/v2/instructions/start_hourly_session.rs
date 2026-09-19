//! `start_hourly_session`: freelancer opens one Hourly labor-clock session.
//!
//! No release. No SPL movement. Activation must already have happened;
//! this instruction is the only way an Hourly timer starts.

use anchor_lang::prelude::*;

use crate::v2::constants::{
    CONTRACT_SEED, HOURLY_SESSION_SEED, HOURLY_STATE_SEED, MAX_HOURLY_SESSIONS,
};
use crate::v2::enums::{ContractStatus, PaymentMode};
use crate::v2::errors::StreamPayV2Error;
use crate::v2::events::HourlySessionStarted;
use crate::v2::state::{Contract, HourlySession, HourlyState};

#[derive(Accounts)]
pub struct StartHourlySession<'info> {
    #[account(mut)]
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

    #[account(
        mut,
        seeds = [HOURLY_STATE_SEED, contract.key().as_ref()],
        bump = hourly_state.bump,
        has_one = contract @ StreamPayV2Error::InvalidHourlyState,
    )]
    pub hourly_state: Account<'info, HourlyState>,

    #[account(
        init,
        payer = freelancer,
        space = 8 + HourlySession::INIT_SPACE,
        seeds = [
            HOURLY_SESSION_SEED,
            contract.key().as_ref(),
            &hourly_state.session_count.to_le_bytes(),
        ],
        bump,
    )]
    pub hourly_session: Account<'info, HourlySession>,

    pub system_program: Program<'info, System>,
}

pub fn handle_start_hourly_session(ctx: Context<StartHourlySession>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let contract = &ctx.accounts.contract;
    let state = &ctx.accounts.hourly_state;

    require!(
        contract.status == ContractStatus::Active,
        StreamPayV2Error::InvalidState
    );
    require!(
        contract.payment_mode == PaymentMode::Hourly,
        StreamPayV2Error::InvalidPaymentMode
    );
    require!(
        !state.has_active_session(),
        StreamPayV2Error::HourlySessionAlreadyActive
    );
    require!(
        state.session_count < MAX_HOURLY_SESSIONS,
        StreamPayV2Error::HourlySessionLimitReached
    );
    require!(
        state.approved_seconds < state.authorized_seconds,
        StreamPayV2Error::HourlyAuthorizedTimeExhausted
    );
    require!(
        contract.start_time > 0 && now >= contract.start_time,
        StreamPayV2Error::ContractNotStarted
    );
    require!(
        now < contract.end_time,
        StreamPayV2Error::HourlyEngagementExpired
    );

    let session_index = state.session_count;
    let contract_key = contract.key();
    let freelancer = contract.freelancer;

    ctx.accounts
        .hourly_session
        .init_open(contract_key, session_index, now, ctx.bumps.hourly_session);

    let state = &mut ctx.accounts.hourly_state;
    state.active_session_index = session_index;
    state.session_count = state
        .session_count
        .checked_add(1)
        .ok_or(StreamPayV2Error::ArithmeticOverflow)?;

    emit!(HourlySessionStarted {
        contract: contract_key,
        session: ctx.accounts.hourly_session.key(),
        freelancer,
        session_index,
        started_at: now,
    });

    Ok(())
}
