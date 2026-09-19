//! Hourly architecture helpers.
//!
//! Canonical earnings math, PDA derivation, and session-credit rules used by
//! Start/Stop and by dispute materialization. Existing Fixed/Milestone/
//! Streaming settlement continues to use `canonical_stream_accrued` and
//! WorkUnits.

use anchor_lang::prelude::*;

use crate::v2::constants::{HOURLY_NO_ACTIVE_SESSION, HOURLY_SESSION_SEED, HOURLY_STATE_SEED};
use crate::v2::enums::HourlySessionStatus;
use crate::v2::errors::StreamPayV2Error;
use crate::v2::state::{Contract, HourlySession, HourlyState};

/// Seconds in one billed hour. Hourly rate is token base units **per hour**.
pub const HOURLY_SECONDS_PER_HOUR: u128 = 3_600;

/// Cumulative Hourly entitlement:
/// `floor(hourly_rate * approved_seconds / 3600)` in token base units.
///
/// `hourly_rate` is base units per hour. `approved_seconds` is the running
/// total of settled work time, not one session. Independent per-session
/// floors can lose remainder dust; this function is the only settlement
/// formula H2 may use.
///
/// Intermediate product is `u128`. Never uses floating point.
pub fn canonical_hourly_earned(hourly_rate: u64, approved_seconds: u64) -> Result<u64> {
    if approved_seconds == 0 || hourly_rate == 0 {
        return Ok(0);
    }

    let product = (hourly_rate as u128)
        .checked_mul(approved_seconds as u128)
        .ok_or(StreamPayV2Error::ArithmeticOverflow)?;
    let earned = product
        .checked_div(HOURLY_SECONDS_PER_HOUR)
        .ok_or(StreamPayV2Error::ArithmeticOverflow)?;
    u64::try_from(earned).map_err(|_| StreamPayV2Error::ArithmeticOverflow.into())
}

/// Result of applying Stop / dispute-materialization caps to one session.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct HourlySessionCredit {
    pub credited_duration: u64,
    pub release_delta: u64,
    pub new_approved_seconds: u64,
    pub new_earned: u64,
    pub old_earned: u64,
    pub status: HourlySessionStatus,
}

/// Cap raw elapsed time, then apply the short-session Void rule.
///
/// Caps (all inclusive minimums):
/// - elapsed since `started_at`
/// - remaining authorized seconds
/// - `max_session_seconds` (8 hours)
/// - remaining engagement window (`end_time - started_at`)
///
/// Short session: if credited < min AND remaining authorized before Stop
/// was >= min, Void with 0 credit. If remaining authorized itself is
/// below the minimum, the leftover is Recorded.
pub fn compute_hourly_session_credit(
    hourly_rate: u64,
    authorized_seconds: u64,
    approved_seconds: u64,
    started_at: i64,
    now: i64,
    engagement_end: i64,
    min_session_seconds: u64,
    max_session_seconds: u64,
) -> Result<HourlySessionCredit> {
    let raw_i = now
        .checked_sub(started_at)
        .ok_or(StreamPayV2Error::ArithmeticOverflow)?;
    require!(raw_i >= 0, StreamPayV2Error::InvalidHourlySession);
    let raw_duration = raw_i as u64;

    let remaining_authorized = authorized_seconds
        .checked_sub(approved_seconds)
        .ok_or(StreamPayV2Error::ArithmeticOverflow)?;

    let engagement_remaining = if engagement_end <= started_at {
        0u64
    } else {
        let span = engagement_end
            .checked_sub(started_at)
            .ok_or(StreamPayV2Error::ArithmeticOverflow)?;
        span as u64
    };

    let mut credited = raw_duration;
    credited = credited.min(remaining_authorized);
    credited = credited.min(max_session_seconds);
    credited = credited.min(engagement_remaining);

    let (credited_duration, status) = if credited < min_session_seconds
        && remaining_authorized >= min_session_seconds
    {
        (0u64, HourlySessionStatus::Void)
    } else {
        (credited, HourlySessionStatus::Recorded)
    };

    let old_earned = canonical_hourly_earned(hourly_rate, approved_seconds)?;
    let new_approved_seconds = approved_seconds
        .checked_add(credited_duration)
        .ok_or(StreamPayV2Error::ArithmeticOverflow)?;
    require!(
        new_approved_seconds <= authorized_seconds,
        StreamPayV2Error::ReleaseAmountExceeded
    );
    let new_earned = canonical_hourly_earned(hourly_rate, new_approved_seconds)?;
    let release_delta = new_earned
        .checked_sub(old_earned)
        .ok_or(StreamPayV2Error::ArithmeticOverflow)?;

    Ok(HourlySessionCredit {
        credited_duration,
        release_delta,
        new_approved_seconds,
        new_earned,
        old_earned,
        status,
    })
}

