use anchor_lang::prelude::*;
use anchor_spl::token::{
    self,
    Mint,
    Token,
    TokenAccount,
    Transfer,
};
declare_id!("EgZvP1pnkQFiCQkrqvEUQQLJa1hGg6UUYUUcVCZMEyhd");

// ---------------------------------------------------------------------------
// StreamPay V2.
//
// V2 is additive: its own module tree, its own account types, its own error
// range (6100+) and its own disjoint PDA seed namespace. It shares only the
// program ID.
//
// Everything below this block is V1 and is intentionally left unchanged:
// same `Stream` layout and discriminator, same instruction names and
// discriminators, same seeds, same error codes 6000..=6004.
// ---------------------------------------------------------------------------
pub mod v2;

pub use v2::*;

#[program]
pub mod streampay {
pub fn withdraw(ctx: Context<Withdraw>) -> Result<()> {
    let clock = Clock::get()?;
    let current_time = clock.unix_timestamp;

    let stream = &mut ctx.accounts.stream;

    require!(
        !stream.is_cancelled,
        StreamPayError::StreamCancelled
    );

    let earned = stream.earned_amount(current_time)?;

    let available = earned
        .checked_sub(stream.withdrawn_amount)
        .ok_or(StreamPayError::MathOverflow)?;

    require!(
        available > 0,
        StreamPayError::NothingToWithdraw
    );

    // ---------------------------------------------------------
    // Prepare Stream PDA signer seeds.
    // The Stream PDA owns the escrow token account.
    // ---------------------------------------------------------
    let employer = stream.employer;
    let worker = stream.worker;
    let stream_id_bytes = stream.stream_id.to_le_bytes();
    let bump = [stream.bump];

    let signer_seeds: &[&[u8]] = &[
        b"stream",
        employer.as_ref(),
        worker.as_ref(),
        &stream_id_bytes,
        &bump,
    ];

    let signer = &[signer_seeds];

    // ---------------------------------------------------------
    // Transfer earned tokens:
    // Escrow -> Worker token account
    // ---------------------------------------------------------
    let cpi_accounts = Transfer {
        from: ctx.accounts.escrow_token_account.to_account_info(),
        to: ctx.accounts.worker_token_account.to_account_info(),
        authority: stream.to_account_info(),
    };

    let cpi_context = CpiContext::new_with_signer(
        ctx.accounts.token_program.key(),
        cpi_accounts,
        signer,
    );

    token::transfer(cpi_context, available)?;

    // Update accounting only after the token transfer succeeds.
    stream.withdrawn_amount = stream
        .withdrawn_amount
        .checked_add(available)
        .ok_or(StreamPayError::MathOverflow)?;

    Ok(())
}

pub fn cancel_stream(ctx: Context<CancelStream>) -> Result<()> {
    let clock = Clock::get()?;
    let current_time = clock.unix_timestamp;

    // ---------------------------------------------------------
    // Read stream information and calculate settlement.
    // ---------------------------------------------------------
    let stream = &ctx.accounts.stream;

    require!(
        !stream.is_cancelled,
        StreamPayError::StreamCancelled
    );

    let earned = stream.earned_amount(current_time)?;

    let worker_owed = earned
        .checked_sub(stream.withdrawn_amount)
        .ok_or(StreamPayError::MathOverflow)?;

    let employer_refund = stream
        .total_amount
        .checked_sub(earned)
        .ok_or(StreamPayError::MathOverflow)?;

    // ---------------------------------------------------------
    // Prepare Stream PDA signer seeds.
    // The Stream PDA controls the escrow token account.
    // ---------------------------------------------------------
    let employer = stream.employer;
    let worker = stream.worker;
    let stream_id_bytes = stream.stream_id.to_le_bytes();
    let bump = [stream.bump];

    let signer_seeds: &[&[u8]] = &[
        b"stream",
        employer.as_ref(),
        worker.as_ref(),
        &stream_id_bytes,
        &bump,
    ];

    let signer = &[signer_seeds];

    // ---------------------------------------------------------
    // Pay earned tokens to the worker.
    // ---------------------------------------------------------
    if worker_owed > 0 {
        let worker_transfer = Transfer {
            from: ctx.accounts.escrow_token_account.to_account_info(),
            to: ctx.accounts.worker_token_account.to_account_info(),
            authority: ctx.accounts.stream.to_account_info(),
        };

        let worker_cpi = CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            worker_transfer,
            signer,
        );

        token::transfer(worker_cpi, worker_owed)?;
    }

