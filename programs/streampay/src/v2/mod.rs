//! StreamPay V2: programmable freelance payment contracts.
//!
//! V2 lives in its own module tree and its own PDA namespace. It shares the
//! program ID with V1 but touches none of V1's accounts, seeds, instructions,
//! or error codes. The V1 `Stream` implementation remains in `lib.rs`
//! untouched; see `constants` for the disjoint V2 seed namespace.
//!
//! Phase 0 contains data types only. No V2 instruction exists yet and no V2
//! account is ever created on-chain by this code.

pub mod constants;
pub mod enums;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

pub use constants::*;
pub use enums::*;
pub use errors::*;
pub use events::*;
pub use instructions::*;
pub use state::*;
