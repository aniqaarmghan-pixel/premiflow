//! Hourly architecture helpers for H1.
//!
//! Canonical earnings math and PDA derivation. No instruction uses these yet:
//! Start/Stop/create-hourly belong to H2. Existing Fixed/Milestone/Streaming
//! settlement continues to use `canonical_stream_accrued` and WorkUnits.

use anchor_lang::prelude::*;

use crate::v2::constants::{HOURLY_SESSION_SEED, HOURLY_STATE_SEED};
use crate::v2::errors::StreamPayV2Error;

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
        canonical_hourly_earned, derive_hourly_session_address, derive_hourly_state_address,
    };
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
}
