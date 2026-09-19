//! Hourly-only labor-clock account. Not part of the `Contract` layout.
//!
//! Existing Fixed/Milestone/Streaming accounts never initialize this PDA.
//! H1 defines the account; H2 writes it from create/start/stop.

use anchor_lang::prelude::*;

use crate::v2::constants::{
    HOURLY_NO_ACTIVE_SESSION, MAX_HOURLY_SESSION_SECONDS, MIN_HOURLY_SESSION_SECONDS,
    V2_LAYOUT_VERSION,
};

#[account]
#[derive(InitSpace)]
pub struct HourlyState {
    /// Same layout version family as `Contract` / `WorkUnit`.
    pub version: u8,
    /// Parent contract. Stored in addition to the PDA seed.
    pub contract: Pubkey,
    /// Token base units paid for one hour of approved work.
    pub hourly_rate: u64,
    /// Maximum funded work seconds. `main_amount` must match
    /// `canonical_hourly_earned(hourly_rate, authorized_seconds)` when H2
    /// creates the contract.
    pub authorized_seconds: u64,
    /// Cumulative settled work seconds. Earnings are computed from this
    /// total, never from isolated session floors.
    pub approved_seconds: u64,
    /// Number of session PDAs allocated (next index to use).
    pub session_count: u32,
    /// Index of the open session, or `HOURLY_NO_ACTIVE_SESSION` (`u32::MAX`).
    pub active_session_index: u32,
    /// Per-session ceiling. Architecture default: 8 hours.
    pub max_session_seconds: u64,
    /// Per-session floor. Architecture default: 60 seconds.
    pub min_session_seconds: u64,
    pub bump: u8,
    /// Headroom so later Hourly fields do not realloc this account.
    pub reserved: [u8; 64],
}

impl HourlyState {
    /// Populate a newly allocated HourlyState. H2 will call this from create.
    /// H1 exposes it so layout tests can construct a coherent account.
    pub fn init(
        &mut self,
        contract: Pubkey,
        hourly_rate: u64,
        authorized_seconds: u64,
        bump: u8,
    ) {
        self.version = V2_LAYOUT_VERSION;
        self.contract = contract;
        self.hourly_rate = hourly_rate;
        self.authorized_seconds = authorized_seconds;
        self.approved_seconds = 0;
        self.session_count = 0;
        self.active_session_index = HOURLY_NO_ACTIVE_SESSION;
        self.max_session_seconds = MAX_HOURLY_SESSION_SECONDS;
        self.min_session_seconds = MIN_HOURLY_SESSION_SECONDS;
        self.bump = bump;
        self.reserved = [0u8; 64];
    }

    pub fn has_active_session(&self) -> bool {
        self.active_session_index != HOURLY_NO_ACTIVE_SESSION
    }
}

/// Documented, compiler-verified account size.
///
/// Allocated later with `space = 8 + HourlyState::INIT_SPACE` (154 bytes).
pub const HOURLY_STATE_INIT_SPACE: usize = 146;
const _: () = assert!(<HourlyState as anchor_lang::Space>::INIT_SPACE == HOURLY_STATE_INIT_SPACE);
const _: () = assert!(HourlyState::DISCRIMINATOR.len() == 8);
