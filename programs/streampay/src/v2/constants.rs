//! V2 PDA seed namespace and negotiated-term bounds.
//!
//! The V2 seeds are deliberately disjoint from V1's `b"stream"` / `b"escrow"`,
//! so no V2 address can collide with a V1 address. They are also deliberately
//! brand-free, so a future rename of the product cannot force a PDA change.

/// Seed prefix for the V2 `Contract` account.
/// Full seeds: `[CONTRACT_SEED, employer, freelancer, contract_id.to_le_bytes()]`
pub const CONTRACT_SEED: &[u8] = b"contract";

/// Seed prefix for the V2 escrow token account owned by the `Contract` PDA.
/// Full seeds: `[CONTRACT_ESCROW_SEED, contract]`
pub const CONTRACT_ESCROW_SEED: &[u8] = b"contract_escrow";

/// Seed prefix for the V2 `WorkUnit` child account.
/// Full seeds: `[WORK_UNIT_SEED, contract, index.to_le_bytes()]`
pub const WORK_UNIT_SEED: &[u8] = b"work_unit";

/// Seed prefix for the optional paid-trial `WorkUnit`.
/// Full seeds: `[TRIAL_UNIT_SEED, contract]`
///
/// A dedicated namespace so a trial can never collide with milestone or
/// checkpoint units, which are indexed under `WORK_UNIT_SEED`.
pub const TRIAL_UNIT_SEED: &[u8] = b"trial_unit";

/// Seed prefix for the Hourly-only labor-clock account.
/// Full seeds: `[HOURLY_STATE_SEED, contract]`
///
/// Disjoint from `work_unit` / `trial_unit` so existing contracts never
/// collide with Hourly state.
pub const HOURLY_STATE_SEED: &[u8] = b"hourly_state";

/// Seed prefix for one Hourly work session.
/// Full seeds: `[HOURLY_SESSION_SEED, contract, session_index.to_le_bytes()]`
///
/// `session_index` is a little-endian `u32`, same width as `WorkUnit::index`.
pub const HOURLY_SESSION_SEED: &[u8] = b"hourly_session";

/// Current on-chain layout version written to `Contract::version` and
/// `WorkUnit::version`. Bump only on a layout change.
pub const V2_LAYOUT_VERSION: u8 = 1;

/// Maximum byte length of an off-chain metadata / submission URI.
///
/// Large descriptions, portfolios and work files are never stored on-chain;
/// only a bounded reference plus a content hash.
pub const MAX_URI_LEN: usize = 200;

// ---------------------------------------------------------------------------
// Negotiated-term bounds.
//
// These bound *structure*, not human calendars. Wall-clock floors were
// deliberately kept low so accelerated demo terms are expressible without any
// program-side demo mode: every term below is chosen by the employer at
// creation and disclosed to the freelancer before acceptance.
// ---------------------------------------------------------------------------

/// Maximum window between contract creation and the acceptance deadline
/// (90 days).
///
/// Bounds how long escrowed funds can sit in an unaccepted offer, and bounds
/// `acceptance_deadline + duration_seconds` well inside `i64` so the `end_time`
/// resolved at acceptance can never overflow.
pub const MAX_ACCEPTANCE_WINDOW: i64 = 7_776_000;

/// Minimum streaming duration (1 minute).
pub const MIN_DURATION_SECONDS: i64 = 60;

/// Maximum streaming duration (5 years). Keeps vesting arithmetic far inside
/// the `u128` intermediate range.
pub const MAX_DURATION_SECONDS: i64 = 157_680_000;

/// Minimum review / resubmission window (10 seconds).
///
/// This floor is structural rather than cosmetic: it guarantees
/// `action_deadline > submitted_at` by enough margin that a review timeout
/// cannot be finalized in the slot after submission, which would collapse the
/// approval model into "elapsed time alone releases funds".
pub const MIN_REVIEW_DURATION: i64 = 10;

/// Maximum review / resubmission window (30 days).
pub const MAX_REVIEW_DURATION: i64 = 2_592_000;

/// Upper bound on checkpoints per streaming contract. Bounds the number of
/// child accounts directly, replacing a wall-clock interval floor.
pub const MAX_CHECKPOINTS: u32 = 1024;

/// Upper bound on milestones per milestone/fixed contract.
///
/// Deliberately much lower than `MAX_CHECKPOINTS`. Checkpoints are generated
/// from a time formula, so their count follows from terms the employer already
/// agreed. Milestones are hand-defined, each one costs the employer a rent-
/// funded account and its own review cycle, and every negotiated deliverable
/// has to be read by a human before acceptance. 64 is far past any realistic
/// freelance contract while keeping the child-account footprint bounded.
pub const MAX_MILESTONES: u32 = 64;

/// Upper bound on negotiated revision cycles per work unit. Together with
/// `review_duration` this bounds how long a submitted unit can be withheld.
pub const MAX_REVISIONS_LIMIT: u8 = 5;

/// Minimum employer activation-review window (1 minute).
///
/// Kept low so a hackathon demo can run the full accept → approve path without
/// a program-side demo mode. Production UIs should offer 1h / 4h / 12h / 24h.
pub const MIN_ACTIVATION_REVIEW: i64 = 60;

/// Maximum employer activation-review window (24 hours).
///
/// Bounds how long a freelancer can be left in `PendingEmployerApproval`
/// waiting for a yes/no. A later instruction will settle a lapsed window;
/// this cap is what makes that wait finite.
pub const MAX_ACTIVATION_REVIEW: i64 = 86_400;

/// Upper bound on Hourly session PDAs per contract. Same order as
/// `MAX_MILESTONES`: enough for a real engagement, bounded rent.
pub const MAX_HOURLY_SESSIONS: u32 = 64;

/// Shortest Hourly session H2 will accept (1 minute). Anti-spam; not a
/// billing floor for Collect.
pub const MIN_HOURLY_SESSION_SECONDS: u64 = 60;

/// Longest single Hourly session (8 hours). Forgotten-timer safety guard.
/// Enforcement belongs to H2 Start/Stop.
pub const MAX_HOURLY_SESSION_SECONDS: u64 = 8 * 60 * 60;

/// `HourlyState::active_session_index` when no session is open.
pub const HOURLY_NO_ACTIVE_SESSION: u32 = u32::MAX;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pda_seeds_and_structural_bounds_are_frozen() {
        assert_eq!(CONTRACT_SEED, b"contract");
        assert_eq!(CONTRACT_ESCROW_SEED, b"contract_escrow");
        assert_eq!(WORK_UNIT_SEED, b"work_unit");
        assert_eq!(TRIAL_UNIT_SEED, b"trial_unit");
        assert_eq!(HOURLY_STATE_SEED, b"hourly_state");
        assert_eq!(HOURLY_SESSION_SEED, b"hourly_session");
        assert_eq!(V2_LAYOUT_VERSION, 1);
        assert_eq!(MAX_URI_LEN, 200);
        assert_eq!(MAX_MILESTONES, 64);
        assert_eq!(MAX_HOURLY_SESSIONS, 64);
        assert_eq!(MIN_HOURLY_SESSION_SECONDS, 60);
        assert_eq!(MAX_HOURLY_SESSION_SECONDS, 28_800);
        assert_eq!(HOURLY_NO_ACTIVE_SESSION, u32::MAX);
        assert_eq!(MAX_CHECKPOINTS, 1024);
        assert_eq!(MAX_REVISIONS_LIMIT, 5);
        assert_eq!(MIN_DURATION_SECONDS, 60);
        assert_eq!(MIN_REVIEW_DURATION, 10);
    }
}
