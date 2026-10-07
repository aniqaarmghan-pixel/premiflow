//! Platform fee accounting for Fixed and Milestone contracts.
//!
//! Business rule: the employer pays the platform fee on top of the agreed
//! principal; the freelancer always receives 100% of the principal. The fee is
//! reserved in escrow at funding time and is only *earned* in proportion to
//! principal actually released to the freelancer. Whatever is not earned goes
//! back to the employer alongside their principal refund.
//!
//! All math is integer-only (u128 intermediates, checked u64 results).
//!
//! Rounding (documented, one rule everywhere): `fee_on(x) = floor(x * bps /
//! 10_000)`. The reserve uses the same function on the full principal, so
//! `fee_on(total)` is exactly what a full release earns and a full release
//! drains the reserve to zero. Floor rounding favours the employer.
//!
//! Cumulative formulas (no drift, independent of claim order or chunking):
//! - earned after cumulative freelancer withdrawals `W`: `fee_on(W)`; each
//!   withdrawal pays the treasury `fee_on(W_new) - fee_paid`.
//! - unearned returned after cumulative employer refunds `R`:
//!   `reserve - fee_on(total - R)`; each refund returns the delta.
//!   Because `W <= total - R`, `fee_on(W) + (reserve - fee_on(total - R))
//!   <= reserve` always, with equality once both sides are fully claimed.

use anchor_lang::prelude::Pubkey;

use crate::v2::constants::FEE_CONFIG_SEED;

/// Basis-point denominator.
pub const FEE_BPS_DENOMINATOR: u64 = 10_000;
/// Hard cap enforced on-chain for any configured fee (10%).
pub const MAX_FEE_BPS: u16 = 1_000;
/// The launch platform fee: 3%.
pub const DEFAULT_PLATFORM_FEE_BPS: u16 = 300;

/// Canonical singleton FeeConfig PDA.
pub fn fee_config_pda() -> (Pubkey, u8) {
    Pubkey::find_program_address(&[FEE_CONFIG_SEED], &crate::ID)
}

/// `floor(amount * fee_bps / 10_000)`. `None` if bps exceeds 100% (never
/// configurable) or on overflow (impossible for bps <= 10_000).
pub fn fee_on(amount: u64, fee_bps: u16) -> Option<u64> {
    if u64::from(fee_bps) > FEE_BPS_DENOMINATOR {
        return None;
    }
    let scaled = u128::from(amount).checked_mul(u128::from(fee_bps))?;
    u64::try_from(scaled / u128::from(FEE_BPS_DENOMINATOR)).ok()
}

/// Fee reserve deposited at funding for `principal`.
pub fn fee_reserve_for(principal: u64, fee_bps: u16) -> Option<u64> {
    fee_on(principal, fee_bps)
}

/// Total the employer deposits: principal + reserve.
pub fn employer_total(principal: u64, fee_bps: u16) -> Option<u64> {
    principal.checked_add(fee_reserve_for(principal, fee_bps)?)
}

/// Fee to move to the treasury when cumulative freelancer withdrawals reach
/// `new_withdrawn`. `None` if that would exceed the reserve or underflow.
pub fn fee_due_on_release(
    new_withdrawn: u64,
    fee_paid: u64,
    fee_reserve: u64,
    fee_bps: u16,
) -> Option<u64> {
    let owed = fee_on(new_withdrawn, fee_bps)?;
    if owed > fee_reserve {
        return None;
    }
    owed.checked_sub(fee_paid)
}

/// Cumulative unearned fee returned once employer refunds total `refunded`.
pub fn unearned_fee_returned(
    total_principal: u64,
    refunded: u64,
    fee_reserve: u64,
    fee_bps: u16,
) -> Option<u64> {
    let still_payable = total_principal.checked_sub(refunded)?;
    fee_reserve.checked_sub(fee_on(still_payable, fee_bps)?)
}

/// Unearned fee to return with a refund moving cumulative refunds from
/// `old_refunded` to `new_refunded`.
pub fn fee_refund_due(
    total_principal: u64,
    old_refunded: u64,
    new_refunded: u64,
    fee_reserve: u64,
    fee_bps: u16,
) -> Option<u64> {
    let after = unearned_fee_returned(total_principal, new_refunded, fee_reserve, fee_bps)?;
    let before = unearned_fee_returned(total_principal, old_refunded, fee_reserve, fee_bps)?;
    after.checked_sub(before)
}

