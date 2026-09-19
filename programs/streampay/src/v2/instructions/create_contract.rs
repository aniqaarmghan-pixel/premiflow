//! `create_contract`: the employer opens a funded contract and offers it.
//!
//! This is the only way a `Contract` comes into existence. It performs three
//! things atomically: it validates and freezes the negotiated terms, it creates
//! the contract's own escrow token account, and it moves the entire
//! `total_amount` from the employer into that escrow.
//!
//! Full funding up front is the core promise of the product: a freelancer
//! deciding whether to accept can verify on-chain that the money already exists
//! and is no longer under the employer's unilateral control.
//!
//! What this instruction deliberately does not do:
//!
//! - It does not start the earning clock. The contract is left un-started and
//!   `status` says so. Freelancer acceptance and employer activation are later,
//!   separate instructions; only activation establishes `start_time`.
//! - It does not require the freelancer's signature. Consent is a separate,
//!   explicit act (`accept_contract`), which is what makes the freelancer's
//!   agreement to the terms meaningful.
//! - It releases nothing. `released_amount` starts at zero and only an approval
//!   or a review timeout can ever raise it.

use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::v2::constants::{
    CONTRACT_ESCROW_SEED, CONTRACT_SEED, MAX_CHECKPOINTS, TRIAL_UNIT_SEED, V2_LAYOUT_VERSION,
    WORK_UNIT_SEED,
};
use crate::v2::enums::{ContractStatus, DisputeParty, PaymentMode, StartMode};
use crate::v2::errors::StreamPayV2Error;
use crate::v2::events::{ContractCreated, TrialConfigured};
use crate::v2::instructions::create_shared::{
    fund_contract_escrow, prove_on_activation_end_fits, validate_common_offer_terms,
    validate_parties_and_resolver,
};
use crate::v2::state::{Contract, WorkUnit};

/// Caller-supplied terms.
///
/// Grouped into a struct rather than a dozen positional parameters so that
/// adding a term in a later phase cannot silently shift an existing argument's
/// meaning at the call site.
///
/// Every field here is a *term*. No lifecycle or accounting field is accepted
/// from the caller: `status`, all five money counters, all unit counters, every
/// lifecycle timestamp and both bumps are derived by the handler below.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct CreateContractArgs {
    /// Employer-scoped identifier. Part of the PDA seeds, so reusing one for
    /// the same freelancer is rejected by the runtime, not by a check here.
    pub contract_id: u64,

    pub payment_mode: PaymentMode,
    pub start_mode: StartMode,

    /// Funded in full during this instruction.
    pub total_amount: u64,

    /// Latest instant the freelancer may accept.
    pub acceptance_deadline: i64,

    /// Only meaningful when `start_mode == Scheduled`; normalized away
    /// otherwise. See `resolve`.
    pub scheduled_start_time: i64,

    /// Length of the contract term, in seconds.
    pub duration_seconds: i64,

    /// Only meaningful when `payment_mode == Streaming`; normalized away
    /// otherwise. See `resolve`.
    pub checkpoint_interval: i64,

    /// Employer review window, and equally the freelancer's resubmission
    /// window.
    pub review_duration: i64,

    /// How long the employer has after freelancer acceptance to approve
    /// activation. Does not start the stream by itself.
    pub activation_review_duration: i64,

    pub max_revisions: u8,

    /// Paid pre-activation trial reservation, included in `total_amount`.
    /// Zero means no trial. Must be strictly less than `total_amount` so the
    /// main contract retains a positive economic base.
    pub trial_amount: u64,

    /// Per-contract dispute resolver. Must differ from employer, freelancer,
    /// and the default pubkey. Frozen at creation.
    pub resolver: Pubkey,

    /// Bounded reference to the off-chain contract record.
    pub metadata_uri: String,

    /// Hash of that record, making it tamper-evident.
    pub metadata_hash: [u8; 32],
}

