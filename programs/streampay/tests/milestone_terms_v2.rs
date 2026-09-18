//! StreamPay V2 Phase 2 tests: `add_milestone` and `finalize_terms`.
//!
//! Kept in its own target so Phase 1's `create_contract_v2.rs` stays an
//! independent regression suite. These tests run against
//! `target/deploy/streampay.so`; that binary must be rebuilt after any program
//! change or the suite is testing stale code.
//!
//! Negative tests assert exact numeric error codes. Two layers can reject a
//! call here:
//!
//! | layer              | codes       | example                       |
//! |--------------------|-------------|-------------------------------|
//! | our program        | 6100+       | `InvalidAmount` (6100)        |
//! | Anchor constraints | 2000..=2999 | `ConstraintSeeds` (2006)      |
//!
//! Phase 2 performs no token transfer. Escrow conservation is asserted on
//! every successful path.

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
    ReleaseTrigger, StartMode, WorkUnit, WorkUnitKind, WorkUnitStatus,
};

// ---------------------------------------------------------------------------
// Expected error codes.
// ---------------------------------------------------------------------------

const E_INVALID_AMOUNT: u32 = 6100;
const E_INVALID_PAYMENT_MODE: u32 = 6110;
const E_INVALID_STATE: u32 = 6111;
const E_ACCEPTANCE_EXPIRED: u32 = 6115;
const E_MILESTONE_ALLOCATION_EXCEEDED: u32 = 6119;
const E_MILESTONE_ALLOCATION_INCOMPLETE: u32 = 6120;
const E_NO_MILESTONES: u32 = 6121;
const E_STREAMING_HAS_NO_MILESTONES: u32 = 6123;
const E_TOO_MANY_MILESTONES: u32 = 6146;
const E_INVALID_DUE_DATE: u32 = 6147;

// Anchor constraint: seeds did not derive the supplied address.
const E_CONSTRAINT_SEEDS: u32 = 2006;

const MINT_DECIMALS: u8 = 6;
const BASE_TS: i64 = 1_700_000_000;
const TOTAL_AMOUNT: u64 = 1_000_000;

struct Env {
    svm: LiteSVM,
    program_id: Address,
    employer: Keypair,
    employer_pk: Address,
    freelancer: Address,
    token_mint: Address,
    employer_token_account: Address,
}

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
        freelancer: Keypair::new().pubkey(),
        token_mint,
        employer_token_account,
    }
}

impl Env {
    fn now(&self) -> i64 {
        self.svm.get_sysvar::<Clock>().unix_timestamp
    }

    fn contract_pda(&self, contract_id: u64) -> (Address, u8) {
        Address::find_program_address(
            &[
                b"contract",
                self.employer_pk.as_ref(),
                self.freelancer.as_ref(),
                &contract_id.to_le_bytes(),
            ],
            &self.program_id,
        )
    }

    fn escrow_pda(&self, contract: &Address) -> (Address, u8) {
        Address::find_program_address(&[b"contract_escrow", contract.as_ref()], &self.program_id)
    }

    fn work_unit_pda(&self, contract: &Address, index: u32) -> (Address, u8) {
        Address::find_program_address(
            &[b"work_unit", contract.as_ref(), &index.to_le_bytes()],
            &self.program_id,
        )
    }

    fn token_balance(&self, account: &Address) -> u64 {
        let parsed: SplTokenAccount =
            get_spl_account(&self.svm, account).expect("Could not read token account");
        parsed.amount
    }

