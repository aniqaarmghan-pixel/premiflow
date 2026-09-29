//! `release_stream_accrual`: materialize time-based streaming earnings.
//!
//! Permissionless: the amount is derived from Clock and contract state, so
//! caller identity cannot choose, redirect, or inflate the release. No SPL
//! tokens move. `withdrawn_amount` is unchanged.
//!
//! Uses canonical cumulative accrual from `start_time`, not per-period floor
//! sums, so frequent calls cannot change the final entitlement.

use anchor_lang::prelude::*;

use crate::v2::constants::CONTRACT_SEED;
use crate::v2::enums::ContractStatus;
use crate::v2::errors::StreamPayV2Error;
use crate::v2::events::StreamAccrualReleased;
use crate::v2::state::Contract;

#[derive(Accounts)]
pub struct ReleaseStreamAccrual<'info> {
    /// Permissionless: the result does not depend on who pays the fee.
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
        constraint = contract.payment_mode.uses_checkpoints() @ StreamPayV2Error::InvalidPaymentMode,
    )]
    pub contract: Account<'info, Contract>,
}

pub fn handle_release_stream_accrual(ctx: Context<ReleaseStreamAccrual>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let contract = &ctx.accounts.contract;

    require!(
        contract.status == ContractStatus::Active,
        StreamPayV2Error::InvalidState
    );
    require!(
        now >= contract.start_time,
        StreamPayV2Error::ContractNotStarted
    );

    let accrued = contract.stream_accrued_at(now)?;
    // Saturating: an earlier clock observation than a previous release yields
    // zero, never a reduction of already released earnings.
    let newly_releasable = accrued.saturating_sub(contract.stream_released_amount);

    // Idempotent no-op: keepers can poll safely. Nothing is mutated.
    if newly_releasable == 0 {
        return Ok(());
    }

    let new_stream_released = contract
        .stream_released_amount
        .checked_add(newly_releasable)
        .ok_or(StreamPayV2Error::ArithmeticOverflow)?;
    require!(
        new_stream_released <= contract.main_amount,
        StreamPayV2Error::ReleaseAmountExceeded
    );

    let new_released = contract
        .released_amount
        .checked_add(newly_releasable)
        .ok_or(StreamPayV2Error::ArithmeticOverflow)?;
    let released_plus_refunded = new_released
        .checked_add(contract.refunded_amount)
        .ok_or(StreamPayV2Error::ArithmeticOverflow)?;
    require!(
        released_plus_refunded <= contract.total_amount,
        StreamPayV2Error::ReleaseAmountExceeded
    );
    require!(
        contract.withdrawn_amount <= new_released,
        StreamPayV2Error::ReleaseAmountExceeded
    );

    let freelancer = contract.freelancer;
    let contract_key = contract.key();
    let accrual_time = if now >= contract.end_time {
        contract.end_time
    } else {
        now
    };

    let contract = &mut ctx.accounts.contract;
    contract.stream_released_amount = new_stream_released;
    contract.released_amount = new_released;

    emit!(StreamAccrualReleased {
        contract: contract_key,
        freelancer,
        newly_released: newly_releasable,
        cumulative_stream_released: new_stream_released,
        total_released: new_released,
        accrual_time,
    });

    Ok(())
}