/// Terms after validation, with mode-dependent fields resolved.
///
/// Returning these from validation rather than reading `args` directly in the
/// handler makes it structurally impossible to persist a value that validation
/// decided was meaningless.
struct ResolvedTerms {
    status: ContractStatus,
    scheduled_start_time: i64,
    checkpoint_interval: i64,
    trial_amount: u64,
    main_amount: u64,
}

impl CreateContractArgs {
    /// Validates every term against the approved bounds and resolves the
    /// mode-dependent ones.
    ///
    /// Fields that a given mode does not use are normalized to zero rather than
    /// stored as supplied. This is not a sentinel: `payment_mode` and
    /// `start_mode` remain the sole authority on whether a field is read at
    /// all. Normalizing simply guarantees the persisted state is coherent even
    /// if a client sends junk in an inapplicable field.
    fn resolve(&self, now: i64) -> Result<ResolvedTerms> {
        require!(self.total_amount > 0, StreamPayV2Error::InvalidAmount);

        validate_common_offer_terms(
            now,
            &self.metadata_uri,
            self.acceptance_deadline,
            self.duration_seconds,
            self.review_duration,
            self.max_revisions,
            self.activation_review_duration,
        )?;

        let scheduled_start_time = self.resolve_start()?;
        let (status, checkpoint_interval) = self.resolve_payment_mode()?;
        let (trial_amount, main_amount) = self.resolve_trial()?;

        Ok(ResolvedTerms {
            status,
            scheduled_start_time,
            checkpoint_interval,
            trial_amount,
            main_amount,
        })
    }

    /// Trial compensation is reserved from the funded total. Zero is "no trial".
    /// A trial equal to the whole escrow would leave the main contract with
    /// nothing to pay, which is not a main contract.
    fn resolve_trial(&self) -> Result<(u64, u64)> {
        if self.trial_amount == 0 {
            return Ok((0, self.total_amount));
        }
        require!(
            self.trial_amount < self.total_amount,
            StreamPayV2Error::InvalidTrialAmount
        );
        let main_amount = self
            .total_amount
            .checked_sub(self.trial_amount)
            .ok_or(StreamPayV2Error::ArithmeticOverflow)?;
        Ok((self.trial_amount, main_amount))
    }

    /// Resolves `scheduled_start_time`, and proves up front that the `end_time`
    /// computed at activation cannot overflow. Checking that here rather than in
    /// `approve_activation` means a contract can never be created in a state that
    /// makes activation impossible.
    fn resolve_start(&self) -> Result<i64> {
        match self.start_mode {
            StartMode::OnActivation => {
                // Latest possible start is a last-second acceptance followed by
                // a last-second activation. Bound that worst case.
                prove_on_activation_end_fits(
                    self.acceptance_deadline,
                    self.activation_review_duration,
                    self.duration_seconds,
                )?;

                Ok(0)
            }
            StartMode::Scheduled => {
                // Acceptance must precede the contractual start, otherwise the
                // stream could be due to begin before anyone agreed to it.
                require!(
                    self.scheduled_start_time >= self.acceptance_deadline,
                    StreamPayV2Error::InvalidScheduledStart
                );

                self.scheduled_start_time
                    .checked_add(self.duration_seconds)
                    .ok_or(StreamPayV2Error::ArithmeticOverflow)?;

                Ok(self.scheduled_start_time)
            }
        }
    }