    fn create(&mut self, args: &CreateContractArgs) -> TransactionResult {
        let (contract, _) = self.contract_pda(args.contract_id);
        let (contract_escrow, _) = self.escrow_pda(&contract);

        let fixed_work_unit = if args.payment_mode == PaymentMode::Fixed {
            Some(self.work_unit_pda(&contract, 0).0)
        } else {
            None
        };

        let instruction = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::CreateContract {
                employer: self.employer_pk,
                freelancer: self.freelancer,
                token_mint: self.token_mint,
                employer_token_account: self.employer_token_account,
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

        self.send_employer(instruction)
    }

    fn add_milestone(
        &mut self,
        contract_id: u64,
        amount: u64,
        due_offset_seconds: i64,
    ) -> TransactionResult {
        let (contract, _) = self.contract_pda(contract_id);
        let current = self.read_contract(&contract);
        let (work_unit, _) = self.work_unit_pda(&contract, current.work_unit_count);
        self.add_milestone_at(contract, work_unit, amount, due_offset_seconds)
    }

    fn add_milestone_at(
        &mut self,
        contract: Address,
        work_unit: Address,
        amount: u64,
        due_offset_seconds: i64,
    ) -> TransactionResult {
        let instruction = add_milestone_ix(
            self.program_id,
            self.employer_pk,
            contract,
            work_unit,
            amount,
            due_offset_seconds,
        );
        self.send_employer(instruction)
    }

    fn add_milestone_as(
        &mut self,
        signer: &Keypair,
        employer_account: Address,
        contract: Address,
        work_unit: Address,
        amount: u64,
        due_offset_seconds: i64,
    ) -> TransactionResult {
        let instruction = add_milestone_ix(
            self.program_id,
            employer_account,
            contract,
            work_unit,
            amount,
            due_offset_seconds,
        );
        send_signed(&mut self.svm, instruction, signer)
    }

    fn finalize_terms(&mut self, contract_id: u64) -> TransactionResult {
        let (contract, _) = self.contract_pda(contract_id);
        let instruction = finalize_ix(self.program_id, self.employer_pk, contract);
        self.send_employer(instruction)
    }

    fn finalize_as(
        &mut self,
        signer: &Keypair,
        employer_account: Address,
        contract: Address,
    ) -> TransactionResult {
        let instruction = finalize_ix(self.program_id, employer_account, contract);
        send_signed(&mut self.svm, instruction, signer)
    }

    fn send_employer(&mut self, instruction: Instruction) -> TransactionResult {
        send_signed(&mut self.svm, instruction, &self.employer)
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

    fn is_absent(&self, address: &Address) -> bool {
        match self.svm.get_account(address) {
            None => true,
            Some(account) => account.data.is_empty() && account.lamports == 0,
        }
    }

    fn warp(&mut self, unix_timestamp: i64) {
        let mut clock = self.svm.get_sysvar::<Clock>();
        clock.unix_timestamp = unix_timestamp;
        self.svm.set_sysvar(&clock);
    }
}

fn send_signed(svm: &mut LiteSVM, instruction: Instruction, signer: &Keypair) -> TransactionResult {
    let payer = signer.pubkey();
    let message = Message::new(&[instruction], Some(&payer));
    let transaction = Transaction::new(&[signer], message, svm.latest_blockhash());
    svm.send_transaction(transaction)
}

fn add_milestone_ix(
    program_id: Address,
    employer: Address,
    contract: Address,
    work_unit: Address,
    amount: u64,
    due_offset_seconds: i64,
) -> Instruction {
    Instruction {
        program_id,
        accounts: streampay_program::accounts::AddMilestone {
            employer,
            contract,
            work_unit,
            system_program: anchor_lang::system_program::ID,
        }
        .to_account_metas(None),
        data: streampay_program::instruction::AddMilestone {
            amount,
            due_offset_seconds,
        }
        .data(),
    }
}

fn finalize_ix(program_id: Address, employer: Address, contract: Address) -> Instruction {
    Instruction {
        program_id,
        accounts: streampay_program::accounts::FinalizeTerms { employer, contract }
            .to_account_metas(None),
        data: streampay_program::instruction::FinalizeTerms {}.data(),
    }
}

fn milestone_args(contract_id: u64, total_amount: u64, now: i64) -> CreateContractArgs {
    CreateContractArgs {
        contract_id,
        payment_mode: PaymentMode::Milestone,
        start_mode: StartMode::OnActivation,
        total_amount,
        acceptance_deadline: now + 3_600,
        scheduled_start_time: 0,
        duration_seconds: 3_600,
        checkpoint_interval: 0,
        review_duration: 300,
        activation_review_duration: 3_600,
        max_revisions: 2,
        trial_amount: 0,
        resolver: Pubkey::new_from_array([0x11; 32]),
        metadata_uri: "ipfs://bafyContractMetadata".to_string(),
        metadata_hash: [7u8; 32],
    }
}

fn streaming_args(contract_id: u64, total_amount: u64, now: i64) -> CreateContractArgs {
    CreateContractArgs {
        payment_mode: PaymentMode::Streaming,
        checkpoint_interval: 900,
        ..milestone_args(contract_id, total_amount, now)
    }
}

fn fixed_args(contract_id: u64, total_amount: u64, now: i64) -> CreateContractArgs {
    CreateContractArgs {
        payment_mode: PaymentMode::Fixed,
        ..milestone_args(contract_id, total_amount, now)
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

/// A valid due offset: 10 minutes into a 1-hour contract.
const OFFSET: i64 = 600;
const OFFSET_MID: i64 = 1_200;
const OFFSET_LATE: i64 = 1_800;
/// Equal to `duration_seconds` in `milestone_args`.
const OFFSET_END: i64 = 3_600;

// ---------------------------------------------------------------------------
// 1. First milestone.
// ---------------------------------------------------------------------------

#[test]
fn add_first_milestone_succeeds() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    env.create(&milestone_args(1, TOTAL_AMOUNT, now))
        .expect("create_contract should succeed");

    let (contract_pda, _) = env.contract_pda(1);
    let (work_unit_pda, work_unit_bump) = env.work_unit_pda(&contract_pda, 0);
    let (escrow_pda, _) = env.escrow_pda(&contract_pda);
    let escrow_before = env.token_balance(&escrow_pda);

    let due = OFFSET;
    env.add_milestone(1, 400_000, due)
        .expect("add_milestone should succeed");

    let work_unit = env.read_work_unit(&work_unit_pda);
    assert_eq!(work_unit.version, 1);
    assert_eq!(work_unit.contract, contract_pda);
    assert_eq!(work_unit.index, 0);
    assert_eq!(work_unit.kind, WorkUnitKind::Milestone);
    assert_eq!(work_unit.status, WorkUnitStatus::Defined);
    assert_eq!(work_unit.amount, 400_000);
    assert_eq!(work_unit.due_offset_seconds, OFFSET);
    assert_eq!(work_unit.period_start, 0);
    assert_eq!(work_unit.period_end, 0);
    assert_eq!(work_unit.submission_uri, "");
    assert_eq!(work_unit.submission_hash, [0u8; 32]);
    assert_eq!(work_unit.submitted_at, 0);
    assert_eq!(work_unit.action_deadline, 0);
    assert_eq!(work_unit.approved_at, 0);
    assert_eq!(work_unit.released_at, 0);
    assert_eq!(work_unit.revision_count, 0);
    assert_eq!(work_unit.release_trigger, ReleaseTrigger::NotReleased);
    assert_eq!(work_unit.bump, work_unit_bump);
    assert_eq!(work_unit.reserved, [0u8; 64]);
    assert!(!work_unit.status.is_open_review());
    assert!(!work_unit.status.is_terminal());

    let contract = env.read_contract(&contract_pda);
    assert_eq!(contract.status, ContractStatus::Draft);
    assert_eq!(contract.allocated_amount, 400_000);
    assert_eq!(contract.work_unit_count, 1);
    assert_eq!(contract.released_amount, 0);
    assert_eq!(contract.withdrawn_amount, 0);
    assert_eq!(contract.refunded_amount, 0);
    assert_eq!(contract.released_unit_count, 0);
    assert_eq!(contract.voided_unit_count, 0);
    assert_eq!(contract.open_review_count, 0);
    assert_eq!(contract.last_milestone_due_offset, OFFSET);
    assert_eq!(contract.total_amount, TOTAL_AMOUNT);
    // Start is still unknown. The offset is a duration, not a calendar date.
    assert_eq!(contract.start_time, 0);
    assert!(!contract.status.is_started());

    assert_eq!(env.token_balance(&escrow_pda), escrow_before);
    assert_eq!(env.token_balance(&escrow_pda), TOTAL_AMOUNT);
}

// ---------------------------------------------------------------------------
// 2. Multiple contiguous milestones.
// ---------------------------------------------------------------------------

#[test]
fn add_multiple_milestones_are_contiguous_and_accumulate() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    env.create(&milestone_args(1, TOTAL_AMOUNT, now))
        .expect("create_contract should succeed");

    let (contract_pda, _) = env.contract_pda(1);

    env.add_milestone(1, 100_000, OFFSET).expect("milestone 0");
    env.add_milestone(1, 200_000, OFFSET_MID)
        .expect("milestone 1");
    env.add_milestone(1, 300_000, OFFSET_LATE)
        .expect("milestone 2");

    let contract = env.read_contract(&contract_pda);
    assert_eq!(contract.work_unit_count, 3);
    assert_eq!(contract.allocated_amount, 600_000);
    assert_eq!(contract.last_milestone_due_offset, OFFSET_LATE);
    assert_eq!(contract.status, ContractStatus::Draft);

    for (index, amount, offset) in [
        (0u32, 100_000u64, OFFSET),
        (1, 200_000, OFFSET_MID),
        (2, 300_000, OFFSET_LATE),
    ] {
        let (pda, _) = env.work_unit_pda(&contract_pda, index);
        let unit = env.read_work_unit(&pda);
        assert_eq!(unit.index, index);
        assert_eq!(unit.amount, amount);
        assert_eq!(unit.due_offset_seconds, offset);
        assert_eq!(unit.contract, contract_pda);
        assert_eq!(unit.kind, WorkUnitKind::Milestone);
        assert_eq!(unit.status, WorkUnitStatus::Defined);
    }
}

// ---------------------------------------------------------------------------
// 3. Finalize a fully allocated contract.
// ---------------------------------------------------------------------------

#[test]
fn finalize_fully_allocated_milestone_contract() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    env.create(&milestone_args(1, TOTAL_AMOUNT, now))
        .expect("create_contract should succeed");

    let (contract_pda, _) = env.contract_pda(1);
    let (escrow_pda, _) = env.escrow_pda(&contract_pda);
    env.add_milestone(1, 400_000, OFFSET).unwrap();
    env.add_milestone(1, 600_000, OFFSET_END).unwrap();

    let before = env.read_contract(&contract_pda);
    assert_eq!(before.status, ContractStatus::Draft);
    assert_eq!(before.allocated_amount, TOTAL_AMOUNT);
    let escrow_before = env.token_balance(&escrow_pda);

    env.finalize_terms(1)
        .expect("finalize_terms should succeed");

    let after = env.read_contract(&contract_pda);
    assert_eq!(after.status, ContractStatus::PendingAcceptance);
    assert_eq!(after.allocated_amount, TOTAL_AMOUNT);
    assert_eq!(after.work_unit_count, 2);
    assert_eq!(after.released_amount, 0);
    assert_eq!(after.withdrawn_amount, 0);
    assert_eq!(after.refunded_amount, 0);
    assert_eq!(after.released_unit_count, 0);
    assert_eq!(after.voided_unit_count, 0);
    assert_eq!(after.open_review_count, 0);
    assert_eq!(after.last_milestone_due_offset, OFFSET_END);
    assert!(!after.status.is_started());
    assert!(!after.status.allows_term_changes());

    assert_eq!(env.token_balance(&escrow_pda), escrow_before);
    assert_eq!(env.token_balance(&escrow_pda), TOTAL_AMOUNT);
}

// ---------------------------------------------------------------------------
// 4–14. add_milestone rejection paths.
// ---------------------------------------------------------------------------

#[test]
fn reject_zero_milestone_amount() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    env.create(&milestone_args(1, TOTAL_AMOUNT, now)).unwrap();