#[cfg(test)]
mod tests {
    use super::*;

    const BPS: u16 = DEFAULT_PLATFORM_FEE_BPS;

    #[test]
    fn hundred_principal_costs_employer_103() {
        assert_eq!(fee_on(100, BPS), Some(3));
        assert_eq!(employer_total(100, BPS), Some(103));
        // Full release: freelancer 100, treasury 3, reserve drained.
        assert_eq!(fee_due_on_release(100, 0, 3, BPS), Some(3));
    }

    #[test]
    fn rounding_is_floor_for_odd_and_tiny_amounts() {
        assert_eq!(fee_on(1, BPS), Some(0));
        assert_eq!(fee_on(33, BPS), Some(0));
        assert_eq!(fee_on(34, BPS), Some(1));
        assert_eq!(fee_on(333, BPS), Some(9));
        assert_eq!(fee_on(999_999, BPS), Some(29_999));
        assert_eq!(employer_total(1, BPS), Some(1));
        assert_eq!(fee_on(0, BPS), Some(0));
        assert_eq!(fee_on(12_345, 0), Some(0));
    }

    #[test]
    fn large_u64_is_exact_and_total_overflow_is_checked() {
        let max = u64::MAX;
        let expected = ((max as u128) * 300 / 10_000) as u64;
        assert_eq!(fee_on(max, BPS), Some(expected));
        assert_eq!(employer_total(max, BPS), None);
        let big = u64::MAX / 2;
        assert_eq!(
            employer_total(big, BPS),
            Some(big + ((big as u128) * 300 / 10_000) as u64)
        );
        assert_eq!(fee_on(1, 10_001), None);
    }

    #[test]
    fn chunked_releases_sum_exactly_to_reserve() {
        for total in [1u64, 7, 33, 100, 101, 333, 1_000_003, u64::MAX / 3] {
            let reserve = fee_reserve_for(total, BPS).unwrap();
            let mut paid = 0u64;
            let mut withdrawn = 0u64;
            let step = (total / 7).max(1);
            while withdrawn < total {
                withdrawn = (withdrawn + step).min(total);
                let due = fee_due_on_release(withdrawn, paid, reserve, BPS).unwrap();
                paid += due;
            }
            assert_eq!(paid, reserve, "total {total}");
        }
    }

    #[test]
    fn release_then_refund_split_conserves_reserve() {
        for total in [1u64, 100, 333, 1_000, 999_999_937] {
            let reserve = fee_reserve_for(total, BPS).unwrap();
            for freelancer_share in [0, 1, total / 3, total / 2, total - 1, total] {
                let employer_share = total - freelancer_share;
                let to_treasury =
                    fee_due_on_release(freelancer_share, 0, reserve, BPS).unwrap();
                // Employer refund in two chunks.
                let half = employer_share / 2;
                let r1 = fee_refund_due(total, 0, half, reserve, BPS).unwrap();
                let r2 = fee_refund_due(total, half, employer_share, reserve, BPS).unwrap();
                assert_eq!(to_treasury + r1 + r2, reserve, "total {total} f {freelancer_share}");
            }
        }
    }

    #[test]
    fn full_refund_returns_whole_reserve() {
        let reserve = fee_reserve_for(100, BPS).unwrap();
        assert_eq!(fee_refund_due(100, 0, 100, reserve, BPS), Some(3));
    }

    #[test]
    fn over_release_is_rejected() {
        let reserve = fee_reserve_for(100, BPS).unwrap();
        assert_eq!(fee_due_on_release(200, 0, reserve, BPS), None);
        assert_eq!(fee_refund_due(100, 0, 101, reserve, BPS), None);
    }

    #[test]
    fn max_fee_bps_is_ten_percent() {
        assert_eq!(MAX_FEE_BPS, 1_000);
        assert_eq!(fee_on(100, MAX_FEE_BPS), Some(10));
    }
}