/// Close an Open session using the canonical caps and cumulative earnings.
/// Clears `active_session_index`. No SPL movement.
pub fn apply_hourly_session_close(
    contract: &mut Contract,
    state: &mut HourlyState,
    session: &mut HourlySession,
    now: i64,
    work_log_uri: String,
    work_log_hash: [u8; 32],
) -> Result<HourlySessionCredit> {
    require!(
        session.status == HourlySessionStatus::Open,
        StreamPayV2Error::HourlySessionAlreadyRecorded
    );
    require!(
        state.has_active_session(),
        StreamPayV2Error::NoActiveHourlySession
    );
    require!(
        session.index == state.active_session_index,
        StreamPayV2Error::InvalidHourlySession
    );

    let credit = compute_hourly_session_credit(
        state.hourly_rate,
        state.authorized_seconds,
        state.approved_seconds,
        session.started_at,
        now,
        contract.end_time,
        state.min_session_seconds,
        state.max_session_seconds,
    )?;

    session.stopped_at = now;
    session.duration_seconds = credit.credited_duration;
    session.status = credit.status;
    session.work_log_uri = work_log_uri;
    session.work_log_hash = work_log_hash;

    state.approved_seconds = credit.new_approved_seconds;
    state.active_session_index = HOURLY_NO_ACTIVE_SESSION;

    if credit.release_delta > 0 {
        contract.credit_hourly_main_release(credit.release_delta)?;
    }
    Ok(credit)
}

pub fn require_hourly_state_account(
    contract: &Pubkey,
    state: &HourlyState,
    state_key: &Pubkey,
    program_id: &Pubkey,
) -> Result<()> {
    require_keys_eq!(state.contract, *contract, StreamPayV2Error::InvalidHourlyState);
    let (expected, _) = derive_hourly_state_address(contract, program_id);
    require_keys_eq!(*state_key, expected, StreamPayV2Error::InvalidHourlyState);
    Ok(())
}

pub fn require_hourly_session_account(
    contract: &Pubkey,
    session: &HourlySession,
    session_key: &Pubkey,
    index: u32,
    program_id: &Pubkey,
) -> Result<()> {
    require_keys_eq!(
        session.contract,
        *contract,
        StreamPayV2Error::InvalidHourlySession
    );
    require!(session.index == index, StreamPayV2Error::InvalidHourlySession);
    let (expected, _) = derive_hourly_session_address(contract, index, program_id);
    require_keys_eq!(
        *session_key,
        expected,
        StreamPayV2Error::InvalidHourlySession
    );
    Ok(())
}

/// `[hourly_state, contract]`
pub fn derive_hourly_state_address(contract: &Pubkey, program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[HOURLY_STATE_SEED, contract.as_ref()], program_id)
}

/// `[hourly_session, contract, session_index_le]`
pub fn derive_hourly_session_address(
    contract: &Pubkey,
    session_index: u32,
    program_id: &Pubkey,
) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            HOURLY_SESSION_SEED,
            contract.as_ref(),
            &session_index.to_le_bytes(),
        ],
        program_id,
    )
}

#[cfg(test)]
mod tests {
    use super::{
        canonical_hourly_earned, compute_hourly_session_credit, derive_hourly_session_address,
        derive_hourly_state_address,
    };
    use crate::v2::enums::HourlySessionStatus;
    use crate::ID;
    use anchor_lang::prelude::Pubkey;

    /// 6-decimal token: 1 token = 1_000_000 base units.
    const TOKEN: u64 = 1_000_000;

    #[test]
    fn six_decimal_worked_examples() {
        let ten_per_hour = 10 * TOKEN;
        assert_eq!(canonical_hourly_earned(ten_per_hour, 1_800).unwrap(), 5 * TOKEN);
        assert_eq!(canonical_hourly_earned(ten_per_hour, 3_600).unwrap(), 10 * TOKEN);
        assert_eq!(
            canonical_hourly_earned(ten_per_hour, 4_800).unwrap(),
            13_333_333
        );
        assert_eq!(
            canonical_hourly_earned(25 * TOKEN, 27_000).unwrap(),
            187_500_000
        );
        assert_eq!(
            canonical_hourly_earned(ten_per_hour, 72_000).unwrap(),
            200 * TOKEN
        );
    }

    #[test]
    fn zero_seconds_or_rate_is_zero() {
        assert_eq!(canonical_hourly_earned(10 * TOKEN, 0).unwrap(), 0);
        assert_eq!(canonical_hourly_earned(0, 3_600).unwrap(), 0);
        assert_eq!(canonical_hourly_earned(0, 0).unwrap(), 0);
    }

    #[test]
    fn cumulative_floor_does_not_sum_per_session_dust() {
        let rate = 10 * TOKEN;
        let twenty_min = canonical_hourly_earned(rate, 1_200).unwrap();
        assert_eq!(twenty_min, 3_333_333);
        let naive_three_sessions = twenty_min.checked_mul(3).unwrap();
        assert_eq!(naive_three_sessions, 9_999_999);
        let cumulative_hour = canonical_hourly_earned(rate, 3_600).unwrap();
        assert_eq!(cumulative_hour, 10 * TOKEN);
        assert!(cumulative_hour > naive_three_sessions);
    }