    assert_rejected(
        env.add_milestone(1, 0, OFFSET),
        E_INVALID_AMOUNT,
        "zero milestone amount",
    );
}

#[test]
fn reject_allocation_exceeding_total_amount() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    env.create(&milestone_args(1, TOTAL_AMOUNT, now)).unwrap();

    env.add_milestone(1, 700_000, OFFSET).unwrap();

    assert_rejected(
        env.add_milestone(1, 400_000, OFFSET_MID),
        E_MILESTONE_ALLOCATION_EXCEEDED,
        "allocation exceeding total_amount",
    );

    let (contract_pda, _) = env.contract_pda(1);
    let contract = env.read_contract(&contract_pda);
    assert_eq!(contract.allocated_amount, 700_000);
    assert_eq!(contract.work_unit_count, 1);
}

#[test]
fn reject_milestone_on_streaming_contract() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    env.create(&streaming_args(1, TOTAL_AMOUNT, now)).unwrap();

    assert_rejected(
        env.add_milestone(1, 100_000, OFFSET),
        E_STREAMING_HAS_NO_MILESTONES,
        "milestone on a streaming contract",
    );
}

#[test]
fn reject_milestone_on_fixed_contract() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    env.create(&fixed_args(1, TOTAL_AMOUNT, now)).unwrap();

    assert_rejected(
        env.add_milestone(1, 100_000, OFFSET),
        E_INVALID_PAYMENT_MODE,
        "milestone on a fixed contract",
    );
}

