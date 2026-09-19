//! `stop_hourly_session`: freelancer closes the open Hourly session.
//!
//! Uses Solana Clock. Credits through the shared cumulative formula.
//! Short sessions Void instead of trapping the contract. Forgotten timers
//! close successfully, capped at 8 hours. No SPL movement.

use anchor_lang::prelude::*;

use crate::v2::constants::{CONTRACT_SEED, HOURLY_SESSION_SEED, HOURLY_STATE_SEED, MAX_URI_LEN};
use crate::v2::enums::{ContractStatus, PaymentMode};
use crate::v2::errors::StreamPayV2Error;
use crate::v2::events::HourlySessionRecorded;
use crate::v2::hourly::apply_hourly_session_close;
use crate::v2::state::{Contract, HourlySession, HourlyState};

#[derive(Accounts)]
pub struct StopHourlySession<'info> {
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
        mut,
        seeds = [
            HOURLY_SESSION_SEED,
            contract.key().as_ref(),
            &hourly_state.active_session_index.to_le_bytes(),
        ],
        bump = hourly_session.bump,
        has_one = contract @ StreamPayV2Error::InvalidHourlySession,
    )]
    pub hourly_session: Account<'info, HourlySession>,
}

pub fn handle_stop_hourly_session(
    ctx: Context<StopHourlySession>,
    work_log_uri: String,
    work_log_hash: [u8; 32],
) -> Result<()> {
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
        ctx.accounts.hourly_state.has_active_session(),
        StreamPayV2Error::NoActiveHourlySession
    );
    require!(
        !work_log_uri.is_empty() && work_log_uri.len() <= MAX_URI_LEN,
        StreamPayV2Error::InvalidMetadata
    );

    let freelancer = contract.freelancer;
    let contract_key = contract.key();
    let session_key = ctx.accounts.hourly_session.key();
    let session_index = ctx.accounts.hourly_session.index;

    let credit = apply_hourly_session_close(
        &mut ctx.accounts.contract,
        &mut ctx.accounts.hourly_state,
        &mut ctx.accounts.hourly_session,
        now,
        work_log_uri,
        work_log_hash,
    )?;

    emit!(HourlySessionRecorded {
        contract: contract_key,
        session: session_key,
        freelancer,
        session_index,
        stopped_at: now,
        credited_duration: credit.credited_duration,
        approved_seconds: ctx.accounts.hourly_state.approved_seconds,
        release_delta: credit.release_delta,
        released_amount: ctx.accounts.contract.released_amount,
        status: credit.status,
        materialized_by_dispute: false,
    });

    Ok(())
}
