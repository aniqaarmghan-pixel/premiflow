//! `withdraw_freelancer`: move currently available freelancer entitlement.
//!
//! Withdraw-all-available. No caller-specified amount. Active contracts pay
//! `released_amount - withdrawn_amount`. Disputed contracts pay the same
//! already-released amount only; contested funds stay in escrow until
//! resolution. Cancelled / Resolved / Completed contracts pay the remaining
//! frozen settlement. Does not materialize streaming accrual.

use anchor_lang::prelude::*;
use anchor_spl::token::{transfer_checked, Mint, Token, TokenAccount, TransferChecked};

use crate::v2::constants::{CONTRACT_ESCROW_SEED, CONTRACT_SEED};
use crate::v2::errors::StreamPayV2Error;
use crate::v2::events::FreelancerWithdrawal;
use crate::v2::state::Contract;

#[derive(Accounts)]
pub struct WithdrawFreelancer<'info> {
    pub freelancer: Signer<'info>,

    #[account(
        mut,
        has_one = freelancer @ StreamPayV2Error::Unauthorized,
        has_one = token_mint,
        seeds = [
            CONTRACT_SEED,
            contract.employer.as_ref(),
            freelancer.key().as_ref(),
            &contract.contract_id.to_le_bytes(),
        ],
        bump = contract.bump,
    )]
    pub contract: Account<'info, Contract>,

    pub token_mint: Account<'info, Mint>,

    /// Canonical escrow for this Contract. Seeds bind it to `contract`; mint
    /// and authority bind it to the funded asset and the Contract PDA.
    #[account(
        mut,
        seeds = [CONTRACT_ESCROW_SEED, contract.key().as_ref()],
        bump = contract.escrow_bump,
        token::mint = token_mint,
        token::authority = contract,
    )]
    pub contract_escrow: Account<'info, TokenAccount>,

    /// Any classic SPL token account of the contract mint owned by the
    /// freelancer. Not ATA-only.
    #[account(
        mut,
        token::mint = token_mint,
        token::authority = freelancer,
        constraint = freelancer_token_account.key() != contract_escrow.key(),
    )]
    pub freelancer_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_withdraw_freelancer(ctx: Context<WithdrawFreelancer>) -> Result<()> {
    let escrow_amount = ctx.accounts.contract_escrow.amount;
    let decimals = ctx.accounts.token_mint.decimals;

    let contract = &mut ctx.accounts.contract;
    let available = contract.available_to_withdraw()?;
    require!(available > 0, StreamPayV2Error::NothingToWithdraw);
    require!(
        escrow_amount >= available,
        StreamPayV2Error::InsufficientEscrowBalance
    );

    let cap = contract.freelancer_withdraw_cap()?;
    let new_withdrawn = contract
        .withdrawn_amount
        .checked_add(available)
        .ok_or(StreamPayV2Error::ArithmeticOverflow)?;
    require!(
        new_withdrawn <= cap,
        StreamPayV2Error::ReleaseAmountExceeded
    );
    require!(
        new_withdrawn <= contract.released_amount,
        StreamPayV2Error::ReleaseAmountExceeded
    );
    let remaining = cap
        .checked_sub(new_withdrawn)
        .ok_or(StreamPayV2Error::ArithmeticOverflow)?;

    // Accounting before the CPI. A failed transfer aborts the whole
    // transaction, so this update cannot persist without tokens leaving escrow.
    contract.withdrawn_amount = new_withdrawn;

    let employer = contract.employer;
    let freelancer = contract.freelancer;
    let contract_id = contract.contract_id.to_le_bytes();
    let bump = [contract.bump];
    let mint = contract.token_mint;
    let contract_key = contract.key();

    let signer_seeds: &[&[u8]] = &[
        CONTRACT_SEED,
        employer.as_ref(),
        freelancer.as_ref(),
        &contract_id,
        &bump,
    ];

    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.contract_escrow.to_account_info(),
                mint: ctx.accounts.token_mint.to_account_info(),
                to: ctx.accounts.freelancer_token_account.to_account_info(),
                authority: ctx.accounts.contract.to_account_info(),
            },
            &[signer_seeds],
        ),
        available,
        decimals,
    )?;

    emit!(FreelancerWithdrawal {
        contract: contract_key,
        freelancer,
        mint,
        amount: available,
        withdrawn_amount: new_withdrawn,
        remaining_entitlement: remaining,
    });

    Ok(())
}
