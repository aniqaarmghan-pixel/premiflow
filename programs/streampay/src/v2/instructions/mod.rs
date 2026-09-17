//! V2 instruction handlers.
//!
//! One module per instruction. Each module owns its `Accounts` context, its
//! argument type, and its handler, so the accounts a given instruction can
//! touch are visible in one place.

pub mod create_contract;

pub use create_contract::*;
