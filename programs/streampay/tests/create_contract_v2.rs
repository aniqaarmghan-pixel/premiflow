//! StreamPay V2 Phase 1 tests: `create_contract`.
//!
//! Kept in its own target so the V1 `create_stream.rs` regression suite stays
//! untouched and independently meaningful.
//!
//! These tests run against `target/deploy/streampay.so`, so that binary must be
//! rebuilt (`cargo build-sbf`) after any program change or the suite is testing
//! stale code.
//!
//! Negative tests assert exact numeric error codes rather than just `is_err()`,
//! because "it failed" does not distinguish a rejected term from an unrelated
//! setup mistake. Three distinct layers can reject a call here, and each is
//! asserted at its own layer:
//!
//! | layer               | codes        | example                          |
//! |---------------------|--------------|----------------------------------|
//! | our program         | 6100+        | `InvalidAmount` (6100)           |
//! | Anchor constraints  | 2000..=2999  | `ConstraintTokenOwner` (2015)    |
//! | SPL Token program   | token errors | `InsufficientFunds` (1)          |

use anchor_lang::prelude::*;
use anchor_lang::{AccountDeserialize, InstructionData, ToAccountMetas};

use litesvm::types::{FailedTransactionMetadata, TransactionResult};
use litesvm::LiteSVM;
use litesvm_token::{
    get_spl_account, spl_token::state::Account as SplTokenAccount, CreateAccount, CreateMint,
    MintTo, TOKEN_ID,
};
use solana_address::Address;
use solana_instruction::error::InstructionError;
use solana_instruction::Instruction;
use solana_keypair::Keypair;
use solana_message::Message;
use solana_signer::Signer;
use solana_transaction::Transaction;
use solana_transaction_error::TransactionError;

use ::streampay::{
    self as streampay_program, Contract, ContractStatus, CreateContractArgs, PaymentMode,
    StartMode, WorkUnit, WorkUnitKind, WorkUnitStatus,
};

// ---------------------------------------------------------------------------
// Expected error codes.
// ---------------------------------------------------------------------------

// StreamPayV2Error, base 6100. Pinned by unit tests in `v2::errors`.
const E_INVALID_AMOUNT: u32 = 6100;
const E_INVALID_DURATION: u32 = 6101;
const E_INVALID_CHECKPOINT_INTERVAL: u32 = 6102;
const E_INVALID_REVIEW_DURATION: u32 = 6103;
const E_INVALID_MAX_REVISIONS: u32 = 6105;
const E_INVALID_ACCEPTANCE_DEADLINE: u32 = 6106;
const E_INVALID_SCHEDULED_START: u32 = 6107;
const E_INVALID_METADATA: u32 = 6108;
const E_SELF_CONTRACT: u32 = 6109;
const E_INVALID_RESOLVER: u32 = 6158;

// anchor_lang::error::ErrorCode, constraint range.
const E_CONSTRAINT_TOKEN_MINT: u32 = 2014;
const E_CONSTRAINT_TOKEN_OWNER: u32 = 2015;

// spl_token::error::TokenError::InsufficientFunds.
const E_TOKEN_INSUFFICIENT_FUNDS: u32 = 1;

// SystemError::AccountAlreadyInUse, surfaced when `init` targets an address
// that already holds an account.
const E_ACCOUNT_ALREADY_IN_USE: u32 = 0;

// ---------------------------------------------------------------------------
// Harness.
// ---------------------------------------------------------------------------

const MINT_DECIMALS: u8 = 6;

/// Fixed base timestamp so every deadline assertion is deterministic and
/// meaningful (a default clock at 0 makes "in the past" awkward to express).
const BASE_TS: i64 = 1_700_000_000;

struct Env {
    svm: LiteSVM,
    program_id: Address,
    employer: Keypair,
    employer_pk: Address,
    token_mint: Address,
    employer_token_account: Address,
}

/// Boots LiteSVM with the current program, a 6-decimal mint, and an employer
/// funded with `employer_tokens` base units.
fn setup(employer_tokens: u64) -> Env {
    let program_id = streampay_program::id();
    let mut svm = LiteSVM::new();

    let program_path = format!(
        "{}/../../target/deploy/streampay.so",
        env!("CARGO_MANIFEST_DIR")
    );
    svm.add_program_from_file(program_id, program_path)
        .expect("Could not load StreamPay program");

    let mut clock = svm.get_sysvar::<Clock>();
    clock.unix_timestamp = BASE_TS;
    svm.set_sysvar(&clock);

    let employer = Keypair::new();
    let employer_pk = employer.pubkey();
    svm.airdrop(&employer_pk, 10_000_000_000)
        .expect("Airdrop failed");

    let token_mint = CreateMint::new(&mut svm, &employer)
        .authority(&employer_pk)
        .decimals(MINT_DECIMALS)
        .send()
        .expect("Could not create test mint");

    let employer_token_account = CreateAccount::new(&mut svm, &employer, &token_mint)
        .owner(&employer_pk)
        .send()
        .expect("Could not create employer token account");

    if employer_tokens > 0 {
        MintTo::new(
            &mut svm,
            &employer,
            &token_mint,
            &employer_token_account,
            employer_tokens,
        )
        .owner(&employer)
        .send()
        .expect("Could not mint test tokens");
    }

    Env {
        svm,
        program_id,
        employer,
        employer_pk,
        token_mint,
        employer_token_account,
    }
}

