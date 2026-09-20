//! V2 instruction handlers.
//!
//! One module per instruction. Each module owns its `Accounts` context, its
//! argument type, and its handler, so the accounts a given instruction can
//! touch are visible in one place.

pub mod accept_contract;
pub mod add_milestone;
pub mod approve_activation;
pub mod approve_trial_and_activate;
pub mod approve_work_unit;
pub mod cancel_active_contract;
pub mod claim_employer_refund;
pub mod complete_contract;
pub mod create_contract;
pub mod create_hourly_contract;
pub mod create_shared;
pub mod decline_contract;
pub mod end_hourly_contract;
pub mod expire_acceptance;
pub mod expire_activation;
pub mod finalize_review_timeout;
pub mod finalize_terms;
pub mod open_dispute;
pub mod reject_activation;
pub mod release_stream_accrual;
pub mod request_revision;
pub mod request_trial_revision;
pub mod resolve_dispute;
pub mod settle_trial_and_end;
pub mod start_hourly_session;
pub mod stop_hourly_session;
pub mod submit_trial_work;
pub mod submit_work_unit;
pub mod void_stale_revision;
pub mod withdraw_freelancer;

// Glob re-exports are required: `#[derive(Accounts)]` generates hidden
// client/CPI modules that `#[program]` resolves through the crate root.
pub use accept_contract::*;
pub use add_milestone::*;
pub use approve_activation::*;
pub use approve_trial_and_activate::*;
pub use approve_work_unit::*;
pub use cancel_active_contract::*;
pub use claim_employer_refund::*;
pub use complete_contract::*;
pub use create_contract::*;
pub use create_hourly_contract::*;
pub use decline_contract::*;
pub use end_hourly_contract::*;
pub use expire_acceptance::*;
pub use expire_activation::*;
pub use finalize_review_timeout::*;
pub use finalize_terms::*;
pub use open_dispute::*;
pub use reject_activation::*;
pub use release_stream_accrual::*;
pub use request_revision::*;
pub use request_trial_revision::*;
pub use resolve_dispute::*;
pub use settle_trial_and_end::*;
pub use start_hourly_session::*;
pub use stop_hourly_session::*;
pub use submit_trial_work::*;
pub use submit_work_unit::*;
pub use void_stale_revision::*;
pub use withdraw_freelancer::*;