    // ---------------------------------------------------------
    // Refund unearned tokens to the employer.
    // ---------------------------------------------------------
    if employer_refund > 0 {
        let employer_transfer = Transfer {
            from: ctx.accounts.escrow_token_account.to_account_info(),
            to: ctx.accounts.employer_token_account.to_account_info(),
            authority: ctx.accounts.stream.to_account_info(),
        };

        let employer_cpi = CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            employer_transfer,
            signer,
        );

        token::transfer(employer_cpi, employer_refund)?;
    }

    // ---------------------------------------------------------
    // Update stream accounting after successful transfers.
    // ---------------------------------------------------------
    let stream = &mut ctx.accounts.stream;

    stream.withdrawn_amount = stream
        .withdrawn_amount
        .checked_add(worker_owed)
        .ok_or(StreamPayError::MathOverflow)?;

    stream.end_time = current_time;
    stream.is_cancelled = true;

    msg!("Worker paid: {}", worker_owed);
    msg!("Employer refunded: {}", employer_refund);

    Ok(())
}
 
   use super::*;

    pub fn create_stream(
        ctx: Context<CreateStream>,
        stream_id: u64,
        total_amount: u64,
        duration_seconds: i64,
    ) -> Result<()> {
        require!(total_amount > 0, StreamPayError::InvalidAmount);
        require!(duration_seconds > 0, StreamPayError::InvalidDuration);

        let clock = Clock::get()?;
        let start_time = clock.unix_timestamp;

        let end_time = start_time
            .checked_add(duration_seconds)
            .ok_or(StreamPayError::InvalidDuration)?;

        let stream = &mut ctx.accounts.stream;

        stream.employer = ctx.accounts.employer.key();
        stream.worker = ctx.accounts.worker.key();
        stream.token_mint = ctx.accounts.token_mint.key();

        stream.stream_id = stream_id;
        stream.total_amount = total_amount;
        stream.withdrawn_amount = 0;
        stream.is_cancelled = false;
        stream.start_time = start_time;
        stream.end_time = end_time;
        stream.bump = ctx.bumps.stream;

// Transfer the full stream amount from the employer's
// token account into the StreamPay escrow token account.
let cpi_accounts = Transfer {
    from: ctx.accounts.employer_token_account.to_account_info(),
    to: ctx.accounts.escrow_token_account.to_account_info(),
    authority: ctx.accounts.employer.to_account_info(),
};

let cpi_context = CpiContext::new(
    ctx.accounts.token_program.key(),
    cpi_accounts,
);

token::transfer(cpi_context, total_amount)?;

Ok(())
        
    }

    // -----------------------------------------------------------------
    // StreamPay V2 instructions.
    //
    // Thin delegations only. The accounts context, argument type, validation
    // and handler all live in `v2::instructions`, so this block stays a
    // readable index of the program's entry points.
    // -----------------------------------------------------------------

    /// Creates a funded contract and offers it to the freelancer.
    pub fn create_contract(ctx: Context<CreateContract>, args: CreateContractArgs) -> Result<()> {
        v2::instructions::create_contract::handle_create_contract(ctx, args)
    }

    /// Defines one deliverable of a draft milestone contract. The index is
    /// derived on-chain, not supplied by the caller.
    pub fn add_milestone(
        ctx: Context<AddMilestone>,
        amount: u64,
        due_offset_seconds: i64,
    ) -> Result<()> {
        v2::instructions::add_milestone::handle_add_milestone(ctx, amount, due_offset_seconds)
    }

    /// Locks a fully allocated milestone contract's terms and offers it.
    pub fn finalize_terms(ctx: Context<FinalizeTerms>) -> Result<()> {
        v2::instructions::finalize_terms::handle_finalize_terms(ctx)
    }

    /// Freelancer accepts a funded offer. Does not start the main stream.
    pub fn accept_contract(ctx: Context<AcceptContract>) -> Result<()> {
        v2::instructions::accept_contract::handle_accept_contract(ctx)
    }

    /// Freelancer refuses a funded offer. Escrow is left in place.
    pub fn decline_contract(ctx: Context<DeclineContract>) -> Result<()> {
        v2::instructions::decline_contract::handle_decline_contract(ctx)
    }

    /// Employer approves activation and establishes main-contract timing.
    pub fn approve_activation(ctx: Context<ApproveActivation>) -> Result<()> {
        v2::instructions::approve_activation::handle_approve_activation(ctx)
    }

    /// Employer declines to activate after the trial stage. Escrow is left in place.
    pub fn reject_activation(ctx: Context<RejectActivation>) -> Result<()> {
        v2::instructions::reject_activation::handle_reject_activation(ctx)
    }

    /// Freelancer submits paid trial work. Does not release funds or activate.
    pub fn submit_trial_work(
        ctx: Context<SubmitTrialWork>,
        submission_uri: String,
        submission_hash: [u8; 32],
    ) -> Result<()> {
        v2::instructions::submit_trial_work::handle_submit_trial_work(
            ctx,
            submission_uri,
            submission_hash,
        )
    }

    /// Employer requests a bounded trial revision.
    pub fn request_trial_revision(ctx: Context<RequestTrialRevision>) -> Result<()> {
        v2::instructions::request_trial_revision::handle_request_trial_revision(ctx)
    }

    /// Employer approves submitted trial work and starts the main contract.
    pub fn approve_trial_and_activate(ctx: Context<ApproveTrialAndActivate>) -> Result<()> {
        v2::instructions::approve_trial_and_activate::handle_approve_trial_and_activate(ctx)
    }

    /// Freelancer submits post-activation Milestone or Fixed work.
    pub fn submit_work_unit(
        ctx: Context<SubmitWorkUnit>,
        submission_uri: String,
        submission_hash: [u8; 32],
    ) -> Result<()> {
        v2::instructions::submit_work_unit::handle_submit_work_unit(
            ctx,
            submission_uri,
            submission_hash,
        )
    }

    /// Employer releases a submitted post-activation work unit. No SPL transfer.
    pub fn approve_work_unit(ctx: Context<ApproveWorkUnit>) -> Result<()> {
        v2::instructions::approve_work_unit::handle_approve_work_unit(ctx)
    }

    /// Employer requests a bounded resubmission of post-activation work.
    pub fn request_revision(ctx: Context<RequestRevision>) -> Result<()> {
        v2::instructions::request_revision::handle_request_revision(ctx)
    }

    /// Permissionless auto-release of an expired post-activation review.
    pub fn finalize_review_timeout(ctx: Context<FinalizeReviewTimeout>) -> Result<()> {
        v2::instructions::finalize_review_timeout::handle_finalize_review_timeout(ctx)
    }

    /// Materialize currently accrued streaming earnings into released accounting.
    /// Permissionless and deterministic. No SPL transfer.
    pub fn release_stream_accrual(ctx: Context<ReleaseStreamAccrual>) -> Result<()> {
        v2::instructions::release_stream_accrual::handle_release_stream_accrual(ctx)
    }

    /// Employer cancels an Active contract and freezes the economic split.
    /// No SPL transfer.
    pub fn cancel_active_contract(ctx: Context<CancelActiveContract>) -> Result<()> {
        v2::instructions::cancel_active_contract::handle_cancel_active_contract(ctx)
    }
}
#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(
        mut,
        has_one = worker,
        has_one = token_mint
    )]
    pub stream: Account<'info, Stream>,

    pub worker: Signer<'info>,

    pub token_mint: Account<'info, Mint>,

    #[account(
        mut,
        token::mint = token_mint,
        token::authority = worker
    )]
    pub worker_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [
            b"escrow",
            stream.key().as_ref()
        ],
        bump,
        token::mint = token_mint,
        token::authority = stream
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}
#[derive(Accounts)]
pub struct CancelStream<'info> {
    #[account(
        mut,
        has_one = employer,
        has_one = worker,
        has_one = token_mint
    )]
    pub stream: Account<'info, Stream>,

    pub employer: Signer<'info>,

    /// CHECK:
    /// This must match the worker stored in the stream.
    pub worker: UncheckedAccount<'info>,

    pub token_mint: Account<'info, Mint>,

    #[account(
        mut,
        token::mint = token_mint,
        token::authority = employer
    )]
    pub employer_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = token_mint,
        token::authority = worker
    )]
    pub worker_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [
            b"escrow",
            stream.key().as_ref()
        ],
        bump,
        token::mint = token_mint,
        token::authority = stream
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(stream_id: u64)]
pub struct CreateStream<'info> {
    #[account(
        init,
        payer = employer,
        space = 8 + 138,
        seeds = [
            b"stream",
            employer.key().as_ref(),
            worker.key().as_ref(),
            &stream_id.to_le_bytes()
        ],
        bump
    )]
    pub stream: Account<'info, Stream>,

    #[account(mut)]
    pub employer: Signer<'info>,

    /// CHECK:
    /// The worker does not need to sign when a stream is created.
    pub worker: UncheckedAccount<'info>,

    pub token_mint: Account<'info, Mint>,

    #[account(
        mut,
        token::mint = token_mint,
        token::authority = employer
    )]
    pub employer_token_account: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = employer,
        seeds = [
            b"escrow",
            stream.key().as_ref()
        ],
        bump,
        token::mint = token_mint,
        token::authority = stream
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,

    pub system_program: Program<'info, System>,
}