#[test]
fn reject_milestone_by_non_employer() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    env.create(&milestone_args(1, TOTAL_AMOUNT, now)).unwrap();

    let attacker = Keypair::new();
    env.svm
        .airdrop(&attacker.pubkey(), 1_000_000_000)
        .expect("attacker airdrop");

    let (contract, _) = env.contract_pda(1);
    let (work_unit, _) = env.work_unit_pda(&contract, 0);

    // Attacker signs as themselves and names themselves as the employer account.
    // The Contract PDA is seeded with the real employer, so this fails
    // ConstraintSeeds (2006) before `has_one` / Unauthorized is reached.
    assert_rejected(
        env.add_milestone_as(
            &attacker,
            attacker.pubkey(),
            contract,
            work_unit,
            100_000,
            OFFSET,
        ),
        E_CONSTRAINT_SEEDS,
        "milestone by a non-employer",
    );
    assert!(env.is_absent(&work_unit));
}

#[test]
fn reject_milestone_after_acceptance_deadline() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    env.create(&milestone_args(1, TOTAL_AMOUNT, now)).unwrap();

    env.warp(now + 3_601);

    assert_rejected(
        env.add_milestone(1, 100_000, OFFSET),
        E_ACCEPTANCE_EXPIRED,
        "milestone after the acceptance deadline",
    );
}

