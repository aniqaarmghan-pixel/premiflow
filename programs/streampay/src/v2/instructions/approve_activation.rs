//! `approve_activation`: the employer starts the main paid contract.
//!
//! This is the only instruction that establishes `start_time` / `end_time`.
//! Freelancer acceptance is a prior, separate event; it does not start earning.
//!
//! OnActivation: start is the approval timestamp.
//! Scheduled: start stays `scheduled_start_time`. Approval after that instant
//! is rejected so this instruction cannot create retroactive earnings.
//!
//! No tokens move.

use anchor_lang::prelude::*;

use crate::v2::constants::CONTRACT_SEED;
use crate::v2::enums::{ContractStatus, StartMode};
use crate::v2::errors::StreamPayV2Error;
use crate::v2::events::ContractActivated;
use crate::v2::state::Contract;

#[derive(Accounts)]
pub struct ApproveActivation<'info> {
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

pub fn handle_approve_activation(ctx: Context<ApproveActivation>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let contract = &ctx.accounts.contract;

    require!(
        contract.status == ContractStatus::PendingEmployerApproval,
        StreamPayV2Error::InvalidState
    );

    let activation_deadline = contract.activation_deadline()?;
    require!(
        now < activation_deadline,
        StreamPayV2Error::ApprovalWindowExpired
    );

    let (start_time, end_time) = match contract.start_mode {
        StartMode::OnActivation => {
            let end = now
                .checked_add(contract.duration_seconds)
                .ok_or(StreamPayV2Error::ArithmeticOverflow)?;
            (now, end)
        }
        StartMode::Scheduled => {
            // Approving at exactly scheduled_start_time is fine: start == now,
            // so nothing is earned retroactively. Approving after that would
            // make [scheduled_start, now) look like already-worked time.
            require!(
                now <= contract.scheduled_start_time,
                StreamPayV2Error::ScheduledStartElapsed
            );
            let end = contract
                .scheduled_start_time
                .checked_add(contract.duration_seconds)
                .ok_or(StreamPayV2Error::ArithmeticOverflow)?;
            (contract.scheduled_start_time, end)
        }
    };

    let last_period_end = if contract.payment_mode.uses_checkpoints() {
        start_time
    } else {
        0
    };

    let contract_key = contract.key();
    let employer = contract.employer;
    let freelancer = contract.freelancer;

    let contract = &mut ctx.accounts.contract;
    contract.status = ContractStatus::Active;
    contract.start_time = start_time;
    contract.end_time = end_time;
    contract.last_period_end = last_period_end;

    emit!(ContractActivated {
        contract: contract_key,
        employer,
        freelancer,
        activated_at: now,
        start_time,
        end_time,
    });

    Ok(())
}