#[account]
pub struct Stream {
    pub employer: Pubkey,
    pub worker: Pubkey,
    pub token_mint: Pubkey,

    pub stream_id: u64,
    pub total_amount: u64,
    pub withdrawn_amount: u64,
    pub is_cancelled: bool,
    pub start_time: i64,
    pub end_time: i64,

    pub bump: u8,
}

impl Stream {
    pub fn earned_amount(&self, current_time: i64) -> Result<u64> {
        // If the current time is before the stream starts,
        // nothing has been earned yet.
        if current_time <= self.start_time {
            return Ok(0);
        }

        // If the stream is already finished,
        // the worker has earned the full amount.
        if current_time >= self.end_time {
            return Ok(self.total_amount);
        }

        let elapsed = current_time
            .checked_sub(self.start_time)
            .ok_or(StreamPayError::MathOverflow)?;

        let duration = self
            .end_time
            .checked_sub(self.start_time)
            .ok_or(StreamPayError::MathOverflow)?;

        let elapsed_u64 =
            u64::try_from(elapsed).map_err(|_| StreamPayError::MathOverflow)?;

        let duration_u64 =
            u64::try_from(duration).map_err(|_| StreamPayError::MathOverflow)?;

        let earned = self
            .total_amount
            .checked_mul(elapsed_u64)
            .ok_or(StreamPayError::MathOverflow)?
            .checked_div(duration_u64)
            .ok_or(StreamPayError::MathOverflow)?;

        Ok(earned)
    }
}

#[error_code]
pub enum StreamPayError {
    #[msg("The stream amount must be greater than zero.")]
    InvalidAmount,

    #[msg("The stream duration must be greater than zero.")]
    InvalidDuration,
    
    #[msg("A math calculation overflowed.")]
MathOverflow,
    #[msg("There is currently nothing available to withdraw.")]
NothingToWithdraw,
    #[msg("This stream has been cancelled.")]
StreamCancelled,
}