impl Env {
    fn now(&self) -> i64 {
        self.svm.get_sysvar::<Clock>().unix_timestamp
    }

    fn contract_pda(&self, freelancer: &Address, contract_id: u64) -> (Address, u8) {
        Address::find_program_address(
            &[
                b"contract",
                self.employer_pk.as_ref(),
                freelancer.as_ref(),
                &contract_id.to_le_bytes(),
            ],
            &self.program_id,
        )
    }

    fn escrow_pda(&self, contract: &Address) -> (Address, u8) {
        Address::find_program_address(&[b"contract_escrow", contract.as_ref()], &self.program_id)
    }

    fn work_unit_pda(&self, contract: &Address, index: u32) -> Address {
        Address::find_program_address(
            &[b"work_unit", contract.as_ref(), &index.to_le_bytes()],
            &self.program_id,
        )
        .0
    }

    fn token_balance(&self, account: &Address) -> u64 {
        let parsed: SplTokenAccount =
            get_spl_account(&self.svm, account).expect("Could not read token account");
        parsed.amount
    }

    /// Builds and sends `create_contract`, using `employer_token_account` as the
    /// funding source unless overridden.
    fn create(
        &mut self,
        freelancer: &Address,
        args: &CreateContractArgs,
        funding_source: Option<Address>,
    ) -> TransactionResult {
        let (contract, _) = self.contract_pda(freelancer, args.contract_id);
        let (contract_escrow, _) = self.escrow_pda(&contract);

        let fixed_work_unit = if args.payment_mode == PaymentMode::Fixed {
            Some(self.work_unit_pda(&contract, 0))
        } else {
            None
        };

        let instruction = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::CreateContract {
                employer: self.employer_pk,
                freelancer: *freelancer,
                token_mint: self.token_mint,
                employer_token_account: funding_source.unwrap_or(self.employer_token_account),
                contract,
                contract_escrow,
                trial_work_unit: None,
                fixed_work_unit,
                token_program: TOKEN_ID,
                system_program: anchor_lang::system_program::ID,
            }
            .to_account_metas(None),
            data: streampay_program::instruction::CreateContract { args: args.clone() }.data(),
        };

        let message = Message::new(&[instruction], Some(&self.employer_pk));
        let transaction = Transaction::new(&[&self.employer], message, self.svm.latest_blockhash());

        self.svm.send_transaction(transaction)
    }

    fn read_contract(&self, contract: &Address) -> Contract {
        let account = self
            .svm
            .get_account(contract)
            .expect("Contract account was not created");
        let mut data: &[u8] = &account.data;
        Contract::try_deserialize(&mut data).expect("Could not deserialize Contract")
    }

    fn read_work_unit(&self, work_unit: &Address) -> WorkUnit {
        let account = self
            .svm
            .get_account(work_unit)
            .expect("WorkUnit account was not created");
        let mut data: &[u8] = &account.data;
        WorkUnit::try_deserialize(&mut data).expect("Could not deserialize WorkUnit")
    }

    /// True when nothing lives at this address.
    fn is_absent(&self, address: &Address) -> bool {
        match self.svm.get_account(address) {
            None => true,
            Some(account) => account.data.is_empty() && account.lamports == 0,
        }
    }
}

/// Valid streaming terms: 1 hour, four 15-minute checkpoints, 5-minute reviews.
fn streaming_args(contract_id: u64, total_amount: u64, now: i64) -> CreateContractArgs {
    CreateContractArgs {
        contract_id,
        payment_mode: PaymentMode::Streaming,
        start_mode: StartMode::OnActivation,
        total_amount,
        acceptance_deadline: now + 3_600,
        scheduled_start_time: 0,
        duration_seconds: 3_600,
        checkpoint_interval: 900,
        review_duration: 300,
        activation_review_duration: 3_600,
        max_revisions: 2,
        trial_amount: 0,
        resolver: Pubkey::new_from_array([0x11; 32]),
        metadata_uri: "ipfs://bafyContractMetadata".to_string(),
        metadata_hash: [7u8; 32],
    }
}

fn fixed_args(contract_id: u64, total_amount: u64, now: i64) -> CreateContractArgs {
    CreateContractArgs {
        payment_mode: PaymentMode::Fixed,
        // Not applicable to a fixed contract; deliberately non-zero to prove the
        // program normalizes it rather than storing caller junk.
        checkpoint_interval: 12_345,
        ..streaming_args(contract_id, total_amount, now)
    }
}

