//! `purchase_subscription`: wallet-signed Pro / Premium purchase or renewal.
//!
//! The plan price (25 / 60 per month, 250 / 600 per year, in whole tokens of
//! the configured subscription mint, scaled by its decimals) moves from the
//! subscriber's token account to a treasury token account owned by
//! `FeeConfig.treasury` in the SAME instruction that records the plan, so the
//! entitlement cannot exist without the payment.
//!
//! Renewal of the active plan extends from the current expiry; a purchase
//! after expiry starts at `now`. Changing plan while one is active is
//! rejected (no proration), and prepaying beyond
//! `SUBSCRIPTION_MAX_PREPAID_SECONDS` is rejected.

use anchor_lang::prelude::*;
use anchor_spl::token::{transfer_checked, Mint, Token, TokenAccount, TransferChecked};

use crate::v2::constants::{FEE_CONFIG_SEED, SUBSCRIPTION_MAX_PREPAID_SECONDS, SUBSCRIPTION_SEED};
use crate::v2::enums::{SubscriptionTerm, SubscriptionTier};
use crate::v2::errors::StreamPayV2Error;
use crate::v2::events::SubscriptionPurchased;
use crate::v2::fees;
use crate::v2::state::{FeeConfig, Subscription, SUBSCRIPTION_LAYOUT_VERSION};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct PurchaseSubscriptionArgs {
    pub tier: SubscriptionTier,
    pub term: SubscriptionTerm,
}

#[derive(Accounts)]
pub struct PurchaseSubscription<'info> {
    #[account(mut)]
    pub subscriber: Signer<'info>,

    #[account(
        init_if_needed,
        payer = subscriber,
        space = 8 + Subscription::INIT_SPACE,
        seeds = [SUBSCRIPTION_SEED, subscriber.key().as_ref()],
        bump,
    )]
    pub subscription: Box<Account<'info, Subscription>>,

    #[account(seeds = [FEE_CONFIG_SEED], bump = fee_config.bump)]
    pub fee_config: Box<Account<'info, FeeConfig>>,

    #[account(
        constraint = payment_mint.key() == fee_config.subscription_mint
            @ StreamPayV2Error::InvalidSubscriptionMint,
    )]
    pub payment_mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        token::mint = payment_mint,
        token::authority = subscriber,
    )]
    pub subscriber_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint = payment_mint,
        constraint = treasury_token_account.owner == fee_config.treasury
            @ StreamPayV2Error::InvalidTreasuryAccount,
        constraint = treasury_token_account.key() != subscriber_token_account.key()
            @ StreamPayV2Error::InvalidTreasuryAccount,
    )]
    pub treasury_token_account: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handle_purchase_subscription(
    ctx: Context<PurchaseSubscription>,
    args: PurchaseSubscriptionArgs,
) -> Result<()> {
    require!(
        ctx.accounts.fee_config.subscription_mint != Pubkey::default(),
        StreamPayV2Error::SubscriptionsNotConfigured
    );
    let now = Clock::get()?.unix_timestamp;
    let subscriber = ctx.accounts.subscriber.key();
    let decimals = ctx.accounts.payment_mint.decimals;
    let price = fees::subscription_price_base_units(args.tier, args.term, decimals)
        .ok_or(StreamPayV2Error::InvalidSubscriptionPlan)?;
    let term_seconds = fees::subscription_term_seconds(args.term);

    let sub = &mut ctx.accounts.subscription;
    if sub.owner == Pubkey::default() {
        sub.version = SUBSCRIPTION_LAYOUT_VERSION;
        sub.owner = subscriber;
        sub.tier = SubscriptionTier::Free;
        sub.bump = ctx.bumps.subscription;
        sub.reserved = [0u8; 32];
    }
    require_keys_eq!(sub.owner, subscriber, StreamPayV2Error::InvalidSubscriptionAccount);

    let active = sub.effective_tier(now) != SubscriptionTier::Free;
    if active {
        require!(
            sub.tier == args.tier,
            StreamPayV2Error::SubscriptionTierChangeWhileActive
        );
    }
    let base = if active { sub.expires_at } else { now };
    let expires_at = base
        .checked_add(term_seconds)
        .ok_or(StreamPayV2Error::ArithmeticOverflow)?;
    let ahead = expires_at
        .checked_sub(now)
        .ok_or(StreamPayV2Error::ArithmeticOverflow)?;
    require!(
        ahead <= SUBSCRIPTION_MAX_PREPAID_SECONDS,
        StreamPayV2Error::SubscriptionPrepaidLimit
    );
    if !active {
        sub.started_at = now;
    }
    sub.tier = args.tier;
    sub.last_term = args.term;
    sub.expires_at = expires_at;
    sub.total_paid = sub
        .total_paid
        .checked_add(price)
        .ok_or(StreamPayV2Error::ArithmeticOverflow)?;
    let started_at = sub.started_at;
    let subscription_key = sub.key();

    transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.subscriber_token_account.to_account_info(),
                mint: ctx.accounts.payment_mint.to_account_info(),
                to: ctx.accounts.treasury_token_account.to_account_info(),
                authority: ctx.accounts.subscriber.to_account_info(),
            },
        ),
        price,
        decimals,
    )?;

    emit!(SubscriptionPurchased {
        subscriber,
        subscription: subscription_key,
        tier: args.tier,
        term: args.term,
        mint: ctx.accounts.payment_mint.key(),
        treasury_token_account: ctx.accounts.treasury_token_account.key(),
        amount: price,
        started_at,
        expires_at,
    });
    Ok(())
}
