//! `finalize_terms`: the employer closes a milestone contract's definition and
//! puts it in front of the freelancer.
//!
//! This is the point at which the offer becomes immutable. Before it, the
//! employer may keep adding milestones; after it, `add_milestone` rejects,
//! because the contract is no longer a draft. There is deliberately no
//! `edit_milestone` instruction: whatever the freelancer reads when deciding to
//! accept must be exactly what they are agreeing to, and an employer who made a
//! mistake should have to withdraw the offer through the cancellation lifecycle
//! rather than silently rewrite terms under review.
//!
//! The gate is `allocated_amount == total_amount` exactly. Under-allocation
//! would offer a contract whose escrow holds money no milestone can ever claim,
//! leaving funds stranded until a refund. Over-allocation would promise more
//! than the escrow holds, and is already unrepresentable because
//! `add_milestone` rejects it.
//!
//! No tokens move in this instruction. It touches no lamports either — the
//! employer does not even need to be mutable.

use anchor_lang::prelude::*;

use crate::v2::constants::CONTRACT_SEED;
use crate::v2::enums::{ContractStatus, PaymentMode};
use crate::v2::errors::StreamPayV2Error;
use crate::v2::events::TermsFinalized;
use crate::v2::state::Contract;

#[derive(Accounts)]
pub struct FinalizeTerms<'info> {
    pub employer: Signer<'info>,

    /// Same two checks as `add_milestone`: the account is a real contract at
    /// its canonical PDA, and the signer is its employer.
    #[account(
        mut,
        has_one = employer @ StreamPayV2Error::Unauthorized,
        seeds = [
            CONTRACT_SEED,
            employer.key().as_ref(),
            contract.freelancer.as_ref(),
            &contract.contract_id.to_le_bytes(),
        ],
        bump = contract.bump,
    )]
    pub contract: Account<'info, Contract>,
}

pub fn handle_finalize_terms(ctx: Context<FinalizeTerms>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let contract = &ctx.accounts.contract;

    match contract.payment_mode {
        PaymentMode::Milestone => {}
        PaymentMode::Streaming => return Err(StreamPayV2Error::StreamingHasNoMilestones.into()),
        PaymentMode::Fixed => return Err(StreamPayV2Error::InvalidPaymentMode.into()),
    }

    // Only a draft can be finalized, which is also what makes re-finalization
    // impossible: the first call leaves the contract `PendingAcceptance`.
    require!(
        contract.status.allows_term_changes(),
        StreamPayV2Error::InvalidState
    );

    // Finalizing an already-dead offer would present the freelancer with terms
    // they cannot act on.
    require!(
        now < contract.acceptance_deadline,
        StreamPayV2Error::AcceptanceExpired
    );

    // A contract with no deliverables would be accepted terms that specify no
    // work, with the entire escrow unclaimable.
    require!(contract.work_unit_count > 0, StreamPayV2Error::NoMilestones);

    // Exact equality. `add_milestone` already prevents the greater-than case, so
    // in practice this rejects under-allocation.
    require!(
        contract.allocated_amount == contract.total_amount,
        StreamPayV2Error::MilestoneAllocationIncomplete
    );

    let contract_key = contract.key();
    let employer_key = contract.employer;
    let work_unit_count = contract.work_unit_count;
    let total_amount = contract.total_amount;

    let contract = &mut ctx.accounts.contract;
    contract.status = ContractStatus::PendingAcceptance;

    emit!(TermsFinalized {
        contract: contract_key,
        employer: employer_key,
        work_unit_count,
        total_amount,
        finalized_at: now,
    });

    Ok(())
}
