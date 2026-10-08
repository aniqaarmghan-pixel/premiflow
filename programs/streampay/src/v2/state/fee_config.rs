//! Singleton platform fee configuration.

use anchor_lang::prelude::*;

/// PDA `[FEE_CONFIG_SEED]`. Created once by the program upgrade authority;
/// afterwards only `admin` may change it. `fee_bps` is snapshotted onto each
/// Fixed / Milestone contract at creation, so later changes never alter an
/// already-funded contract's economics.
#[account]
#[derive(InitSpace)]
pub struct FeeConfig {
    /// May update fee_bps, treasury and admin.
    pub admin: Pubkey,
    /// Owner (token authority) of every token account that may receive fees.
    pub treasury: Pubkey,
    /// Platform fee in basis points, capped at `MAX_FEE_BPS`.
    pub fee_bps: u16,
    pub bump: u8,
    /// Mint accepted for subscription payments (Devnet Demo USDT). Occupies
    /// the former 32 reserved bytes, so pre-subscription configs read the
    /// default key: purchases disabled until the admin sets it.
    pub subscription_mint: Pubkey,
}
