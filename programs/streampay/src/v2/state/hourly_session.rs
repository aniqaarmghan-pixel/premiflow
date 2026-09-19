//! One Hourly work session. Child of a contract via `hourly_session` seeds.
//!
//! Work files stay off-chain; only a bounded URI and hash are stored, matching
//! `WorkUnit` evidence conventions. H1 defines the account; H2 transitions
//! `Open` → `Recorded` / `Void`.

use anchor_lang::prelude::*;

use crate::v2::constants::{MAX_URI_LEN, V2_LAYOUT_VERSION};
use crate::v2::enums::HourlySessionStatus;

#[account]
#[derive(InitSpace)]
pub struct HourlySession {
    pub version: u8,
    pub contract: Pubkey,
    /// Zero-based session index and PDA seed (`u32` little-endian).
    pub index: u32,
    /// Solana Clock at Start. Zero until opened.
    pub started_at: i64,
    /// Solana Clock at Stop. Zero while `Open`.
    pub stopped_at: i64,
    /// `stopped_at - started_at` once recorded, after H2 caps.
    pub duration_seconds: u64,
    pub status: HourlySessionStatus,
    /// Hash of the optional off-chain work log.
    pub work_log_hash: [u8; 32],
    pub bump: u8,
    pub reserved: [u8; 32],
    /// Bounded pointer to the off-chain work log. Not required in V1.
    #[max_len(MAX_URI_LEN)]
    pub work_log_uri: String,
}

impl HourlySession {
    /// Allocate an Open session. H2 Start will call this.
    pub fn init_open(&mut self, contract: Pubkey, index: u32, started_at: i64, bump: u8) {
        self.version = V2_LAYOUT_VERSION;
        self.contract = contract;
        self.index = index;
        self.started_at = started_at;
        self.stopped_at = 0;
        self.duration_seconds = 0;
        self.status = HourlySessionStatus::Open;
        self.work_log_hash = [0u8; 32];
        self.bump = bump;
        self.reserved = [0u8; 32];
        self.work_log_uri = String::new();
    }
}

/// Documented, compiler-verified account size.
///
/// Allocated later with `space = 8 + HourlySession::INIT_SPACE` (339 bytes).
pub const HOURLY_SESSION_INIT_SPACE: usize = 331;
const _: () = assert!(<HourlySession as anchor_lang::Space>::INIT_SPACE == HOURLY_SESSION_INIT_SPACE);
const _: () = assert!(HourlySession::DISCRIMINATOR.len() == 8);