fn milestone_args(contract_id: u64, total_amount: u64, now: i64) -> CreateContractArgs {
    CreateContractArgs {
        payment_mode: PaymentMode::Milestone,
        checkpoint_interval: 12_345,
        ..streaming_args(contract_id, total_amount, now)
    }
}

fn error_code(failure: &FailedTransactionMetadata) -> u32 {
    match &failure.err {
        TransactionError::InstructionError(_, InstructionError::Custom(code)) => *code,
        other => panic!(
            "expected a custom program error, got {other:?}\nlogs:\n{}",
            failure.meta.logs.join("\n")
        ),
    }
}

fn assert_rejected(result: TransactionResult, expected: u32, what: &str) {
    let failure = match result {
        Ok(_) => panic!("{what} should have been rejected, but the transaction succeeded"),
        Err(failure) => failure,
    };

    let actual = error_code(&failure);
    assert_eq!(
        actual,
        expected,
        "{what}: expected error {expected}, got {actual}\nlogs:\n{}",
        failure.meta.logs.join("\n")
    );
}

// ---------------------------------------------------------------------------
// 1. Streaming contract: the full happy path.
// ---------------------------------------------------------------------------

#[test]
fn create_streaming_contract_succeeds() {
    let total_amount: u64 = 4_500_000;
    let mut env = setup(total_amount);
    let now = env.now();

    let freelancer = Keypair::new().pubkey();
    let args = streaming_args(1, total_amount, now);

    let (contract_pda, contract_bump) = env.contract_pda(&freelancer, args.contract_id);
    let (escrow_pda, escrow_bump) = env.escrow_pda(&contract_pda);

    env.create(&freelancer, &args, None)
        .expect("create_contract should succeed");

    let contract = env.read_contract(&contract_pda);

    // Identity.
    assert_eq!(contract.version, 1);
    assert_eq!(contract.employer, env.employer_pk);
    assert_eq!(contract.freelancer, freelancer);
    assert_eq!(contract.token_mint, env.token_mint);
    assert_eq!(contract.contract_id, 1);

    // Classification: streaming terms are complete at creation, so the contract
    // is immediately offerable.
    assert_eq!(contract.payment_mode, PaymentMode::Streaming);
    assert_eq!(contract.status, ContractStatus::PendingAcceptance);
    assert_eq!(contract.start_mode, StartMode::OnActivation);

    // Money: funded in full, nothing released or moved.
    assert_eq!(contract.total_amount, total_amount);
    assert_eq!(contract.trial_amount, 0);
    assert_eq!(contract.main_amount, total_amount);
    assert_eq!(contract.allocated_amount, 0);
    assert_eq!(contract.released_amount, 0);
    assert_eq!(contract.withdrawn_amount, 0);
    assert_eq!(contract.refunded_amount, 0);
    assert_eq!(contract.stream_released_amount, 0);
    assert_eq!(contract.freelancer_settlement_amount, 0);
    assert_eq!(contract.employer_refundable_amount, 0);
    assert_eq!(contract.resolver, Pubkey::new_from_array([0x11; 32]));
    assert_eq!(contract.contested_amount, 0);
    assert_eq!(contract.disputed_at, 0);

    // Terms stored as agreed.
    assert_eq!(contract.acceptance_deadline, now + 3_600);
    assert_eq!(contract.duration_seconds, 3_600);
    assert_eq!(contract.checkpoint_interval, 900);
    assert_eq!(contract.review_duration, 300);
    assert_eq!(contract.max_revisions, 2);
    assert_eq!(contract.activation_review_duration, 3_600);

    // `scheduled_start_time` is normalized away under OnActivation: the mode,
    // not this value, is what later phases consult.
    assert_eq!(contract.scheduled_start_time, 0);

    // Nothing has started. `status` above is the authority; these are simply
    // unwritten because no honest instant exists yet.
    assert_eq!(contract.start_time, 0);
    assert_eq!(contract.end_time, 0);
    assert_eq!(contract.last_period_end, 0);
    assert_eq!(contract.accepted_at, 0);
    assert_eq!(contract.completed_at, 0);
    assert_eq!(contract.terminated_at, 0);
    assert!(!contract.status.is_started());
    assert!(!contract.status.is_accepted());
    assert!(!contract.status.is_terminal());

    assert_eq!(contract.created_at, now);

    // No work exists yet.
    assert_eq!(contract.work_unit_count, 0);
    assert_eq!(contract.released_unit_count, 0);
    assert_eq!(contract.voided_unit_count, 0);
    assert_eq!(contract.open_review_count, 0);
    assert_eq!(contract.last_milestone_due_offset, 0);

    // Metadata: bounded reference plus hash, nothing more.
    assert_eq!(contract.metadata_uri, "ipfs://bafyContractMetadata");
    assert_eq!(contract.metadata_hash, [7u8; 32]);

    // Bumps are program-derived, and must match what the client derived.
    assert_eq!(contract.bump, contract_bump);
    assert_eq!(contract.escrow_bump, escrow_bump);

    assert_eq!(contract.reserved, [0u8; 19]);

    // Escrow holds exactly the full amount, and the employer paid exactly that.
    assert_eq!(env.token_balance(&escrow_pda), total_amount);
    assert_eq!(env.token_balance(&env.employer_token_account), 0);
}