    #[test]
    fn overflow_is_an_error() {
        assert!(canonical_hourly_earned(u64::MAX, u64::MAX).is_err());
    }

    #[test]
    fn hourly_state_pda_is_deterministic() {
        let contract = Pubkey::new_from_array([7u8; 32]);
        let (a, bump_a) = derive_hourly_state_address(&contract, &ID);
        let (b, bump_b) = derive_hourly_state_address(&contract, &ID);
        assert_eq!(a, b);
        assert_eq!(bump_a, bump_b);
        let other = Pubkey::new_from_array([8u8; 32]);
        let (c, _) = derive_hourly_state_address(&other, &ID);
        assert_ne!(a, c);
    }

    #[test]
    fn hourly_session_pda_differs_by_index() {
        let contract = Pubkey::new_from_array([3u8; 32]);
        let (s0, _) = derive_hourly_session_address(&contract, 0, &ID);
        let (s1, _) = derive_hourly_session_address(&contract, 1, &ID);
        let (s0_again, _) = derive_hourly_session_address(&contract, 0, &ID);
        assert_eq!(s0, s0_again);
        assert_ne!(s0, s1);
        let (state, _) = derive_hourly_state_address(&contract, &ID);
        assert_ne!(state, s0);
        assert_ne!(state, s1);
    }

    #[test]
    fn short_session_voids_when_authorized_remainder_meets_minimum() {
        let credit = compute_hourly_session_credit(
            10 * TOKEN,
            3_600,
            0,
            1_000,
            1_030,
            10_000,
            60,
            28_800,
        )
        .unwrap();
        assert_eq!(credit.status, HourlySessionStatus::Void);
        assert_eq!(credit.credited_duration, 0);
        assert_eq!(credit.release_delta, 0);
        assert_eq!(credit.new_approved_seconds, 0);
    }

    #[test]
    fn final_short_remainder_is_recorded() {
        let credit = compute_hourly_session_credit(
            10 * TOKEN,
            3_600,
            3_570,
            1_000,
            1_030,
            10_000,
            60,
            28_800,
        )
        .unwrap();
        assert_eq!(credit.status, HourlySessionStatus::Recorded);
        assert_eq!(credit.credited_duration, 30);
        assert_eq!(credit.new_approved_seconds, 3_600);
    }

    #[test]
    fn forgotten_timer_caps_at_eight_hours() {
        let start = 1_000i64;
        let now = start + 10 * 3_600;
        let credit = compute_hourly_session_credit(
            10 * TOKEN,
            100_000,
            0,
            start,
            now,
            start + 200_000,
            60,
            28_800,
        )
        .unwrap();
        assert_eq!(credit.credited_duration, 28_800);
        assert_eq!(credit.status, HourlySessionStatus::Recorded);
        assert_eq!(
            credit.new_earned,
            canonical_hourly_earned(10 * TOKEN, 28_800).unwrap()
        );
    }

    #[test]
    fn authorized_seconds_cap_beats_elapsed() {
        let credit = compute_hourly_session_credit(
            10 * TOKEN,
            1_800,
            0,
            1_000,
            1_000 + 10_000,
            1_000 + 50_000,
            60,
            28_800,
        )
        .unwrap();
        assert_eq!(credit.credited_duration, 1_800);
    }

    #[test]
    fn engagement_window_caps_elapsed() {
        let start = 1_000i64;
        let end = start + 1_200;
        let credit = compute_hourly_session_credit(
            10 * TOKEN,
            100_000,
            0,
            start,
            start + 10_000,
            end,
            60,
            28_800,
        )
        .unwrap();
        assert_eq!(credit.credited_duration, 1_200);
    }

    #[test]
    fn cumulative_credit_is_not_per_session_floor() {
        let rate = 10 * TOKEN;
        let first = compute_hourly_session_credit(rate, 3_600, 0, 0, 1_200, 10_000, 60, 28_800)
            .unwrap();
        assert_eq!(first.credited_duration, 1_200);
        assert_eq!(first.release_delta, 3_333_333);
        let second =
            compute_hourly_session_credit(rate, 3_600, 1_200, 0, 1_200, 10_000, 60, 28_800)
                .unwrap();
        assert_eq!(second.credited_duration, 1_200);
        assert_eq!(second.release_delta, 3_333_333);
        let third =
            compute_hourly_session_credit(rate, 3_600, 2_400, 0, 1_200, 10_000, 60, 28_800)
                .unwrap();
        assert_eq!(third.release_delta, 3_333_334);
        assert_eq!(
            first.release_delta + second.release_delta + third.release_delta,
            10 * TOKEN
        );
    }
}
