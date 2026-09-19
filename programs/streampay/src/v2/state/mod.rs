//! V2 account state.
//!
//! Account types, all entirely separate from V1's `Stream`:
//!
//! - [`Contract`]: the authoritative payment agreement between an employer and
//!   a freelancer. Layout is frozen at `CONTRACT_INIT_SPACE` (621).
//! - [`WorkUnit`]: a child of a contract representing one reviewable unit of
//!   work — a streaming checkpoint, a milestone, or a fixed deliverable.
//! - [`HourlyState`] / [`HourlySession`]: Hourly-only PDAs. Existing
//!   Fixed/Milestone/Streaming contracts never allocate these.

pub mod contract;
pub mod hourly_session;
pub mod hourly_state;
pub mod work_unit;

pub use contract::*;
pub use hourly_session::*;
pub use hourly_state::*;
pub use work_unit::*;

#[cfg(test)]
mod tests {
    use super::{
        Contract, HourlySession, HourlyState, WorkUnit, CONTRACT_INIT_SPACE,
        HOURLY_SESSION_INIT_SPACE, HOURLY_STATE_INIT_SPACE, WORK_UNIT_INIT_SPACE,
    };
    use crate::Stream;
    use anchor_lang::Discriminator;

    /// V1's account discriminator is a frozen wire interface; it matches the
    /// checked-in IDL and every deployed V1 `Stream` account.
    #[test]
    fn v1_stream_discriminator_is_unchanged() {
        assert_eq!(
            Stream::DISCRIMINATOR,
            [166, 224, 59, 4, 202, 10, 186, 83].as_slice()
        );
    }

    /// V1's serialized layout is 146 bytes (8-byte discriminator + 138 of
    /// Borsh payload), which is what the frontend's account filter and every
    /// deployed V1 account depend on.
    #[test]
    fn v1_stream_serialized_size_is_unchanged() {
        use anchor_lang::prelude::Pubkey;
        use anchor_lang::AnchorSerialize;

        let stream = Stream {
            employer: Pubkey::default(),
            worker: Pubkey::default(),
            token_mint: Pubkey::default(),
            stream_id: 0,
            total_amount: 0,
            withdrawn_amount: 0,
            is_cancelled: false,
            start_time: 0,
            end_time: 0,
            bump: 0,
        };

        let mut serialized: Vec<u8> = Vec::new();
        stream
            .serialize(&mut serialized)
            .expect("Stream must serialize");

        assert_eq!(serialized.len(), 138);
        assert_eq!(8 + serialized.len(), 146);
    }

    /// The V2 account types must never be confusable with V1's, nor with each
    /// other, so that passing one where another is expected fails on the
    /// discriminator check.
    #[test]
    fn v2_discriminators_are_distinct() {
        assert_ne!(Contract::DISCRIMINATOR, Stream::DISCRIMINATOR);
        assert_ne!(WorkUnit::DISCRIMINATOR, Stream::DISCRIMINATOR);
        assert_ne!(Contract::DISCRIMINATOR, WorkUnit::DISCRIMINATOR);
        assert_ne!(HourlyState::DISCRIMINATOR, Contract::DISCRIMINATOR);
        assert_ne!(HourlyState::DISCRIMINATOR, WorkUnit::DISCRIMINATOR);
        assert_ne!(HourlySession::DISCRIMINATOR, HourlyState::DISCRIMINATOR);
        assert_ne!(HourlySession::DISCRIMINATOR, Contract::DISCRIMINATOR);
        assert_ne!(HourlySession::DISCRIMINATOR, WorkUnit::DISCRIMINATOR);
    }

    #[test]
    fn v2_init_space_is_frozen() {
        assert_eq!(CONTRACT_INIT_SPACE, 621);
        assert_eq!(WORK_UNIT_INIT_SPACE, 406);
        assert_eq!(HOURLY_STATE_INIT_SPACE, 146);
        assert_eq!(HOURLY_SESSION_INIT_SPACE, 331);
        assert_eq!(
            <Contract as anchor_lang::Space>::INIT_SPACE,
            CONTRACT_INIT_SPACE
        );
        assert_eq!(
            <WorkUnit as anchor_lang::Space>::INIT_SPACE,
            WORK_UNIT_INIT_SPACE
        );
        assert_eq!(
            <HourlyState as anchor_lang::Space>::INIT_SPACE,
            HOURLY_STATE_INIT_SPACE
        );
        assert_eq!(
            <HourlySession as anchor_lang::Space>::INIT_SPACE,
            HOURLY_SESSION_INIT_SPACE
        );
    }
}