// ---------------------------------------------------------------------------
// 2. Fixed contract.
// ---------------------------------------------------------------------------

#[test]
fn create_fixed_contract_succeeds() {
    let total_amount: u64 = 1_000_000;
    let mut env = setup(total_amount);
    let now = env.now();

    let freelancer = Keypair::new().pubkey();
    let args = fixed_args(9, total_amount, now);
    let (contract_pda, _) = env.contract_pda(&freelancer, args.contract_id);
    let (escrow_pda, _) = env.escrow_pda(&contract_pda);

    env.create(&freelancer, &args, None)
        .expect("fixed create_contract should succeed");

    let contract = env.read_contract(&contract_pda);

    // One deliverable at one price: terms are already complete, so offerable.
    // The main WorkUnit is created here so the freelancer can inspect it.
    assert_eq!(contract.payment_mode, PaymentMode::Fixed);
    assert_eq!(contract.status, ContractStatus::PendingAcceptance);
    assert_eq!(contract.total_amount, total_amount);
    assert_eq!(contract.main_amount, total_amount);
    assert_eq!(contract.allocated_amount, total_amount);
    assert_eq!(contract.work_unit_count, 1);
    assert_eq!(contract.last_milestone_due_offset, 3_600);

    let unit = env.read_work_unit(&env.work_unit_pda(&contract_pda, 0));
    assert_eq!(unit.kind, WorkUnitKind::Fixed);
    assert_eq!(unit.status, WorkUnitStatus::Defined);
    assert_eq!(unit.amount, total_amount);
    assert_eq!(unit.index, 0);
    assert_eq!(unit.due_offset_seconds, 3_600);
    assert_eq!(unit.contract, contract_pda);

    // The caller supplied 12_345; a fixed contract has no checkpoints, so the
    // program stores 0 rather than a meaningless value.
    assert_eq!(contract.checkpoint_interval, 0);

    assert_eq!(env.token_balance(&escrow_pda), total_amount);
}

// ---------------------------------------------------------------------------
// 3. Milestone contract: funded, but not yet offerable.
// ---------------------------------------------------------------------------

#[test]
fn create_milestone_contract_starts_as_draft() {
    let total_amount: u64 = 3_000_000;
    let mut env = setup(total_amount);
    let now = env.now();

    let freelancer = Keypair::new().pubkey();
    let args = milestone_args(4, total_amount, now);
    let (contract_pda, _) = env.contract_pda(&freelancer, args.contract_id);
    let (escrow_pda, _) = env.escrow_pda(&contract_pda);

    env.create(&freelancer, &args, None)
        .expect("milestone create_contract should succeed");

    let contract = env.read_contract(&contract_pda);

    // The money is already committed, but the deliverables are not defined, so
    // the freelancer must not be able to accept yet.
    assert_eq!(contract.payment_mode, PaymentMode::Milestone);
    assert_eq!(contract.status, ContractStatus::Draft);
    assert!(contract.status.allows_term_changes());
    assert!(!contract.status.is_accepted());

    // Nothing is allocated to milestones until `add_milestone` runs.
    assert_eq!(contract.allocated_amount, 0);
    assert_eq!(contract.work_unit_count, 0);

    // Full funding still happens at creation.
    assert_eq!(contract.total_amount, total_amount);
    assert_eq!(env.token_balance(&escrow_pda), total_amount);
    assert_eq!(contract.checkpoint_interval, 0);
}

// ---------------------------------------------------------------------------
// 4-12. Term validation.
// ---------------------------------------------------------------------------

#[test]
fn reject_zero_total_amount() {
    let mut env = setup(1_000_000);
    let now = env.now();
    let freelancer = Keypair::new().pubkey();

    let args = CreateContractArgs {
        total_amount: 0,
        ..streaming_args(1, 0, now)
    };

    assert_rejected(
        env.create(&freelancer, &args, None),
        E_INVALID_AMOUNT,
        "zero total_amount",
    );
}

#[test]
fn reject_same_employer_and_freelancer() {
    let mut env = setup(1_000_000);
    let now = env.now();

    // The employer names themselves as the freelancer, which would collapse
    // both sides of a two-party agreement into one wallet.
    let freelancer = env.employer_pk;
    let args = streaming_args(1, 1_000_000, now);

    assert_rejected(
        env.create(&freelancer, &args, None),
        E_SELF_CONTRACT,
        "self-dealing contract",
    );
}

