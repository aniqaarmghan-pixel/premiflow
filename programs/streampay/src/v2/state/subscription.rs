//! Per-wallet PREMIFLOW subscription.

use anchor_lang::prelude::*;

use crate::v2::enums::{SubscriptionTerm, SubscriptionTier};

pub const SUBSCRIPTION_LAYOUT_VERSION: u8 = 1;

/// PDA `[SUBSCRIPTION_SEED, owner]`. Written ONLY by `purchase_subscription`,
/// in the same transaction that moves the plan price to the treasury, so a
/// browser or database can never assert a plan the wallet did not pay for.
#[account]
#[derive(InitSpace)]
pub struct Subscription {
    pub version: u8,
    pub owner: Pubkey,
    /// Last purchased plan; effective only while `now < expires_at`.
    pub tier: SubscriptionTier,
    pub last_term: SubscriptionTerm,
    /// Start of the current uninterrupted subscription period.
    pub started_at: i64,
    pub expires_at: i64,
    /// Cumulative plan payments in subscription-mint base units.
    pub total_paid: u64,
    pub bump: u8,
    pub reserved: [u8; 32],
}

impl Subscription {
    /// Plan in force at `now`; expired or never-purchased reads as Free.
    pub fn effective_tier(&self, now: i64) -> SubscriptionTier {
        if self.tier != SubscriptionTier::Free && now < self.expires_at {
            self.tier
        } else {
            SubscriptionTier::Free
        }
    }
}
