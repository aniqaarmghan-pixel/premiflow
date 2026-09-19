//! StreamPay V2: programmable freelance payment contracts.
//!
//! V2 lives in its own module tree and its own PDA namespace. It shares the
//! program ID with V1 but touches none of V1's accounts, seeds, instructions,
//! or error codes. The V1 `Stream` implementation remains in `lib.rs`
//! untouched; see `constants` for the disjoint V2 seed namespace.
//!
//! V2 instructions live in `instructions/` and are registered from `lib.rs`.
//! They share the program ID with V1 but none of its accounts or seeds.

pub mod constants;
pub mod enums;
pub mod errors;
pub mod events;
pub mod hourly;
pub mod instructions;
pub mod state;

pub use constants::*;
pub use enums::*;
pub use errors::*;
pub use events::*;
pub use hourly::*;
pub use instructions::*;
pub use state::*;