#[test]
fn reject_invalid_resolver() {
    let mut env = setup(1_000_000);
    let now = env.now();
    let freelancer = Keypair::new().pubkey();

    let default_resolver = CreateContractArgs {
        resolver: Pubkey::default(),
        ..streaming_args(1, 1_000_000, now)
    };
    assert_rejected(
        env.create(&freelancer, &default_resolver, None),
        E_INVALID_RESOLVER,
        "default resolver",
    );

    let employer_resolver = CreateContractArgs {
        resolver: env.employer_pk,
        ..streaming_args(2, 1_000_000, now)
    };
    assert_rejected(
        env.create(&freelancer, &employer_resolver, None),
        E_INVALID_RESOLVER,
        "employer as resolver",
    );

    let freelancer_resolver = CreateContractArgs {
        resolver: freelancer,
        ..streaming_args(3, 1_000_000, now)
    };
    assert_rejected(
        env.create(&freelancer, &freelancer_resolver, None),
        E_INVALID_RESOLVER,
        "freelancer as resolver",
    );
}

#[test]
fn reject_expired_acceptance_deadline() {
    let mut env = setup(1_000_000);
    let now = env.now();
    let freelancer = Keypair::new().pubkey();

    let args = CreateContractArgs {
        acceptance_deadline: now - 1,
        ..streaming_args(1, 1_000_000, now)
    };

    assert_rejected(
        env.create(&freelancer, &args, None),
        E_INVALID_ACCEPTANCE_DEADLINE,
        "acceptance deadline in the past",
    );
}

#[test]
fn reject_acceptance_deadline_beyond_max_window() {
    let mut env = setup(1_000_000);
    let now = env.now();
    let freelancer = Keypair::new().pubkey();

    // 91 days: past MAX_ACCEPTANCE_WINDOW, which would park escrowed funds in
    // an unaccepted offer indefinitely.
    let args = CreateContractArgs {
        acceptance_deadline: now + (91 * 24 * 60 * 60),
        ..streaming_args(1, 1_000_000, now)
    };

    assert_rejected(
        env.create(&freelancer, &args, None),
        E_INVALID_ACCEPTANCE_DEADLINE,
        "acceptance deadline beyond the maximum window",
    );
}

#[test]
fn reject_invalid_duration() {
    let mut env = setup(1_000_000);
    let now = env.now();
    let freelancer = Keypair::new().pubkey();

    // Below MIN_DURATION_SECONDS (60).
    let too_short = CreateContractArgs {
        duration_seconds: 30,
        checkpoint_interval: 30,
        ..streaming_args(1, 1_000_000, now)
    };
    assert_rejected(
        env.create(&freelancer, &too_short, None),
        E_INVALID_DURATION,
        "duration below the minimum",
    );

    // Above MAX_DURATION_SECONDS (5 years).
    let too_long = CreateContractArgs {
        duration_seconds: 200_000_000,
        ..streaming_args(2, 1_000_000, now)
    };
    assert_rejected(
        env.create(&freelancer, &too_long, None),
        E_INVALID_DURATION,
        "duration above the maximum",
    );

    // Negative duration must not be readable as "no duration".
    let negative = CreateContractArgs {
        duration_seconds: -3_600,
        ..streaming_args(3, 1_000_000, now)
    };
    assert_rejected(
        env.create(&freelancer, &negative, None),
        E_INVALID_DURATION,
        "negative duration",
    );
}

#[test]
fn reject_invalid_review_duration() {
    let mut env = setup(1_000_000);
    let now = env.now();
    let freelancer = Keypair::new().pubkey();

    // Below MIN_REVIEW_DURATION (10s). A near-zero review window would let a
    // timeout release funds in the slot after submission.
    let too_short = CreateContractArgs {
        review_duration: 5,
        ..streaming_args(1, 1_000_000, now)
    };
    assert_rejected(
        env.create(&freelancer, &too_short, None),
        E_INVALID_REVIEW_DURATION,
        "review duration below the minimum",
    );

    // Longer than the checkpoint period: reviews would queue faster than they
    // clear, stalling the stream.
    let longer_than_period = CreateContractArgs {
        review_duration: 1_800,
        checkpoint_interval: 900,
        ..streaming_args(2, 1_000_000, now)
    };
    assert_rejected(
        env.create(&freelancer, &longer_than_period, None),
        E_INVALID_REVIEW_DURATION,
        "review duration longer than the checkpoint interval",
    );
}

#[test]
fn reject_invalid_streaming_checkpoint_interval() {
    let mut env = setup(1_000_000);
    let now = env.now();
    let freelancer = Keypair::new().pubkey();

    // Streaming with no period at all: no checkpoint could ever close.
    let zero = CreateContractArgs {
        checkpoint_interval: 0,
        ..streaming_args(1, 1_000_000, now)
    };
    assert_rejected(
        env.create(&freelancer, &zero, None),
        E_INVALID_CHECKPOINT_INTERVAL,
        "zero checkpoint interval on a streaming contract",
    );

    // A period longer than the contract itself is equally unusable.
    let longer_than_contract = CreateContractArgs {
        checkpoint_interval: 7_200,
        duration_seconds: 3_600,
        ..streaming_args(2, 1_000_000, now)
    };
    assert_rejected(
        env.create(&freelancer, &longer_than_contract, None),
        E_INVALID_CHECKPOINT_INTERVAL,
        "checkpoint interval longer than the duration",
    );

    let negative = CreateContractArgs {
        checkpoint_interval: -900,
        ..streaming_args(3, 1_000_000, now)
    };
    assert_rejected(
        env.create(&freelancer, &negative, None),
        E_INVALID_CHECKPOINT_INTERVAL,
        "negative checkpoint interval",
    );
}