#[test]
fn reject_milestone_after_finalize_terms() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    env.create(&milestone_args(1, TOTAL_AMOUNT, now)).unwrap();
    env.add_milestone(1, TOTAL_AMOUNT, OFFSET).unwrap();
    env.finalize_terms(1).unwrap();

    assert_rejected(
        env.add_milestone(1, 1, OFFSET_MID),
        E_INVALID_STATE,
        "milestone after terms were finalized",
    );
}

#[test]
fn reject_fake_work_unit_pda() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    env.create(&milestone_args(1, TOTAL_AMOUNT, now)).unwrap();

    let (contract, _) = env.contract_pda(1);
    // Derived as if this were a V1-style seed, or a skipped index.
    let (fake, _) = env.work_unit_pda(&contract, 7);
    let (v1_style, _) =
        Address::find_program_address(&[b"escrow", contract.as_ref()], &env.program_id);

    assert_rejected(
        env.add_milestone_at(contract, fake, 100_000, OFFSET),
        E_CONSTRAINT_SEEDS,
        "WorkUnit PDA derived with a non-next index",
    );
    assert_rejected(
        env.add_milestone_at(contract, v1_style, 100_000, OFFSET),
        E_CONSTRAINT_SEEDS,
        "WorkUnit PDA derived from a V1 seed",
    );
}

#[test]
fn index_is_not_caller_supplied() {
    // The instruction data is only `(amount, due_offset_seconds)`. A caller who wants
    // index 5 still has to pass a PDA, and that PDA is checked against
    // `work_unit_count`, so a skipped index is unrepresentable.
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    env.create(&milestone_args(1, TOTAL_AMOUNT, now)).unwrap();

    let (contract, _) = env.contract_pda(1);
    let (skipped, _) = env.work_unit_pda(&contract, 5);

    assert_rejected(
        env.add_milestone_at(contract, skipped, 100_000, OFFSET),
        E_CONSTRAINT_SEEDS,
        "caller-selected non-contiguous index",
    );

    env.add_milestone(1, 100_000, OFFSET).unwrap();
    let unit = env.read_work_unit(&env.work_unit_pda(&contract, 0).0);
    assert_eq!(unit.index, 0);
}

