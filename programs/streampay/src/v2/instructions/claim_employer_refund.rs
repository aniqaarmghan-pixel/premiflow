//! `claim_employer_refund`: move Phase 7 frozen employer entitlement.
//!
//! Withdraw-all-available of `employer_refundable_amount - refunded_amount`.
//! Active contracts have no refund path. Does not recompute settlement.

use anchor_lang::prelude::*;
use anchor_spl::token::{transfer_checked, Mint, Token, TokenAccount, TransferChecked};

use crate::v2::constants::{CONTRACT_ESCROW_SEED, CONTRACT_SEED};
use crate::v2::errors::StreamPayV2Error;
use crate::v2::events::EmployerRefundClaimed;
use crate::v2::state::Contract;

#[derive(Accounts)]
pub struct ClaimEmployerRefund<'info> {
    pub employer: Signer<'info>,

    #[account(
        mut,
        has_one = employer @ StreamPayV2Error::Unauthorized,
        has_one = token_mint,
        seeds = [
            CONTRACT_SEED,
            employer.key().as_ref(),
            contract.freelancer.as_ref(),
            &contract.contract_id.to_le_bytes(),
        ],
        bump = contract.bump,
    )]
    pub contract: Account<'info, Contract>,

    pub token_mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [CONTRACT_ESCROW_SEED, contract.key().as_ref()],
        bump = contract.escrow_bump,
        token::mint = token_mint,
        token::authority = contract,
    )]
    pub contract_escrow: Account<'info, TokenAccount>,

    /// Any classic SPL token account of the contract mint owned by the
    /// employer. Not ATA-only.
    #[account(
        mut,
        token::mint = token_mint,
        token::authority = employer,
        constraint = employer_token_account.key() != contract_escrow.key(),
    )]
    pub employer_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_claim_employer_refund(ctx: Context<ClaimEmployerRefund>) -> Result<()> {
    let escrow_amount = ctx.accounts.contract_escrow.amount;
    let decimals = ctx.accounts.token_mint.decimals;

    let contract = &mut ctx.accounts.contract;
    let available = contract.available_to_refund()?;
    require!(available > 0, StreamPayV2Error::NothingToRefund);
    require!(
        escrow_amount >= available,
        StreamPayV2Error::InsufficientEscrowBalance
    );

    let refundable = contract.employer_refundable_amount;
    let new_refunded = contract
        .refunded_amount
        .checked_add(available)
        .ok_or(StreamPayV2Error::ArithmeticOverflow)?;
    require!(
        new_refunded <= refundable,
        StreamPayV2Error::ReleaseAmountExceeded
    );
    let remaining = refundable
        .checked_sub(new_refunded)
        .ok_or(StreamPayV2Error::ArithmeticOverflow)?;

    // Accounting before the CPI. A failed transfer aborts the whole
    // transaction, so this update cannot persist without tokens leaving escrow.
    contract.refunded_amount = new_refunded;

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
                to: ctx.accounts.employer_token_account.to_account_info(),
                authority: ctx.accounts.contract.to_account_info(),
            },
            &[signer_seeds],
        ),
        available,
        decimals,
    )?;

    emit!(EmployerRefundClaimed {
        contract: contract_key,
        employer,
        mint,
        amount: available,
        refunded_amount: new_refunded,
        remaining_refundable: remaining,
    });

    Ok(())
}