#[test]
fn reject_too_many_checkpoints() {
    let mut env = setup(1_000_000);
    let now = env.now();
    let freelancer = Keypair::new().pubkey();

    // 5-year duration with a 10-second period would demand millions of child
    // accounts, far past MAX_CHECKPOINTS.
    let args = CreateContractArgs {
        duration_seconds: 157_680_000,
        checkpoint_interval: 10,
        review_duration: 10,
        ..streaming_args(1, 1_000_000, now)
    };

    assert_rejected(
        env.create(&freelancer, &args, None),
        6104,
        "checkpoint count beyond the maximum",
    );
}

#[test]
fn reject_invalid_scheduled_start() {
    let mut env = setup(1_000_000);
    let now = env.now();
    let freelancer = Keypair::new().pubkey();

    // A start before the acceptance deadline would let the earning window open
    // before the freelancer had agreed to anything.
    let args = CreateContractArgs {
        start_mode: StartMode::Scheduled,
        acceptance_deadline: now + 3_600,
        scheduled_start_time: now + 60,
        ..streaming_args(1, 1_000_000, now)
    };

    assert_rejected(
        env.create(&freelancer, &args, None),
        E_INVALID_SCHEDULED_START,
        "scheduled start before the acceptance deadline",
    );
}

#[test]
fn accept_scheduled_start_on_or_after_deadline() {
    let total_amount: u64 = 1_000_000;
    let mut env = setup(total_amount);
    let now = env.now();
    let freelancer = Keypair::new().pubkey();

    let args = CreateContractArgs {
        start_mode: StartMode::Scheduled,
        acceptance_deadline: now + 3_600,
        scheduled_start_time: now + 7_200,
        ..streaming_args(1, total_amount, now)
    };
    let (contract_pda, _) = env.contract_pda(&freelancer, args.contract_id);

    env.create(&freelancer, &args, None)
        .expect("valid scheduled start should be accepted");

    let contract = env.read_contract(&contract_pda);

    // Under Scheduled the term is retained, unlike OnActivation where it is
    // normalized to 0.
    assert_eq!(contract.start_mode, StartMode::Scheduled);
    assert_eq!(contract.scheduled_start_time, now + 7_200);

    // Storing a scheduled start must still not start the contract.
    assert_eq!(contract.status, ContractStatus::PendingAcceptance);
    assert_eq!(contract.start_time, 0);
    assert_eq!(contract.end_time, 0);
    assert!(!contract.status.is_started());
}

#[test]
fn reject_excessive_max_revisions() {
    let mut env = setup(1_000_000);
    let now = env.now();
    let freelancer = Keypair::new().pubkey();

    let args = CreateContractArgs {
        max_revisions: 6,
        ..streaming_args(1, 1_000_000, now)
    };

    assert_rejected(
        env.create(&freelancer, &args, None),
        E_INVALID_MAX_REVISIONS,
        "max_revisions above the limit",
    );
}

#[test]
fn reject_invalid_metadata_uri() {
    let mut env = setup(1_000_000);
    let now = env.now();
    let freelancer = Keypair::new().pubkey();

    // 201 bytes: one past the reserved space for the field.
    let oversized = CreateContractArgs {
        metadata_uri: "u".repeat(201),
        ..streaming_args(1, 1_000_000, now)
    };
    assert_rejected(
        env.create(&freelancer, &oversized, None),
        E_INVALID_METADATA,
        "metadata URI longer than the maximum",
    );

    // A contract with no off-chain record cannot be identified.
    let empty = CreateContractArgs {
        metadata_uri: String::new(),
        ..streaming_args(2, 1_000_000, now)
    };
    assert_rejected(
        env.create(&freelancer, &empty, None),
        E_INVALID_METADATA,
        "empty metadata URI",
    );
}

// ---------------------------------------------------------------------------
// 13-15. Funding and token account integrity.
// ---------------------------------------------------------------------------

#[test]
fn reject_insufficient_token_balance() {
    // Employer holds 1_000_000 but tries to commit 5_000_000.
    let mut env = setup(1_000_000);
    let now = env.now();
    let freelancer = Keypair::new().pubkey();

    let args = streaming_args(1, 5_000_000, now);

    // Rejected by the SPL Token program during the funding CPI, not by us:
    // TokenError::InsufficientFunds.
    assert_rejected(
        env.create(&freelancer, &args, None),
        E_TOKEN_INSUFFICIENT_FUNDS,
        "underfunded employer",
    );
}