#[test]
fn reject_too_many_milestones() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    env.create(&milestone_args(1, TOTAL_AMOUNT, now)).unwrap();

    for i in 0..64u32 {
        env.add_milestone(1, 1, i64::from(i) + 1)
            .unwrap_or_else(|_| panic!("milestone {i} should succeed"));
    }

    assert_rejected(
        env.add_milestone(1, 1, 65),
        E_TOO_MANY_MILESTONES,
        "65th milestone",
    );

    let (contract_pda, _) = env.contract_pda(1);
    let contract = env.read_contract(&contract_pda);
    assert_eq!(contract.work_unit_count, 64);
    assert_eq!(contract.allocated_amount, 64);
}

#[test]
fn reject_zero_or_negative_due_offset() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    env.create(&milestone_args(1, TOTAL_AMOUNT, now)).unwrap();

    assert_rejected(
        env.add_milestone(1, 100_000, 0),
        E_INVALID_DUE_DATE,
        "zero due offset",
    );
    assert_rejected(
        env.add_milestone(1, 100_000, -1),
        E_INVALID_DUE_DATE,
        "negative due offset",
    );
}

#[test]
fn reject_due_offset_past_duration() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    env.create(&milestone_args(1, TOTAL_AMOUNT, now)).unwrap();

    assert_rejected(
        env.add_milestone(1, 100_000, OFFSET_END + 1),
        E_INVALID_DUE_DATE,
        "due offset longer than duration_seconds",
    );
}

#[test]
fn reject_duplicate_due_offset() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    env.create(&milestone_args(1, TOTAL_AMOUNT, now)).unwrap();
    env.add_milestone(1, 100_000, OFFSET).unwrap();

    assert_rejected(
        env.add_milestone(1, 100_000, OFFSET),
        E_INVALID_DUE_DATE,
        "duplicate due offset",
    );
}

#[test]
fn reject_decreasing_due_offset() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    env.create(&milestone_args(1, TOTAL_AMOUNT, now)).unwrap();
    env.add_milestone(1, 100_000, OFFSET_MID).unwrap();

    assert_rejected(
        env.add_milestone(1, 100_000, OFFSET),
        E_INVALID_DUE_DATE,
        "decreasing due offset",
    );
}

#[test]
fn on_activation_due_cannot_precede_start() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    env.create(&milestone_args(1, TOTAL_AMOUNT, now)).unwrap();
    env.add_milestone(1, 400_000, OFFSET).unwrap();
    env.add_milestone(1, 600_000, OFFSET_END).unwrap();

    let (contract_pda, _) = env.contract_pda(1);
    let contract = env.read_contract(&contract_pda);

    // The contract has not started. Offsets are durations, so any real start
    // time S produces due times S+offset that are strictly after S.
    assert_eq!(contract.start_mode, StartMode::OnActivation);
    assert_eq!(contract.start_time, 0);
    assert!(!contract.status.is_started());

    for index in [0u32, 1] {
        let unit = env.read_work_unit(&env.work_unit_pda(&contract_pda, index).0);
        assert!(unit.due_offset_seconds > 0);
        // Hypothetical starts, including a late acceptance. Never fabricate
        // start_time on the contract itself.
        for start in [now, now + 1_000, now + 3_600] {
            let due_at = unit.due_at(start).expect("due_at must not overflow");
            assert!(
                due_at > start,
                "milestone {index} would be due at or before start {start}"
            );
            assert!(due_at <= start + contract.duration_seconds);
        }
    }
}

#[test]
fn scheduled_mode_uses_the_same_offset_semantics() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    let args = CreateContractArgs {
        start_mode: StartMode::Scheduled,
        acceptance_deadline: now + 3_600,
        scheduled_start_time: now + 7_200,
        duration_seconds: 3_600,
        ..milestone_args(1, TOTAL_AMOUNT, now)
    };
    env.create(&args).unwrap();

    env.add_milestone(1, 400_000, OFFSET)
        .expect("scheduled contracts store the same relative offset");
    env.add_milestone(1, 600_000, OFFSET_END).unwrap();

    let (contract_pda, _) = env.contract_pda(1);
    let contract = env.read_contract(&contract_pda);
    let unit_0 = env.read_work_unit(&env.work_unit_pda(&contract_pda, 0).0);
    let unit_1 = env.read_work_unit(&env.work_unit_pda(&contract_pda, 1).0);

    assert_eq!(unit_0.due_offset_seconds, OFFSET);
    assert_eq!(unit_1.due_offset_seconds, OFFSET_END);
    // UI can preview the calendar date from the known scheduled start without
    // writing start_time during Draft.
    assert_eq!(contract.start_time, 0);
    assert_eq!(
        unit_0.due_at(contract.scheduled_start_time).unwrap(),
        contract.scheduled_start_time + OFFSET
    );
}

