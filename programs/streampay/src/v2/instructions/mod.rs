//! V2 instruction handlers.
//!
//! One module per instruction. Each module owns its `Accounts` context, its
//! argument type, and its handler, so the accounts a given instruction can
//! touch are visible in one place.

pub mod add_milestone;
pub mod create_contract;
pub mod finalize_terms;

// Glob re-exports are required rather than stylistic: `#[derive(Accounts)]`
// generates hidden client/CPI modules that `#[program]` resolves through the
// crate root, so naming the public types individually is not sufficient.
//
// That means every name in these modules lands at the crate root, which is why
// each handler is named after its instruction instead of a shared `handler` —
// three modules exporting `handler` would make the name ambiguous here, and
// would get worse with every phase.
pub use add_milestone::*;
pub use create_contract::*;
pub use finalize_terms::*;