    /// Resolves the checkpoint interval and the status the contract starts in.
    ///
    /// The status difference is the important part. Streaming and Fixed
    /// contracts are complete the moment they are funded, so they are offerable
    /// immediately. A Milestone contract is not: its deliverables and their
    /// amounts do not exist yet, so offering it would ask the freelancer to
    /// accept terms nobody has written. It therefore starts in `Draft`, and
    /// `add_milestone` / `finalize_terms` promote it later.
    fn resolve_payment_mode(&self) -> Result<(ContractStatus, i64)> {
        match self.payment_mode {
            PaymentMode::Streaming => {
                require!(
                    self.checkpoint_interval > 0,
                    StreamPayV2Error::InvalidCheckpointInterval
                );

                // A period longer than the contract itself would leave the
                // freelancer unable to ever close a checkpoint.
                require!(
                    self.checkpoint_interval <= self.duration_seconds,
                    StreamPayV2Error::InvalidCheckpointInterval
                );

                // Checkpoint reviews are serialized, so a review window longer
                // than a period would let reviews queue up faster than they
                // clear and stall the stream.
                require!(
                    self.review_duration <= self.checkpoint_interval,
                    StreamPayV2Error::InvalidReviewDuration
                );

                // ceil(duration / interval): the final period may be partial.
                let checkpoints = self
                    .duration_seconds
                    .checked_add(self.checkpoint_interval)
                    .and_then(|sum| sum.checked_sub(1))
                    .and_then(|sum| sum.checked_div(self.checkpoint_interval))
                    .ok_or(StreamPayV2Error::ArithmeticOverflow)?;

                require!(
                    checkpoints <= i64::from(MAX_CHECKPOINTS),
                    StreamPayV2Error::TooManyCheckpoints
                );

                Ok((ContractStatus::PendingAcceptance, self.checkpoint_interval))
            }

            // One deliverable, one price: the terms are already complete.
            PaymentMode::Fixed => Ok((ContractStatus::PendingAcceptance, 0)),

            // Terms incomplete until milestones are defined and finalized.
            PaymentMode::Milestone => Ok((ContractStatus::Draft, 0)),

            // H1: Hourly create args/state wiring belongs to H2.
            PaymentMode::Hourly => Err(StreamPayV2Error::InvalidPaymentMode.into()),
        }
    }
}

