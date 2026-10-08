//! Platform fee configuration instructions and shared treasury validation.

use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount};

use crate::v2::constants::FEE_CONFIG_SEED;
use crate::v2::errors::StreamPayV2Error;
use crate::v2::enums::SubscriptionTier;
use crate::v2::events::{FeeConfigUpdated, SubscriptionMintConfigured};
use crate::v2::fees::MAX_FEE_BPS;
use crate::v2::state::{FeeConfig, Subscription};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct FeeConfigArgs {
    pub admin: Pubkey,
    pub treasury: Pubkey,
    pub fee_bps: u16,
}

fn validate_args(args: &FeeConfigArgs) -> Result<()> {
    require!(args.fee_bps <= MAX_FEE_BPS, StreamPayV2Error::InvalidFeeBps);
    require!(
        args.treasury != Pubkey::default() && args.admin != Pubkey::default(),
        StreamPayV2Error::InvalidTreasuryAccount
    );
    Ok(())
}

/// Only the program's upgrade authority can create the config.
#[derive(Accounts)]
pub struct InitializeFeeConfig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + FeeConfig::INIT_SPACE,
        seeds = [FEE_CONFIG_SEED],
        bump,
    )]
    pub fee_config: Account<'info, FeeConfig>,

    #[account(
        constraint = program.programdata_address()? == Some(program_data.key())
            @ StreamPayV2Error::UnauthorizedFeeAdmin,
    )]
    pub program: Program<'info, crate::program::Streampay>,

    #[account(
        constraint = program_data.upgrade_authority_address == Some(authority.key())
            @ StreamPayV2Error::UnauthorizedFeeAdmin,
    )]
    pub program_data: Account<'info, ProgramData>,

    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_fee_config(
    ctx: Context<InitializeFeeConfig>,
    args: FeeConfigArgs,
) -> Result<()> {
    validate_args(&args)?;
    let cfg = &mut ctx.accounts.fee_config;
    cfg.admin = args.admin;
    cfg.treasury = args.treasury;
    cfg.fee_bps = args.fee_bps;
    cfg.bump = ctx.bumps.fee_config;
    cfg.subscription_mint = Pubkey::default();
    emit!(FeeConfigUpdated {
        fee_config: cfg.key(),
        admin: cfg.admin,
        treasury: cfg.treasury,
        fee_bps: cfg.fee_bps,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct UpdateFeeConfig<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [FEE_CONFIG_SEED],
        bump = fee_config.bump,
        has_one = admin @ StreamPayV2Error::UnauthorizedFeeAdmin,
    )]
    pub fee_config: Account<'info, FeeConfig>,
}

pub fn handle_update_fee_config(ctx: Context<UpdateFeeConfig>, args: FeeConfigArgs) -> Result<()> {
    validate_args(&args)?;
    let cfg = &mut ctx.accounts.fee_config;
    cfg.admin = args.admin;
    cfg.treasury = args.treasury;
    cfg.fee_bps = args.fee_bps;
    emit!(FeeConfigUpdated {
        fee_config: cfg.key(),
        admin: cfg.admin,
        treasury: cfg.treasury,
        fee_bps: cfg.fee_bps,
    });
    Ok(())
}

/// Fee admin sets the mint accepted for subscription payments (Devnet Demo
/// USDT). Plan prices are scaled by this mint's decimals on-chain.
#[derive(Accounts)]
pub struct SetSubscriptionMint<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [FEE_CONFIG_SEED],
        bump = fee_config.bump,
        has_one = admin @ StreamPayV2Error::UnauthorizedFeeAdmin,
    )]
    pub fee_config: Account<'info, FeeConfig>,

    pub subscription_mint: Account<'info, Mint>,
}

pub fn handle_set_subscription_mint(ctx: Context<SetSubscriptionMint>) -> Result<()> {
    let cfg = &mut ctx.accounts.fee_config;
    cfg.subscription_mint = ctx.accounts.subscription_mint.key();
    emit!(SubscriptionMintConfigured {
        fee_config: cfg.key(),
        subscription_mint: cfg.subscription_mint,
    });
    Ok(())
}

/// Effective plan of `owner` at `now`, read from its canonical Subscription
/// PDA (the caller's Accounts struct seeds-verifies the address). Missing or
/// expired means Free. Only the program can write this account, and only
/// after payment, so no client can assert Pro/Premium.
pub fn read_subscription_tier(
    info: &AccountInfo,
    owner: Pubkey,
    now: i64,
) -> Result<SubscriptionTier> {
    if info.owner != &crate::ID || info.data_is_empty() {
        return Ok(SubscriptionTier::Free);
    }
    let data = info.try_borrow_data()?;
    let sub = Subscription::try_deserialize(&mut &data[..])?;
    require_keys_eq!(sub.owner, owner, StreamPayV2Error::InvalidSubscriptionAccount);
    Ok(sub.effective_tier(now))
}

/// Reads the snapshot bps from the canonical FeeConfig PDA at create time.
/// An uninitialized PDA (no config yet) means no fee.
pub fn read_fee_bps(info: &AccountInfo) -> Result<u16> {
    if info.owner != &crate::ID || info.data_is_empty() {
        return Ok(0);
    }
    let data = info.try_borrow_data()?;
    let cfg = FeeConfig::try_deserialize(&mut &data[..])?;
    require!(cfg.fee_bps <= MAX_FEE_BPS, StreamPayV2Error::InvalidFeeBps);
    Ok(cfg.fee_bps)
}

/// Every fee-paying instruction validates the treasury destination: it must
/// be a token account of the contract mint, owned by the configured treasury
/// authority, and not the escrow itself.
pub fn validate_treasury<'info>(
    fee_config: &Option<Box<Account<'info, FeeConfig>>>,
    treasury_token_account: &Option<Box<Account<'info, TokenAccount>>>,
    mint: Pubkey,
    escrow: Pubkey,
) -> Result<()> {
    let cfg = fee_config
        .as_ref()
        .ok_or(StreamPayV2Error::FeeConfigRequired)?;
    let treasury = treasury_token_account
        .as_ref()
        .ok_or(StreamPayV2Error::FeeConfigRequired)?;
    require_keys_eq!(treasury.mint, mint, StreamPayV2Error::InvalidTreasuryAccount);
    require_keys_eq!(
        treasury.owner,
        cfg.treasury,
        StreamPayV2Error::InvalidTreasuryAccount
    );
    require_keys_neq!(
        treasury.key(),
        escrow,
        StreamPayV2Error::InvalidTreasuryAccount
    );
    Ok(())
}