#[test]
fn latest_milestone_may_equal_duration_seconds() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    env.create(&milestone_args(1, TOTAL_AMOUNT, now)).unwrap();
    env.add_milestone(1, TOTAL_AMOUNT, OFFSET_END)
        .expect("a milestone due at the end of the term is valid");

    let (contract_pda, _) = env.contract_pda(1);
    let unit = env.read_work_unit(&env.work_unit_pda(&contract_pda, 0).0);
    assert_eq!(unit.due_offset_seconds, OFFSET_END);
    assert_eq!(
        env.read_contract(&contract_pda).last_milestone_due_offset,
        OFFSET_END
    );
}

// ---------------------------------------------------------------------------
// 15–19. finalize_terms rejection paths.
// ---------------------------------------------------------------------------

#[test]
fn reject_finalize_with_zero_milestones() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    env.create(&milestone_args(1, TOTAL_AMOUNT, now)).unwrap();

    assert_rejected(
        env.finalize_terms(1),
        E_NO_MILESTONES,
        "finalize with zero milestones",
    );
}

#[test]
fn reject_finalize_with_partial_allocation() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    env.create(&milestone_args(1, TOTAL_AMOUNT, now)).unwrap();
    env.add_milestone(1, 400_000, OFFSET).unwrap();

    assert_rejected(
        env.finalize_terms(1),
        E_MILESTONE_ALLOCATION_INCOMPLETE,
        "finalize with partial allocation",
    );

    let (contract_pda, _) = env.contract_pda(1);
    let contract = env.read_contract(&contract_pda);
    assert_eq!(contract.status, ContractStatus::Draft);
}

#[test]
fn reject_finalize_by_non_employer() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    env.create(&milestone_args(1, TOTAL_AMOUNT, now)).unwrap();
    env.add_milestone(1, TOTAL_AMOUNT, OFFSET).unwrap();

    let attacker = Keypair::new();
    env.svm
        .airdrop(&attacker.pubkey(), 1_000_000_000)
        .expect("attacker airdrop");

    let (contract, _) = env.contract_pda(1);
    assert_rejected(
        env.finalize_as(&attacker, attacker.pubkey(), contract),
        E_CONSTRAINT_SEEDS,
        "finalize by a non-employer",
    );

    let contract_state = env.read_contract(&contract);
    assert_eq!(contract_state.status, ContractStatus::Draft);
}

#[test]
fn reject_finalize_after_acceptance_deadline() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    env.create(&milestone_args(1, TOTAL_AMOUNT, now)).unwrap();
    env.add_milestone(1, TOTAL_AMOUNT, OFFSET).unwrap();

    env.warp(now + 3_601);

    assert_rejected(
        env.finalize_terms(1),
        E_ACCEPTANCE_EXPIRED,
        "finalize after the acceptance deadline",
    );
}

#[test]
fn reject_re_finalization() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    env.create(&milestone_args(1, TOTAL_AMOUNT, now)).unwrap();
    env.add_milestone(1, TOTAL_AMOUNT, OFFSET).unwrap();
    env.finalize_terms(1).unwrap();

    env.svm.expire_blockhash();

    assert_rejected(env.finalize_terms(1), E_INVALID_STATE, "re-finalization");
}

// ---------------------------------------------------------------------------
// 20–24. Binding, conservation, and accounting.
// ---------------------------------------------------------------------------