#[derive(Accounts)]
#[instruction(args: CreateContractArgs)]
pub struct CreateContract<'info> {
    /// Pays for both new accounts and funds the escrow, so must be mutable and
    /// must sign.
    #[account(mut)]
    pub employer: Signer<'info>,

    /// CHECK: Used only as an identity — one PDA seed and one stored field.
    /// No data is read from it, so there is nothing to validate. It is
    /// deliberately not a `SystemAccount`: that would require the freelancer's
    /// wallet to already exist on-chain, excluding anyone who has never held
    /// SOL. The freelancer does not sign here; consent happens in
    /// `accept_contract`.
    pub freelancer: UncheckedAccount<'info>,

    pub token_mint: Account<'info, Mint>,

    /// Source of the escrow funding. Constrained rather than trusted: without
    /// `token::authority` an attacker could name a token account they do not
    /// own, and without `token::mint` they could fund the escrow with a
    /// worthless token while the contract claims a valuable one.
    #[account(
        mut,
        token::mint = token_mint,
        token::authority = employer,
    )]
    pub employer_token_account: Account<'info, TokenAccount>,

    /// The contract itself. `init` plus `seeds` means the address is fully
    /// determined by employer, freelancer and `contract_id`, so a forged
    /// contract account cannot be substituted and a duplicate triple is
    /// rejected by the runtime as an already-initialized account.
    #[account(
        init,
        payer = employer,
        space = 8 + Contract::INIT_SPACE,
        seeds = [
            CONTRACT_SEED,
            employer.key().as_ref(),
            freelancer.key().as_ref(),
            &args.contract_id.to_le_bytes(),
        ],
        bump,
    )]
    pub contract: Account<'info, Contract>,

    /// The contract's own escrow, derived from the contract's address and owned
    /// by the contract PDA. Three constraints together make a fake escrow
    /// impossible: `seeds` fixes the address, `token::mint` fixes the asset, and
    /// `token::authority` means only this program signing as the contract PDA
    /// can ever move the funds out.
    #[account(
        init,
        payer = employer,
        seeds = [CONTRACT_ESCROW_SEED, contract.key().as_ref()],
        bump,
        token::mint = token_mint,
        token::authority = contract,
    )]
    pub contract_escrow: Account<'info, TokenAccount>,

    /// Present iff `args.trial_amount > 0`. Initialized at the dedicated
    /// `trial_unit` PDA so it cannot collide with milestone indexes.
    #[account(
        init,
        payer = employer,
        space = 8 + WorkUnit::INIT_SPACE,
        seeds = [TRIAL_UNIT_SEED, contract.key().as_ref()],
        bump,
    )]
    pub trial_work_unit: Option<Box<Account<'info, WorkUnit>>>,

    /// Present iff `args.payment_mode == Fixed`. One main deliverable at
    /// `work_unit` index 0, amount = `main_amount`. The freelancer can inspect
    /// it before accepting. Seeds are independent of the trial PDA.
    #[account(
        init,
        payer = employer,
        space = 8 + WorkUnit::INIT_SPACE,
        seeds = [WORK_UNIT_SEED, contract.key().as_ref(), &0u32.to_le_bytes()],
        bump,
    )]
    pub fixed_work_unit: Option<Box<Account<'info, WorkUnit>>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create_contract(
    ctx: Context<CreateContract>,
    args: CreateContractArgs,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;

    let employer_key = ctx.accounts.employer.key();
    let freelancer_key = ctx.accounts.freelancer.key();
    let token_mint_key = ctx.accounts.token_mint.key();

    validate_parties_and_resolver(employer_key, freelancer_key, args.resolver)?;

    let terms = args.resolve(now)?;

    let contract_id = args.contract_id;
    let total_amount = args.total_amount;
    let payment_mode = args.payment_mode;
    let contract_key = ctx.accounts.contract.key();

    {
        let contract = &mut ctx.accounts.contract;

        contract.version = V2_LAYOUT_VERSION;
        contract.employer = employer_key;
        contract.freelancer = freelancer_key;
        contract.token_mint = token_mint_key;
        contract.contract_id = contract_id;

        contract.payment_mode = payment_mode;
        contract.status = terms.status;
        contract.start_mode = args.start_mode;

        contract.total_amount = total_amount;
        contract.trial_amount = terms.trial_amount;
        contract.main_amount = terms.main_amount;
        contract.allocated_amount = 0;
        contract.released_amount = 0;
        contract.withdrawn_amount = 0;
        contract.refunded_amount = 0;
        contract.stream_released_amount = 0;
        contract.freelancer_settlement_amount = 0;
        contract.employer_refundable_amount = 0;
        contract.resolver = args.resolver;
        contract.contested_amount = 0;
        contract.disputed_at = 0;
        contract.dispute_initiator = DisputeParty::None;

        contract.acceptance_deadline = args.acceptance_deadline;
        contract.scheduled_start_time = terms.scheduled_start_time;
        contract.duration_seconds = args.duration_seconds;
        contract.checkpoint_interval = terms.checkpoint_interval;
        contract.review_duration = args.review_duration;
        contract.activation_review_duration = args.activation_review_duration;
        contract.max_revisions = args.max_revisions;

        // The contract has not started and nothing has been earned. These are
        // written as zero because there is no honest instant to record yet, and
        // `status` — not any of these values — is what later phases read to
        // decide whether the contract is running.
        contract.start_time = 0;
        contract.end_time = 0;
        contract.last_period_end = 0;

        contract.created_at = now;
        contract.accepted_at = 0;
        contract.completed_at = 0;
        contract.terminated_at = 0;

        contract.work_unit_count = 0;
        contract.released_unit_count = 0;
        contract.voided_unit_count = 0;
        contract.open_review_count = 0;
        contract.last_milestone_due_offset = 0;

        contract.metadata_hash = args.metadata_hash;
        contract.bump = ctx.bumps.contract;
        contract.escrow_bump = ctx.bumps.contract_escrow;
        contract.reserved = [0u8; 19];
        contract.metadata_uri = args.metadata_uri;
    }

    if terms.trial_amount > 0 {
        let trial = ctx
            .accounts
            .trial_work_unit
            .as_mut()
            .ok_or(StreamPayV2Error::TrialRequired)?;
        let trial_bump = ctx
            .bumps
            .trial_work_unit
            .ok_or(StreamPayV2Error::TrialRequired)?;
        let trial_key = trial.key();
        trial.init_as_trial(contract_key, terms.trial_amount, trial_bump);
        emit!(TrialConfigured {
            contract: contract_key,
            trial_work_unit: trial_key,
            employer: employer_key,
            freelancer: freelancer_key,
            amount: terms.trial_amount,
        });
    } else {
        require!(
            ctx.accounts.trial_work_unit.is_none(),
            StreamPayV2Error::InvalidTrialAmount
        );
    }

    if payment_mode == PaymentMode::Fixed {
        let unit = ctx
            .accounts
            .fixed_work_unit
            .as_mut()
            .ok_or(StreamPayV2Error::FixedNeedsOneUnit)?;
        let unit_bump = ctx
            .bumps
            .fixed_work_unit
            .ok_or(StreamPayV2Error::FixedNeedsOneUnit)?;
        unit.init_as_fixed(
            contract_key,
            terms.main_amount,
            args.duration_seconds,
            unit_bump,
        );
        let contract = &mut ctx.accounts.contract;
        contract.allocated_amount = terms.main_amount;
        contract.work_unit_count = 1;
        contract.last_milestone_due_offset = args.duration_seconds;
    } else {
        require!(
            ctx.accounts.fixed_work_unit.is_none(),
            StreamPayV2Error::InvalidPaymentMode
        );
    }

    fund_contract_escrow(
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.employer_token_account.to_account_info(),
        &ctx.accounts.token_mint,
        &mut ctx.accounts.contract_escrow,
        ctx.accounts.employer.to_account_info(),
        total_amount,
    )?;

    emit!(ContractCreated {
        contract: contract_key,
        employer: employer_key,
        freelancer: freelancer_key,
        token_mint: token_mint_key,
        contract_id,
        payment_mode,
        status: terms.status,
        total_amount,
        created_at: now,
    });

    Ok(())
}