#[test]
fn reject_employer_token_account_owned_by_another_wallet() {
    let mut env = setup(1_000_000);
    let now = env.now();
    let freelancer = Keypair::new().pubkey();

    // A token account on the right mint but belonging to somebody else. Without
    // the `token::authority` constraint the employer could fund the escrow from
    // a stranger's balance.
    let victim = Keypair::new().pubkey();
    let victim_account = CreateAccount::new(&mut env.svm, &env.employer, &env.token_mint)
        .owner(&victim)
        .send()
        .expect("Could not create victim token account");

    MintTo::new(
        &mut env.svm,
        &env.employer,
        &env.token_mint,
        &victim_account,
        1_000_000,
    )
    .owner(&env.employer)
    .send()
    .expect("Could not mint to victim");

    let args = streaming_args(1, 1_000_000, now);

    // Rejected by Anchor's `token::authority` constraint.
    assert_rejected(
        env.create(&freelancer, &args, Some(victim_account)),
        E_CONSTRAINT_TOKEN_OWNER,
        "funding from a token account owned by another wallet",
    );

    // The victim keeps every token.
    assert_eq!(env.token_balance(&victim_account), 1_000_000);
}

#[test]
fn reject_employer_token_account_for_wrong_mint() {
    let mut env = setup(1_000_000);
    let now = env.now();
    let freelancer = Keypair::new().pubkey();

    // A second, worthless mint. Without the `token::mint` constraint the
    // employer could fund escrow with this while the contract advertises the
    // valuable mint.
    let other_mint = CreateMint::new(&mut env.svm, &env.employer)
        .authority(&env.employer_pk)
        .decimals(MINT_DECIMALS)
        .send()
        .expect("Could not create second mint");

    let other_account = CreateAccount::new(&mut env.svm, &env.employer, &other_mint)
        .owner(&env.employer_pk)
        .send()
        .expect("Could not create second token account");

    MintTo::new(
        &mut env.svm,
        &env.employer,
        &other_mint,
        &other_account,
        1_000_000,
    )
    .owner(&env.employer)
    .send()
    .expect("Could not mint other tokens");

    let args = streaming_args(1, 1_000_000, now);

    // Rejected by Anchor's `token::mint` constraint.
    assert_rejected(
        env.create(&freelancer, &args, Some(other_account)),
        E_CONSTRAINT_TOKEN_MINT,
        "funding from a token account on a different mint",
    );
}

// ---------------------------------------------------------------------------
// 16-17. PDA namespace behavior.
// ---------------------------------------------------------------------------

#[test]
fn reject_duplicate_contract_id_for_same_pair() {
    let total_amount: u64 = 1_000_000;
    let mut env = setup(total_amount * 2);
    let now = env.now();
    let freelancer = Keypair::new().pubkey();

    let args = streaming_args(77, total_amount, now);

    env.create(&freelancer, &args, None)
        .expect("first create_contract should succeed");

    // The retry must be a genuinely different transaction. Resending the
    // identical one is rejected as a duplicate signature (`AlreadyProcessed`)
    // before it ever reaches the program, which would make this test prove
    // nothing about the PDA namespace.
    env.svm.expire_blockhash();

    // Same employer + freelancer + contract_id derives the same PDA, so the
    // second attempt tries to initialize an account that already exists. This is
    // rejected by the runtime rather than by any check in our program.
    let result = env.create(&freelancer, &args, None);
    let failure = match result {
        Ok(_) => panic!("duplicate contract_id should have been rejected"),
        Err(failure) => failure,
    };

    assert!(
        !matches!(failure.err, TransactionError::AlreadyProcessed),
        "the retry was deduplicated instead of reaching the program, so this \
         test did not exercise the PDA collision"
    );

    // Anchor's `init` finds the account already in use and surfaces the system
    // program's failure to create it a second time.
    let code = error_code(&failure);
    assert_eq!(
        code,
        E_ACCOUNT_ALREADY_IN_USE,
        "unexpected error for a duplicate contract_id\nlogs:\n{}",
        failure.meta.logs.join("\n")
    );

    // Escrow still holds exactly one contract's worth of funding, and the
    // employer was charged exactly once.
    let (contract_pda, _) = env.contract_pda(&freelancer, 77);
    let (escrow_pda, _) = env.escrow_pda(&contract_pda);
    assert_eq!(env.token_balance(&escrow_pda), total_amount);
    assert_eq!(env.token_balance(&env.employer_token_account), total_amount);
}

