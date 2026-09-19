//! `create_hourly_contract`: dedicated Hourly create. Does not change
//! `create_contract` Borsh args.
//!
//! `total_amount` is derived on-chain:
//! `main_amount = canonical_hourly_earned(hourly_rate, authorized_seconds)`
//! `total_amount = main_amount + trial_amount`
//! The employer funds exactly that derived total. The caller cannot supply it.
//!
//! `payment_mode` is always Hourly. `start_mode` is always OnActivation.
//! Activation later does not start a session.

use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::v2::constants::{
    CONTRACT_ESCROW_SEED, CONTRACT_SEED, HOURLY_STATE_SEED, TRIAL_UNIT_SEED, V2_LAYOUT_VERSION,
};
use crate::v2::enums::{ContractStatus, DisputeParty, PaymentMode, StartMode};
use crate::v2::errors::StreamPayV2Error;
use crate::v2::events::{ContractCreated, HourlyContractCreated, TrialConfigured};
use crate::v2::hourly::canonical_hourly_earned;
use crate::v2::instructions::create_shared::{
    fund_contract_escrow, prove_on_activation_end_fits, validate_common_offer_terms,
    validate_parties_and_resolver,
};
use crate::v2::state::{Contract, HourlyState, WorkUnit};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct CreateHourlyContractArgs {
    pub contract_id: u64,
    pub hourly_rate: u64,
    pub authorized_seconds: u64,
    pub acceptance_deadline: i64,
    pub duration_seconds: i64,
    pub review_duration: i64,
    pub activation_review_duration: i64,
    pub max_revisions: u8,
    pub trial_amount: u64,
    pub resolver: Pubkey,
    pub metadata_uri: String,
    pub metadata_hash: [u8; 32],
}

struct ResolvedHourlyTerms {
    main_amount: u64,
    total_amount: u64,
    trial_amount: u64,
}

impl CreateHourlyContractArgs {
    fn resolve(&self, now: i64) -> Result<ResolvedHourlyTerms> {
        require!(self.hourly_rate > 0, StreamPayV2Error::InvalidHourlyRate);
        require!(
            self.authorized_seconds > 0,
            StreamPayV2Error::InvalidAuthorizedSeconds
        );

        validate_common_offer_terms(
            now,
            &self.metadata_uri,
            self.acceptance_deadline,
            self.duration_seconds,
            self.review_duration,
            self.max_revisions,
            self.activation_review_duration,
        )?;
        prove_on_activation_end_fits(
            self.acceptance_deadline,
            self.activation_review_duration,
            self.duration_seconds,
        )?;

        let main_amount = canonical_hourly_earned(self.hourly_rate, self.authorized_seconds)?;
        require!(main_amount > 0, StreamPayV2Error::HourlyMainAmountZero);

        let total_amount = main_amount
            .checked_add(self.trial_amount)
            .ok_or(StreamPayV2Error::ArithmeticOverflow)?;

        Ok(ResolvedHourlyTerms {
            main_amount,
            total_amount,
            trial_amount: self.trial_amount,
        })
    }
}

#[derive(Accounts)]
#[instruction(args: CreateHourlyContractArgs)]
pub struct CreateHourlyContract<'info> {
    #[account(mut)]
    pub employer: Signer<'info>,

    /// CHECK: Identity seed only. Same rationale as `create_contract`.
    pub freelancer: UncheckedAccount<'info>,

    pub token_mint: Account<'info, Mint>,

    #[account(
        mut,
        token::mint = token_mint,
        token::authority = employer,
    )]
    pub employer_token_account: Account<'info, TokenAccount>,

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

    #[account(
        init,
        payer = employer,
        seeds = [CONTRACT_ESCROW_SEED, contract.key().as_ref()],
        bump,
        token::mint = token_mint,
        token::authority = contract,
    )]
    pub contract_escrow: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = employer,
        space = 8 + HourlyState::INIT_SPACE,
        seeds = [HOURLY_STATE_SEED, contract.key().as_ref()],
        bump,
    )]
    pub hourly_state: Account<'info, HourlyState>,

    #[account(
        init,
        payer = employer,
        space = 8 + WorkUnit::INIT_SPACE,
        seeds = [TRIAL_UNIT_SEED, contract.key().as_ref()],
        bump,
    )]
    pub trial_work_unit: Option<Box<Account<'info, WorkUnit>>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create_hourly_contract(
    ctx: Context<CreateHourlyContract>,
    args: CreateHourlyContractArgs,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;

    let employer_key = ctx.accounts.employer.key();
    let freelancer_key = ctx.accounts.freelancer.key();
    let token_mint_key = ctx.accounts.token_mint.key();

    validate_parties_and_resolver(employer_key, freelancer_key, args.resolver)?;

    let terms = args.resolve(now)?;
    let contract_id = args.contract_id;
    let contract_key = ctx.accounts.contract.key();

    {
        let contract = &mut ctx.accounts.contract;

        contract.version = V2_LAYOUT_VERSION;
        contract.employer = employer_key;
        contract.freelancer = freelancer_key;
        contract.token_mint = token_mint_key;
        contract.contract_id = contract_id;

        contract.payment_mode = PaymentMode::Hourly;
        contract.status = ContractStatus::PendingAcceptance;
        contract.start_mode = StartMode::OnActivation;

        contract.total_amount = terms.total_amount;
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
        contract.scheduled_start_time = 0;
        contract.duration_seconds = args.duration_seconds;
        contract.checkpoint_interval = 0;
        contract.review_duration = args.review_duration;
        contract.activation_review_duration = args.activation_review_duration;
        contract.max_revisions = args.max_revisions;

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

    ctx.accounts.hourly_state.init(
        contract_key,
        args.hourly_rate,
        args.authorized_seconds,
        ctx.bumps.hourly_state,
    );

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

    fund_contract_escrow(
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.employer_token_account.to_account_info(),
        &ctx.accounts.token_mint,
        &mut ctx.accounts.contract_escrow,
        ctx.accounts.employer.to_account_info(),
        terms.total_amount,
    )?;

    emit!(ContractCreated {
        contract: contract_key,
        employer: employer_key,
        freelancer: freelancer_key,
        token_mint: token_mint_key,
        contract_id,
        payment_mode: PaymentMode::Hourly,
        status: ContractStatus::PendingAcceptance,
        total_amount: terms.total_amount,
        created_at: now,
    });
    emit!(HourlyContractCreated {
        contract: contract_key,
        employer: employer_key,
        freelancer: freelancer_key,
        contract_id,
        hourly_rate: args.hourly_rate,
        authorized_seconds: args.authorized_seconds,
        main_amount: terms.main_amount,
        trial_amount: terms.trial_amount,
        total_amount: terms.total_amount,
        created_at: now,
    });

    Ok(())
}