#[cfg(test)]
mod hourly_h1_create {
    use super::{CreateContractArgs, PaymentMode, StartMode};
    use anchor_lang::prelude::Pubkey;

    fn valid_non_hourly(mode: PaymentMode) -> CreateContractArgs {
        CreateContractArgs {
            contract_id: 1,
            payment_mode: mode,
            start_mode: StartMode::OnActivation,
            total_amount: 100,
            acceptance_deadline: 10_000,
            scheduled_start_time: 0,
            duration_seconds: 3_600,
            checkpoint_interval: if mode == PaymentMode::Streaming { 600 } else { 0 },
            review_duration: 60,
            activation_review_duration: 120,
            max_revisions: 1,
            trial_amount: 0,
            resolver: Pubkey::new_from_array([2u8; 32]),
            metadata_uri: "https://example.test/meta".into(),
            metadata_hash: [3u8; 32],
        }
    }

    #[test]
    fn hourly_create_args_are_rejected_on_create_contract() {
        assert!(
            valid_non_hourly(PaymentMode::Hourly).resolve(1_000).is_err(),
            "Hourly must use create_hourly_contract"
        );
    }

    #[test]
    fn existing_modes_still_resolve() {
        valid_non_hourly(PaymentMode::Fixed)
            .resolve(1_000)
            .expect("Fixed create remains valid");
        valid_non_hourly(PaymentMode::Milestone)
            .resolve(1_000)
            .expect("Milestone create remains valid");
        valid_non_hourly(PaymentMode::Streaming)
            .resolve(1_000)
            .expect("Streaming create remains valid");
    }
}
