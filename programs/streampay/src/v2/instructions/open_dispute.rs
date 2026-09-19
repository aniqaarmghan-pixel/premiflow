//! `open_dispute`: freeze contested escrow. No SPL transfer.
//!
//! Either contract party may open. Streaming accrual is materialized at Clock
//! using the Phase 6 formula, then frozen. Open reviews are allowed — that is
//! often why a dispute exists. Clean-settled contracts cannot reopen economics.
//!
//! Hourly + Open session: the running session is materialized at Clock using
//! the same caps and cumulative earnings as Stop. This prevents an employer
//! race that would erase legitimately elapsed work by disputing before Stop.
//! Already accrued Hourly work is then protected; only the unused remainder
//! is contested.

use anchor_lang::prelude::*;

use crate::v2::constants::CONTRACT_SEED;
use crate::v2::enums::{DisputeParty, PaymentMode};
use crate::v2::errors::StreamPayV2Error;
use crate::v2::events::{DisputeOpened, HourlySessionRecorded};
use crate::v2::hourly::{
    apply_hourly_session_close, require_hourly_session_account, require_hourly_state_account,
};
use crate::v2::state::{Contract, HourlySession, HourlyState};

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

    /// Required when `payment_mode == Hourly`. Absent otherwise.
    #[account(mut)]
    pub hourly_state: Option<Account<'info, HourlyState>>,

    /// Required when Hourly and an Open session exists. Absent otherwise.
    #[account(mut)]
    pub hourly_session: Option<Account<'info, HourlySession>>,
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
    let program_id = ctx.program_id;
    let payment_mode = contract.payment_mode;

    if payment_mode == PaymentMode::Hourly {
        let (has_active, active_index) = {
            let state = ctx
                .accounts
                .hourly_state
                .as_ref()
                .ok_or(StreamPayV2Error::HourlyStateMissing)?;
            require_hourly_state_account(&contract_key, state, &state.key(), program_id)?;
            (state.has_active_session(), state.active_session_index)
        };

        if has_active {
            let (session_key, session_index) = {
                let session = ctx
                    .accounts
                    .hourly_session
                    .as_ref()
                    .ok_or(StreamPayV2Error::InvalidHourlySession)?;
                require_hourly_session_account(
                    &contract_key,
                    session,
                    &session.key(),
                    active_index,
                    program_id,
                )?;
                (session.key(), session.index)
            };

            let credit = apply_hourly_session_close(
                &mut ctx.accounts.contract,
                ctx.accounts
                    .hourly_state
                    .as_mut()
                    .ok_or(StreamPayV2Error::HourlyStateMissing)?,
                ctx.accounts
                    .hourly_session
                    .as_mut()
                    .ok_or(StreamPayV2Error::InvalidHourlySession)?,
                now,
                String::new(),
                [0u8; 32],
            )?;

            emit!(HourlySessionRecorded {
                contract: contract_key,
                session: session_key,
                freelancer,
                session_index,
                stopped_at: now,
                credited_duration: credit.credited_duration,
                approved_seconds: ctx
                    .accounts
                    .hourly_state
                    .as_ref()
                    .ok_or(StreamPayV2Error::HourlyStateMissing)?
                    .approved_seconds,
                release_delta: credit.release_delta,
                released_amount: ctx.accounts.contract.released_amount,
                status: credit.status,
                materialized_by_dispute: true,
            });
        } else {
            require!(
                ctx.accounts.hourly_session.is_none(),
                StreamPayV2Error::InvalidHourlySession
            );
        }
    } else {
        require!(
            ctx.accounts.hourly_state.is_none(),
            StreamPayV2Error::InvalidPaymentMode
        );
        require!(
            ctx.accounts.hourly_session.is_none(),
            StreamPayV2Error::InvalidPaymentMode
        );
    }

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