#[test]
fn work_unit_belongs_to_its_contract_and_not_another() {
    let mut env = setup(TOTAL_AMOUNT * 2);
    let now = env.now();
    env.create(&milestone_args(1, TOTAL_AMOUNT, now)).unwrap();
    env.create(&milestone_args(2, TOTAL_AMOUNT, now)).unwrap();

    env.add_milestone(1, 100_000, OFFSET).unwrap();
    env.add_milestone(2, 200_000, OFFSET).unwrap();

    let (contract_1, _) = env.contract_pda(1);
    let (contract_2, _) = env.contract_pda(2);
    let unit_1 = env.read_work_unit(&env.work_unit_pda(&contract_1, 0).0);
    let unit_2 = env.read_work_unit(&env.work_unit_pda(&contract_2, 0).0);

    assert_eq!(unit_1.contract, contract_1);
    assert_eq!(unit_2.contract, contract_2);
    assert_ne!(unit_1.contract, unit_2.contract);
    assert_eq!(unit_1.amount, 100_000);
    assert_eq!(unit_2.amount, 200_000);

    // A WorkUnit PDA for contract 1 cannot be initialized under contract 2.
    let (foreign, _) = env.work_unit_pda(&contract_1, 1);
    assert_rejected(
        env.add_milestone_at(contract_2, foreign, 50_000, OFFSET),
        E_CONSTRAINT_SEEDS,
        "WorkUnit PDA belonging to another contract",
    );
}

#[test]
fn add_milestone_moves_zero_tokens() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    env.create(&milestone_args(1, TOTAL_AMOUNT, now)).unwrap();

    let (contract_pda, _) = env.contract_pda(1);
    let (escrow_pda, _) = env.escrow_pda(&contract_pda);
    let employer_before = env.token_balance(&env.employer_token_account);
    let escrow_before = env.token_balance(&escrow_pda);

    env.add_milestone(1, 250_000, OFFSET).unwrap();

    assert_eq!(env.token_balance(&escrow_pda), escrow_before);
    assert_eq!(
        env.token_balance(&env.employer_token_account),
        employer_before
    );
}

#[test]
fn finalize_terms_moves_zero_tokens() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    env.create(&milestone_args(1, TOTAL_AMOUNT, now)).unwrap();
    env.add_milestone(1, TOTAL_AMOUNT, OFFSET).unwrap();

    let (contract_pda, _) = env.contract_pda(1);
    let (escrow_pda, _) = env.escrow_pda(&contract_pda);
    let employer_before = env.token_balance(&env.employer_token_account);
    let escrow_before = env.token_balance(&escrow_pda);

    env.finalize_terms(1).unwrap();

    assert_eq!(env.token_balance(&escrow_pda), escrow_before);
    assert_eq!(
        env.token_balance(&env.employer_token_account),
        employer_before
    );
}

#[test]
fn unrelated_accounting_counters_stay_zero() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    env.create(&milestone_args(1, TOTAL_AMOUNT, now)).unwrap();
    env.add_milestone(1, 400_000, OFFSET).unwrap();
    env.add_milestone(1, 600_000, OFFSET_MID).unwrap();
    env.finalize_terms(1).unwrap();

    let (contract_pda, _) = env.contract_pda(1);
    let contract = env.read_contract(&contract_pda);

    assert_eq!(contract.released_amount, 0);
    assert_eq!(contract.withdrawn_amount, 0);
    assert_eq!(contract.refunded_amount, 0);
    assert_eq!(contract.released_unit_count, 0);
    assert_eq!(contract.voided_unit_count, 0);
    assert_eq!(contract.open_review_count, 0);
    assert_eq!(contract.start_time, 0);
    assert_eq!(contract.end_time, 0);
    assert_eq!(contract.last_period_end, 0);
    assert_eq!(contract.accepted_at, 0);
    assert!(!contract.status.is_started());
}

#[test]
fn escrow_still_holds_full_total_after_finalization() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    env.create(&milestone_args(1, TOTAL_AMOUNT, now)).unwrap();
    env.add_milestone(1, TOTAL_AMOUNT, OFFSET).unwrap();
    env.finalize_terms(1).unwrap();

    let (contract_pda, _) = env.contract_pda(1);
    let (escrow_pda, _) = env.escrow_pda(&contract_pda);
    assert_eq!(env.token_balance(&escrow_pda), TOTAL_AMOUNT);
    assert_eq!(env.read_contract(&contract_pda).total_amount, TOTAL_AMOUNT);
}
