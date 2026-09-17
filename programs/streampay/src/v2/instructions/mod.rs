//! V2 instruction handlers.
//!
//! One module per instruction. Each module owns its `Accounts` context, its
//! argument type, and its handler, so the accounts a given instruction can
//! touch are visible in one place.

pub mod accept_contract;
pub mod add_milestone;
pub mod approve_activation;
pub mod create_contract;
pub mod decline_contract;
pub mod finalize_terms;
pub mod reject_activation;

// Glob re-exports are required: `#[derive(Accounts)]` generates hidden
// client/CPI modules that `#[program]` resolves through the crate root.
pub use accept_contract::*;
pub use add_milestone::*;
pub use approve_activation::*;
pub use create_contract::*;
pub use decline_contract::*;
pub use finalize_terms::*;
pub use reject_activation::*;
