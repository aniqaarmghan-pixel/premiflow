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

/// Upper bound on negotiated revision cycles per work unit. Together with
/// `review_duration` this bounds how long a submitted unit can be withheld.
pub const MAX_REVISIONS_LIMIT: u8 = 5;