#[test]
fn allow_same_contract_id_for_a_different_pair() {
    let total_amount: u64 = 1_000_000;
    let mut env = setup(total_amount * 2);
    let now = env.now();

    // The same contract_id under two different freelancers must be two
    // independent contracts, because the freelancer is part of the seeds.
    let freelancer_a = Keypair::new().pubkey();
    let freelancer_b = Keypair::new().pubkey();

    let args = streaming_args(5, total_amount, now);

    env.create(&freelancer_a, &args, None)
        .expect("first pair should succeed");
    env.create(&freelancer_b, &args, None)
        .expect("second pair should succeed with the same contract_id");

    let (pda_a, _) = env.contract_pda(&freelancer_a, 5);
    let (pda_b, _) = env.contract_pda(&freelancer_b, 5);
    assert_ne!(pda_a, pda_b);

    let contract_a = env.read_contract(&pda_a);
    let contract_b = env.read_contract(&pda_b);
    assert_eq!(contract_a.freelancer, freelancer_a);
    assert_eq!(contract_b.freelancer, freelancer_b);
    assert_eq!(contract_a.contract_id, contract_b.contract_id);

    // Each contract has its own separately funded escrow.
    let (escrow_a, _) = env.escrow_pda(&pda_a);
    let (escrow_b, _) = env.escrow_pda(&pda_b);
    assert_ne!(escrow_a, escrow_b);
    assert_eq!(env.token_balance(&escrow_a), total_amount);
    assert_eq!(env.token_balance(&escrow_b), total_amount);
}

// ---------------------------------------------------------------------------
// 18-19. Escrow binding.
// ---------------------------------------------------------------------------

#[test]
fn escrow_is_bound_to_contract_and_mint() {
    let total_amount: u64 = 2_500_000;
    let mut env = setup(total_amount);
    let now = env.now();
    let freelancer = Keypair::new().pubkey();

    let args = streaming_args(11, total_amount, now);
    let (contract_pda, _) = env.contract_pda(&freelancer, args.contract_id);
    let (escrow_pda, escrow_bump) = env.escrow_pda(&contract_pda);

    env.create(&freelancer, &args, None)
        .expect("create_contract should succeed");

    let escrow: SplTokenAccount =
        get_spl_account(&env.svm, &escrow_pda).expect("Could not read escrow");

    // Only this program, signing as the contract PDA, can move these funds.
    // Notably the employer is *not* the authority.
    assert_eq!(escrow.owner, contract_pda);
    assert_ne!(escrow.owner, env.employer_pk);
    assert_ne!(escrow.owner, freelancer);

    // The escrow holds the same asset the contract advertises.
    assert_eq!(escrow.mint, env.token_mint);
    assert_eq!(escrow.amount, total_amount);

    // The escrow account is owned by the SPL Token program itself.
    let raw = env.svm.get_account(&escrow_pda).expect("escrow must exist");
    assert_eq!(raw.owner, TOKEN_ID);

    // The stored bump matches the canonical derivation.
    let contract = env.read_contract(&contract_pda);
    assert_eq!(contract.escrow_bump, escrow_bump);

    // The V2 escrow namespace cannot collide with V1's `b"escrow"`.
    let (v1_style_escrow, _) =
        Address::find_program_address(&[b"escrow", contract_pda.as_ref()], &env.program_id);
    assert_ne!(v1_style_escrow, escrow_pda);
    assert!(env.is_absent(&v1_style_escrow));
}

// ---------------------------------------------------------------------------
// 20. Atomicity.
// ---------------------------------------------------------------------------

#[test]
fn failed_creation_leaves_no_partial_state() {
    let employer_tokens: u64 = 1_000_000;
    let mut env = setup(employer_tokens);
    let now = env.now();
    let freelancer = Keypair::new().pubkey();

    // Fails at the funding CPI, i.e. *after* both accounts were initialized and
    // the contract fields were written. If the transaction were not atomic this
    // is exactly where a half-built contract would survive.
    let args = streaming_args(31, 5_000_000, now);
    let (contract_pda, _) = env.contract_pda(&freelancer, args.contract_id);
    let (escrow_pda, _) = env.escrow_pda(&contract_pda);

    assert_rejected(
        env.create(&freelancer, &args, None),
        E_TOKEN_INSUFFICIENT_FUNDS,
        "underfunded creation",
    );

    // Neither account survives, and the employer's balance is untouched.
    assert!(
        env.is_absent(&contract_pda),
        "no Contract account should remain after a failed creation"
    );
    assert!(
        env.is_absent(&escrow_pda),
        "no escrow account should remain after a failed creation"
    );
    assert_eq!(
        env.token_balance(&env.employer_token_account),
        employer_tokens
    );

    // The same contract_id is still usable, proving nothing was reserved.
    let good = streaming_args(31, employer_tokens, now);
    env.create(&freelancer, &good, None)
        .expect("creation should succeed after the failed attempt");

    // Confirms `is_absent` actually discriminates, so the assertions above were
    // not passing trivially.
    assert!(!env.is_absent(&contract_pda));
    assert!(!env.is_absent(&escrow_pda));

    let contract = env.read_contract(&contract_pda);
    assert_eq!(contract.total_amount, employer_tokens);
    assert_eq!(env.token_balance(&escrow_pda), employer_tokens);
    assert_eq!(env.token_balance(&env.employer_token_account), 0);
}
