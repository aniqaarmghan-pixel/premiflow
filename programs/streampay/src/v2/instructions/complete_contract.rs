//! `complete_contract`: freeze a successful economic end. No SPL transfer.
//!
//! Permissionless once completion is objectively true on-chain. Streaming
//! requires `Clock >= end_time`. Fixed/Milestone require every required unit
//! to already have been released by approval or review timeout. This
//! instruction never bypasses review and never moves tokens.

use anchor_lang::prelude::*;

use crate::v2::constants::CONTRACT_SEED;
use crate::v2::events::ContractCompleted;
use crate::v2::state::Contract;

#[derive(Accounts)]
pub struct CompleteContract<'info> {
    /// Permissionless payer. The result is determined by Clock and state.
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

pub fn handle_complete_contract(ctx: Context<CompleteContract>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let contract = &ctx.accounts.contract;

    let contract_key = contract.key();
    let employer = contract.employer;
    let freelancer = contract.freelancer;

    let contract = &mut ctx.accounts.contract;
    let (freelancer_final, employer_final) = contract.settle_successful_completion(now)?;

    emit!(ContractCompleted {
        contract: contract_key,
        employer,
        freelancer,
        completed_at: now,
        final_freelancer_entitlement: freelancer_final,
        final_employer_entitlement: employer_final,
        released_amount: contract.released_amount,
        withdrawn_amount: contract.withdrawn_amount,
        refunded_amount: contract.refunded_amount,
    });

    Ok(())
}
