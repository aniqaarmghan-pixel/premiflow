//! V2 account state.
//!
//! Two account types, both entirely separate from V1's `Stream`:
//!
//! - [`Contract`]: the authoritative payment agreement between an employer and
//!   a freelancer.
//! - [`WorkUnit`]: a child of a contract representing one reviewable unit of
//!   work — a streaming checkpoint, a milestone, or a fixed deliverable.

pub mod contract;
pub mod work_unit;

pub use contract::*;
pub use work_unit::*;

#[cfg(test)]
mod tests {
    use super::{Contract, WorkUnit};
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
    }
}
