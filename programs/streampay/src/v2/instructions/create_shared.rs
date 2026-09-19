//! Shared create-path security checks and escrow funding.
//!
//! Extracted so `create_contract` and `create_hourly_contract` cannot drift
//! on party, offer-window, metadata, or `transfer_checked` rules.
//! `CreateContractArgs` Borsh layout is unchanged.

use anchor_lang::prelude::*;
use anchor_spl::token::{transfer_checked, Mint, TokenAccount, TransferChecked};

use crate::v2::constants::{
    MAX_ACCEPTANCE_WINDOW, MAX_ACTIVATION_REVIEW, MAX_DURATION_SECONDS, MAX_REVIEW_DURATION,
    MAX_REVISIONS_LIMIT, MAX_URI_LEN, MIN_ACTIVATION_REVIEW, MIN_DURATION_SECONDS,
    MIN_REVIEW_DURATION,
};
use crate::v2::errors::StreamPayV2Error;

/// Employer, freelancer, and resolver must be three distinct non-default keys.
pub fn validate_parties_and_resolver(
    employer: Pubkey,
    freelancer: Pubkey,
    resolver: Pubkey,
) -> Result<()> {
    require_keys_neq!(employer, freelancer, StreamPayV2Error::SelfContract);
    require!(resolver != Pubkey::default(), StreamPayV2Error::InvalidResolver);
    require_keys_neq!(resolver, employer, StreamPayV2Error::InvalidResolver);
    require_keys_neq!(resolver, freelancer, StreamPayV2Error::InvalidResolver);
    Ok(())
}

/// Metadata, acceptance window, duration, review, revisions, activation review.
pub fn validate_common_offer_terms(
    now: i64,
    metadata_uri: &str,
    acceptance_deadline: i64,
    duration_seconds: i64,
    review_duration: i64,
    max_revisions: u8,
    activation_review_duration: i64,
) -> Result<()> {
    require!(
        !metadata_uri.is_empty() && metadata_uri.len() <= MAX_URI_LEN,
        StreamPayV2Error::InvalidMetadata
    );

    require!(
        acceptance_deadline > now,
        StreamPayV2Error::InvalidAcceptanceDeadline
    );
    let latest_deadline = now
        .checked_add(MAX_ACCEPTANCE_WINDOW)
        .ok_or(StreamPayV2Error::ArithmeticOverflow)?;
    require!(
        acceptance_deadline <= latest_deadline,
        StreamPayV2Error::InvalidAcceptanceDeadline
    );

    require!(
        (MIN_DURATION_SECONDS..=MAX_DURATION_SECONDS).contains(&duration_seconds),
        StreamPayV2Error::InvalidDuration
    );

    require!(
        (MIN_REVIEW_DURATION..=MAX_REVIEW_DURATION).contains(&review_duration),
        StreamPayV2Error::InvalidReviewDuration
    );

    require!(
        max_revisions <= MAX_REVISIONS_LIMIT,
        StreamPayV2Error::InvalidMaxRevisions
    );

    require!(
        (MIN_ACTIVATION_REVIEW..=MAX_ACTIVATION_REVIEW).contains(&activation_review_duration),
        StreamPayV2Error::InvalidActivationReview
    );

    Ok(())
}

/// Latest possible OnActivation `end_time` must fit in `i64`.
pub fn prove_on_activation_end_fits(
    acceptance_deadline: i64,
    activation_review_duration: i64,
    duration_seconds: i64,
) -> Result<()> {
    acceptance_deadline
        .checked_add(activation_review_duration)
        .and_then(|t| t.checked_add(duration_seconds))
        .ok_or(StreamPayV2Error::ArithmeticOverflow)?;
    Ok(())
}

/// `transfer_checked` of `amount` into the contract escrow, then assert the
/// escrow holds exactly that amount. Partial funding is not a supported state.
pub fn fund_contract_escrow<'info>(
    token_program: AccountInfo<'info>,
    employer_token_account: AccountInfo<'info>,
    token_mint: &Account<'info, Mint>,
    contract_escrow: &mut Account<'info, TokenAccount>,
    employer: AccountInfo<'info>,
    amount: u64,
) -> Result<()> {
    transfer_checked(
        CpiContext::new(
            token_program.key(),
            TransferChecked {
                from: employer_token_account,
                mint: token_mint.to_account_info(),
                to: contract_escrow.to_account_info(),
                authority: employer,
            },
        ),
        amount,
        token_mint.decimals,
    )?;

    contract_escrow.reload()?;
    require_eq!(
        contract_escrow.amount,
        amount,
        StreamPayV2Error::EscrowFundingMismatch
    );
    Ok(())
}
