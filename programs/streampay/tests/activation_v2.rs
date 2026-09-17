//! StreamPay V2 Phase 3 tests: accept, decline, approve_activation, reject_activation.
//!
//! The main payment stream starts only on employer activation, never on
//! freelancer acceptance. Phase 3 moves no tokens.

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
    StartMode, WorkUnit,
};

const E_INVALID_STATE: u32 = 6111;
const E_ACCEPTANCE_EXPIRED: u32 = 6115;
const E_INVALID_ACTIVATION_REVIEW: u32 = 6148;
const E_APPROVAL_WINDOW_EXPIRED: u32 = 6149;
const E_SCHEDULED_START_ELAPSED: u32 = 6150;
const E_CONSTRAINT_SEEDS: u32 = 2006;
const E_ACCOUNT_NOT_INITIALIZED: u32 = 3012;

const MINT_DECIMALS: u8 = 6;
const BASE_TS: i64 = 1_700_000_000;
const TOTAL_AMOUNT: u64 = 1_000_000;
const OFFSET: i64 = 600;

fn clone_kp(kp: &Keypair) -> Keypair {
    kp.insecure_clone()
}

struct Env {
    svm: LiteSVM,
    program_id: Address,
    employer: Keypair,
    employer_pk: Address,
    freelancer: Keypair,
    freelancer_pk: Address,
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
    let freelancer = Keypair::new();
    let employer_pk = employer.pubkey();
    let freelancer_pk = freelancer.pubkey();
    svm.airdrop(&employer_pk, 10_000_000_000)
        .expect("employer airdrop");
    svm.airdrop(&freelancer_pk, 1_000_000_000)
        .expect("freelancer airdrop");

    let token_mint = CreateMint::new(&mut svm, &employer)
        .authority(&employer_pk)
        .decimals(MINT_DECIMALS)
        .send()
        .expect("mint");
    let employer_token_account = CreateAccount::new(&mut svm, &employer, &token_mint)
        .owner(&employer_pk)
        .send()
        .expect("employer ata");
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
        .expect("mint to employer");
    }

    Env {
        svm,
        program_id,
        employer,
        employer_pk,
        freelancer,
        freelancer_pk,
        token_mint,
        employer_token_account,
    }
}

impl Env {
    fn now(&self) -> i64 {
        self.svm.get_sysvar::<Clock>().unix_timestamp
    }

    fn warp(&mut self, unix_timestamp: i64) {
        let mut clock = self.svm.get_sysvar::<Clock>();
        clock.unix_timestamp = unix_timestamp;
        self.svm.set_sysvar(&clock);
    }

    fn contract_pda(&self, contract_id: u64) -> Address {
        Address::find_program_address(
            &[
                b"contract",
                self.employer_pk.as_ref(),
                self.freelancer_pk.as_ref(),
                &contract_id.to_le_bytes(),
            ],
            &self.program_id,
        )
        .0
    }

    fn escrow_pda(&self, contract: &Address) -> Address {
        Address::find_program_address(&[b"contract_escrow", contract.as_ref()], &self.program_id).0
    }

    fn work_unit_pda(&self, contract: &Address, index: u32) -> Address {
        Address::find_program_address(
            &[b"work_unit", contract.as_ref(), &index.to_le_bytes()],
            &self.program_id,
        )
        .0
    }

    fn token_balance(&self, account: &Address) -> u64 {
        let parsed: SplTokenAccount = get_spl_account(&self.svm, account).unwrap();
        parsed.amount
    }

    fn send(&mut self, instruction: Instruction, signer: &Keypair) -> TransactionResult {
        let payer = signer.pubkey();
        let message = Message::new(&[instruction], Some(&payer));
        let tx = Transaction::new(&[signer], message, self.svm.latest_blockhash());
        self.svm.send_transaction(tx)
    }

    fn send_employer(&mut self, instruction: Instruction) -> TransactionResult {
        let payer = self.employer_pk;
        let message = Message::new(&[instruction], Some(&payer));
        let tx = Transaction::new(&[&self.employer], message, self.svm.latest_blockhash());
        self.svm.send_transaction(tx)
    }

    fn send_freelancer(&mut self, instruction: Instruction) -> TransactionResult {
        let payer = self.freelancer_pk;
        let message = Message::new(&[instruction], Some(&payer));
        let tx = Transaction::new(&[&self.freelancer], message, self.svm.latest_blockhash());
        self.svm.send_transaction(tx)
    }

    fn create(&mut self, args: &CreateContractArgs) -> TransactionResult {
        let contract = self.contract_pda(args.contract_id);
        let contract_escrow = self.escrow_pda(&contract);
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::CreateContract {
                employer: self.employer_pk,
                freelancer: self.freelancer_pk,
                token_mint: self.token_mint,
                employer_token_account: self.employer_token_account,
                contract,
                contract_escrow,
                token_program: TOKEN_ID,
                system_program: anchor_lang::system_program::ID,
            }
            .to_account_metas(None),
            data: streampay_program::instruction::CreateContract { args: args.clone() }.data(),
        };
        self.send_employer(ix)
    }

    fn add_milestone(
        &mut self,
        contract_id: u64,
        amount: u64,
        due_offset_seconds: i64,
    ) -> TransactionResult {
        let contract = self.contract_pda(contract_id);
        let current = self.read_contract(&contract);
        let work_unit = self.work_unit_pda(&contract, current.work_unit_count);
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::AddMilestone {
                employer: self.employer_pk,
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
        };
        self.send_employer(ix)
    }

    fn finalize_terms(&mut self, contract_id: u64) -> TransactionResult {
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::FinalizeTerms {
                employer: self.employer_pk,
                contract: self.contract_pda(contract_id),
            }
            .to_account_metas(None),
            data: streampay_program::instruction::FinalizeTerms {}.data(),
        };
        self.send_employer(ix)
    }

    fn accept(&mut self, contract_id: u64) -> TransactionResult {
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::AcceptContract {
                freelancer: self.freelancer_pk,
                contract: self.contract_pda(contract_id),
            }
            .to_account_metas(None),
            data: streampay_program::instruction::AcceptContract {}.data(),
        };
        self.send_freelancer(ix)
    }

    fn accept_as(
        &mut self,
        signer: &Keypair,
        freelancer: Address,
        contract: Address,
    ) -> TransactionResult {
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::AcceptContract {
                freelancer,
                contract,
            }
            .to_account_metas(None),
            data: streampay_program::instruction::AcceptContract {}.data(),
        };
        self.send(ix, signer)
    }

    fn decline(&mut self, contract_id: u64) -> TransactionResult {
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::DeclineContract {
                freelancer: self.freelancer_pk,
                contract: self.contract_pda(contract_id),
            }
            .to_account_metas(None),
            data: streampay_program::instruction::DeclineContract {}.data(),
        };
        self.send_freelancer(ix)
    }

    fn decline_as(
        &mut self,
        signer: &Keypair,
        freelancer: Address,
        contract: Address,
    ) -> TransactionResult {
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::DeclineContract {
                freelancer,
                contract,
            }
            .to_account_metas(None),
            data: streampay_program::instruction::DeclineContract {}.data(),
        };
        self.send(ix, signer)
    }

    fn approve(&mut self, contract_id: u64) -> TransactionResult {
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::ApproveActivation {
                employer: self.employer_pk,
                contract: self.contract_pda(contract_id),
            }
            .to_account_metas(None),
            data: streampay_program::instruction::ApproveActivation {}.data(),
        };
        self.send_employer(ix)
    }

    fn approve_as(
        &mut self,
        signer: &Keypair,
        employer: Address,
        contract: Address,
    ) -> TransactionResult {
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::ApproveActivation { employer, contract }
                .to_account_metas(None),
            data: streampay_program::instruction::ApproveActivation {}.data(),
        };
        self.send(ix, signer)
    }

    fn reject(&mut self, contract_id: u64) -> TransactionResult {
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::RejectActivation {
                employer: self.employer_pk,
                contract: self.contract_pda(contract_id),
            }
            .to_account_metas(None),
            data: streampay_program::instruction::RejectActivation {}.data(),
        };
        self.send_employer(ix)
    }

    fn reject_as(
        &mut self,
        signer: &Keypair,
        employer: Address,
        contract: Address,
    ) -> TransactionResult {
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::RejectActivation { employer, contract }
                .to_account_metas(None),
            data: streampay_program::instruction::RejectActivation {}.data(),
        };
        self.send(ix, signer)
    }

    fn read_contract(&self, contract: &Address) -> Contract {
        let account = self.svm.get_account(contract).expect("contract missing");
        let mut data: &[u8] = &account.data;
        Contract::try_deserialize(&mut data).expect("deserialize contract")
    }

    fn read_work_unit(&self, work_unit: &Address) -> WorkUnit {
        let account = self.svm.get_account(work_unit).expect("work unit missing");
        let mut data: &[u8] = &account.data;
        WorkUnit::try_deserialize(&mut data).expect("deserialize work unit")
    }

    fn escrow_amount(&self, contract_id: u64) -> u64 {
        self.token_balance(&self.escrow_pda(&self.contract_pda(contract_id)))
    }
}

fn streaming_args(contract_id: u64, now: i64) -> CreateContractArgs {
    CreateContractArgs {
        contract_id,
        payment_mode: PaymentMode::Streaming,
        start_mode: StartMode::OnActivation,
        total_amount: TOTAL_AMOUNT,
        acceptance_deadline: now + 3_600,
        scheduled_start_time: 0,
        duration_seconds: 3_600,
        checkpoint_interval: 900,
        review_duration: 300,
        activation_review_duration: 3_600,
        max_revisions: 2,
        metadata_uri: "ipfs://bafyContractMetadata".to_string(),
        metadata_hash: [7u8; 32],
    }
}

fn fixed_args(contract_id: u64, now: i64) -> CreateContractArgs {
    CreateContractArgs {
        payment_mode: PaymentMode::Fixed,
        checkpoint_interval: 0,
        ..streaming_args(contract_id, now)
    }
}

fn milestone_args(contract_id: u64, now: i64) -> CreateContractArgs {
    CreateContractArgs {
        payment_mode: PaymentMode::Milestone,
        checkpoint_interval: 0,
        ..streaming_args(contract_id, now)
    }
}

fn error_code(failure: &FailedTransactionMetadata) -> u32 {
    match &failure.err {
        TransactionError::InstructionError(_, InstructionError::Custom(code)) => *code,
        other => panic!(
            "expected custom error, got {other:?}\n{}",
            failure.meta.logs.join("\n")
        ),
    }
}

fn assert_rejected(result: TransactionResult, expected: u32, what: &str) {
    let failure = match result {
        Ok(_) => panic!("{what} should have been rejected"),
        Err(failure) => failure,
    };
    let actual = error_code(&failure);
    assert_eq!(
        actual,
        expected,
        "{what}: expected {expected}, got {actual}\n{}",
        failure.meta.logs.join("\n")
    );
}

fn assert_financials_frozen(before: &Contract, after: &Contract) {
    assert_eq!(after.total_amount, before.total_amount);
    assert_eq!(after.released_amount, before.released_amount);
    assert_eq!(after.withdrawn_amount, before.withdrawn_amount);
    assert_eq!(after.refunded_amount, before.refunded_amount);
    assert_eq!(after.allocated_amount, before.allocated_amount);
    assert_eq!(after.work_unit_count, before.work_unit_count);
    assert_eq!(after.released_unit_count, before.released_unit_count);
    assert_eq!(after.voided_unit_count, before.voided_unit_count);
    assert_eq!(after.open_review_count, before.open_review_count);
}

fn create_streaming(env: &mut Env) -> u64 {
    let now = env.now();
    env.create(&streaming_args(1, now)).unwrap();
    1
}

fn create_finalized_milestone(env: &mut Env) -> u64 {
    let now = env.now();
    env.create(&milestone_args(1, now)).unwrap();
    env.add_milestone(1, TOTAL_AMOUNT, OFFSET).unwrap();
    env.finalize_terms(1).unwrap();
    1
}

// ---------------------------------------------------------------------------
// A. Freelancer acceptance
// ---------------------------------------------------------------------------

#[test]
fn freelancer_accepts_streaming_contract() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = create_streaming(&mut env);
    let contract_pda = env.contract_pda(id);
    let before = env.read_contract(&contract_pda);
    let escrow_before = env.escrow_amount(id);
    let now = env.now();

    env.accept(id).expect("accept should succeed");

    let after = env.read_contract(&contract_pda);
    assert_eq!(before.status, ContractStatus::PendingAcceptance);
    assert_eq!(after.status, ContractStatus::PendingEmployerApproval);
    assert_eq!(after.accepted_at, now);
    assert!(after.status.is_accepted());
    assert!(!after.status.is_started());
    assert_eq!(after.start_time, 0);
    assert_eq!(after.end_time, 0);
    assert_eq!(after.last_period_end, 0);
    assert_financials_frozen(&before, &after);
    assert_eq!(env.escrow_amount(id), escrow_before);
    assert_eq!(env.escrow_amount(id), TOTAL_AMOUNT);
}

#[test]
fn freelancer_accepts_fixed_contract() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    env.create(&fixed_args(1, now)).unwrap();
    env.accept(1).unwrap();
    let c = env.read_contract(&env.contract_pda(1));
    assert_eq!(c.payment_mode, PaymentMode::Fixed);
    assert_eq!(c.status, ContractStatus::PendingEmployerApproval);
    assert!(!c.status.is_started());
}

#[test]
fn freelancer_accepts_finalized_milestone_contract() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = create_finalized_milestone(&mut env);
    env.accept(id).unwrap();
    let c = env.read_contract(&env.contract_pda(id));
    assert_eq!(c.status, ContractStatus::PendingEmployerApproval);
    assert_eq!(c.allocated_amount, TOTAL_AMOUNT);
}

#[test]
fn reject_acceptance_by_employer() {
    let mut env = setup(TOTAL_AMOUNT);
    create_streaming(&mut env);
    let employer = clone_kp(&env.employer);
    let pk = env.employer_pk;
    let contract = env.contract_pda(1);
    assert_rejected(
        env.accept_as(&employer, pk, contract),
        E_CONSTRAINT_SEEDS,
        "employer accepting as freelancer",
    );
}

#[test]
fn reject_acceptance_by_third_party() {
    let mut env = setup(TOTAL_AMOUNT);
    create_streaming(&mut env);
    let attacker = Keypair::new();
    env.svm.airdrop(&attacker.pubkey(), 1_000_000_000).unwrap();
    assert_rejected(
        env.accept_as(&attacker, attacker.pubkey(), env.contract_pda(1)),
        E_CONSTRAINT_SEEDS,
        "third party accepting",
    );
}

#[test]
fn reject_acceptance_after_deadline() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    env.create(&streaming_args(1, now)).unwrap();
    env.warp(now + 3_601);
    assert_rejected(env.accept(1), E_ACCEPTANCE_EXPIRED, "accept after deadline");
}

#[test]
fn reject_acceptance_while_draft() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    env.create(&milestone_args(1, now)).unwrap();
    assert_eq!(
        env.read_contract(&env.contract_pda(1)).status,
        ContractStatus::Draft
    );
    assert_rejected(env.accept(1), E_INVALID_STATE, "accept while Draft");
}

#[test]
fn reject_repeated_acceptance() {
    let mut env = setup(TOTAL_AMOUNT);
    create_streaming(&mut env);
    env.accept(1).unwrap();
    env.svm.expire_blockhash();
    assert_rejected(env.accept(1), E_INVALID_STATE, "repeat accept");
}

#[test]
fn reject_invalid_activation_review_at_creation() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    let too_short = CreateContractArgs {
        activation_review_duration: 30,
        ..streaming_args(1, now)
    };
    assert_rejected(
        env.create(&too_short),
        E_INVALID_ACTIVATION_REVIEW,
        "activation review below minimum",
    );
    let too_long = CreateContractArgs {
        activation_review_duration: 86_401,
        ..streaming_args(2, now)
    };
    assert_rejected(
        env.create(&too_long),
        E_INVALID_ACTIVATION_REVIEW,
        "activation review above maximum",
    );
}

// ---------------------------------------------------------------------------
// B. Freelancer decline
// ---------------------------------------------------------------------------

#[test]
fn freelancer_declines_offer() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = create_streaming(&mut env);
    let before = env.read_contract(&env.contract_pda(id));
    let escrow_before = env.escrow_amount(id);
    let now = env.now();

    env.decline(id).expect("decline should succeed");

    let after = env.read_contract(&env.contract_pda(id));
    assert_eq!(after.status, ContractStatus::Declined);
    assert_eq!(after.terminated_at, now);
    assert!(after.status.is_terminal());
    assert!(!after.status.is_accepted());
    assert!(!after.status.is_started());
    assert_eq!(after.start_time, 0);
    assert_financials_frozen(&before, &after);
    assert_eq!(env.escrow_amount(id), escrow_before);
}

#[test]
fn reject_decline_by_employer() {
    let mut env = setup(TOTAL_AMOUNT);
    create_streaming(&mut env);
    let employer = clone_kp(&env.employer);
    let pk = env.employer_pk;
    let contract = env.contract_pda(1);
    assert_rejected(
        env.decline_as(&employer, pk, contract),
        E_CONSTRAINT_SEEDS,
        "employer declining as freelancer",
    );
}

#[test]
fn reject_repeated_decline() {
    let mut env = setup(TOTAL_AMOUNT);
    create_streaming(&mut env);
    env.decline(1).unwrap();
    env.svm.expire_blockhash();
    assert_rejected(env.decline(1), E_INVALID_STATE, "repeat decline");
}

// ---------------------------------------------------------------------------
// C. Employer activation
// ---------------------------------------------------------------------------

#[test]
fn employer_activates_on_activation_streaming_contract() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = create_streaming(&mut env);
    env.accept(id).unwrap();
    let before = env.read_contract(&env.contract_pda(id));
    let escrow_before = env.escrow_amount(id);
    assert_eq!(before.status, ContractStatus::PendingEmployerApproval);

    env.warp(env.now() + 10);
    let activated_at = env.now();
    env.approve(id).expect("approve_activation should succeed");

    let after = env.read_contract(&env.contract_pda(id));
    assert_eq!(after.status, ContractStatus::Active);
    assert!(after.status.is_started());
    assert_eq!(after.start_time, activated_at);
    assert_eq!(after.end_time, activated_at + 3_600);
    assert_eq!(after.last_period_end, activated_at);
    assert_ne!(after.start_time, after.accepted_at);
    assert_financials_frozen(&before, &after);
    assert_eq!(env.escrow_amount(id), escrow_before);
}

#[test]
fn activation_does_not_start_stream_for_fixed() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    env.create(&fixed_args(1, now)).unwrap();
    env.accept(1).unwrap();
    env.approve(1).unwrap();
    let c = env.read_contract(&env.contract_pda(1));
    assert_eq!(c.status, ContractStatus::Active);
    assert_eq!(c.last_period_end, 0);
    assert_eq!(c.start_time, now);
}

#[test]
fn reject_activation_by_freelancer() {
    let mut env = setup(TOTAL_AMOUNT);
    create_streaming(&mut env);
    env.accept(1).unwrap();
    let freelancer = clone_kp(&env.freelancer);
    let pk = env.freelancer_pk;
    let contract = env.contract_pda(1);
    assert_rejected(
        env.approve_as(&freelancer, pk, contract),
        E_CONSTRAINT_SEEDS,
        "freelancer activating",
    );
}

#[test]
fn reject_activation_by_third_party() {
    let mut env = setup(TOTAL_AMOUNT);
    create_streaming(&mut env);
    env.accept(1).unwrap();
    let attacker = Keypair::new();
    env.svm.airdrop(&attacker.pubkey(), 1_000_000_000).unwrap();
    assert_rejected(
        env.approve_as(&attacker, attacker.pubkey(), env.contract_pda(1)),
        E_CONSTRAINT_SEEDS,
        "third party activating",
    );
}

#[test]
fn reject_activation_before_acceptance() {
    let mut env = setup(TOTAL_AMOUNT);
    create_streaming(&mut env);
    assert_rejected(env.approve(1), E_INVALID_STATE, "activate before accept");
}

#[test]
fn reject_repeated_activation() {
    let mut env = setup(TOTAL_AMOUNT);
    create_streaming(&mut env);
    env.accept(1).unwrap();
    env.approve(1).unwrap();
    env.svm.expire_blockhash();
    assert_rejected(env.approve(1), E_INVALID_STATE, "repeat activation");
}

#[test]
fn reject_activation_after_approval_window() {
    let mut env = setup(TOTAL_AMOUNT);
    create_streaming(&mut env);
    env.accept(1).unwrap();
    let accepted_at = env.read_contract(&env.contract_pda(1)).accepted_at;
    env.warp(accepted_at + 3_600);
    assert_rejected(
        env.approve(1),
        E_APPROVAL_WINDOW_EXPIRED,
        "activate after approval window",
    );
}

// ---------------------------------------------------------------------------
// D. Scheduled
// ---------------------------------------------------------------------------

#[test]
fn scheduled_activation_preserves_scheduled_start() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    let args = CreateContractArgs {
        start_mode: StartMode::Scheduled,
        acceptance_deadline: now + 3_600,
        scheduled_start_time: now + 7_200,
        ..streaming_args(1, now)
    };
    env.create(&args).unwrap();
    env.accept(1).unwrap();

    let before = env.read_contract(&env.contract_pda(1));
    assert_eq!(before.status, ContractStatus::PendingEmployerApproval);
    assert_eq!(before.start_time, 0);
    assert!(!before.status.is_started());

    env.approve(1).unwrap();
    let after = env.read_contract(&env.contract_pda(1));
    assert_eq!(after.status, ContractStatus::Active);
    assert_eq!(after.start_time, now + 7_200);
    assert_eq!(after.end_time, now + 7_200 + 3_600);
    assert_eq!(after.last_period_end, now + 7_200);
    assert!(after.start_time > env.now());
}

#[test]
fn reject_late_scheduled_activation() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    // Window stays open past the scheduled start so the elapsed-start error
    // is what fires, not ApprovalWindowExpired.
    let args = CreateContractArgs {
        start_mode: StartMode::Scheduled,
        acceptance_deadline: now + 100,
        scheduled_start_time: now + 100,
        activation_review_duration: 3_600,
        duration_seconds: 3_600,
        ..streaming_args(1, now)
    };
    env.create(&args).unwrap();
    env.accept(1).unwrap();
    env.warp(now + 101);
    assert_rejected(
        env.approve(1),
        E_SCHEDULED_START_ELAPSED,
        "activate after scheduled start",
    );
    assert_eq!(
        env.read_contract(&env.contract_pda(1)).status,
        ContractStatus::PendingEmployerApproval
    );
}

// ---------------------------------------------------------------------------
// E. Employer rejection
// ---------------------------------------------------------------------------

#[test]
fn employer_rejects_activation() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = create_streaming(&mut env);
    env.accept(id).unwrap();
    let before = env.read_contract(&env.contract_pda(id));
    let escrow_before = env.escrow_amount(id);
    let now = env.now();

    env.reject(id).expect("reject_activation should succeed");

    let after = env.read_contract(&env.contract_pda(id));
    assert_eq!(after.status, ContractStatus::ActivationRejected);
    assert_eq!(after.terminated_at, now);
    assert!(after.status.is_terminal());
    assert!(after.status.is_accepted());
    assert!(!after.status.is_started());
    assert_eq!(after.start_time, 0);
    assert_eq!(after.end_time, 0);
    assert_financials_frozen(&before, &after);
    assert_eq!(env.escrow_amount(id), escrow_before);
}

#[test]
fn reject_activation_reject_by_freelancer() {
    let mut env = setup(TOTAL_AMOUNT);
    create_streaming(&mut env);
    env.accept(1).unwrap();
    let freelancer = clone_kp(&env.freelancer);
    let pk = env.freelancer_pk;
    let contract = env.contract_pda(1);
    assert_rejected(
        env.reject_as(&freelancer, pk, contract),
        E_CONSTRAINT_SEEDS,
        "freelancer rejecting activation",
    );
}

#[test]
fn reject_activation_reject_by_third_party() {
    let mut env = setup(TOTAL_AMOUNT);
    create_streaming(&mut env);
    env.accept(1).unwrap();
    let attacker = Keypair::new();
    env.svm.airdrop(&attacker.pubkey(), 1_000_000_000).unwrap();
    assert_rejected(
        env.reject_as(&attacker, attacker.pubkey(), env.contract_pda(1)),
        E_CONSTRAINT_SEEDS,
        "third party rejecting activation",
    );
}

// ---------------------------------------------------------------------------
// F. Accounting / security / milestones
// ---------------------------------------------------------------------------

#[test]
fn fake_contract_pda_rejected() {
    let mut env = setup(TOTAL_AMOUNT);
    create_streaming(&mut env);
    // An address that is not an initialized Contract fails before seed
    // matching: Anchor's `Account<Contract>` requires a live account.
    let fake = Keypair::new().pubkey();
    let swapped = Address::find_program_address(
        &[
            b"contract",
            env.freelancer_pk.as_ref(),
            env.employer_pk.as_ref(),
            &1u64.to_le_bytes(),
        ],
        &env.program_id,
    )
    .0;
    let freelancer = clone_kp(&env.freelancer);
    let freelancer_pk = env.freelancer_pk;
    let employer = clone_kp(&env.employer);
    let employer_pk = env.employer_pk;
    assert_rejected(
        env.accept_as(&freelancer, freelancer_pk, fake),
        E_ACCOUNT_NOT_INITIALIZED,
        "accept random fake PDA",
    );
    assert_rejected(
        env.accept_as(&freelancer, freelancer_pk, swapped),
        E_ACCOUNT_NOT_INITIALIZED,
        "accept swapped-seed PDA",
    );
    assert_rejected(
        env.approve_as(&employer, employer_pk, fake),
        E_ACCOUNT_NOT_INITIALIZED,
        "approve fake PDA",
    );
}

#[test]
fn milestone_work_units_unchanged_through_activation() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = create_finalized_milestone(&mut env);
    let contract = env.contract_pda(id);
    let unit_before = env.read_work_unit(&env.work_unit_pda(&contract, 0));

    env.accept(id).unwrap();
    env.approve(id).unwrap();

    let unit_after = env.read_work_unit(&env.work_unit_pda(&contract, 0));
    assert_eq!(unit_after.due_offset_seconds, OFFSET);
    assert_eq!(
        unit_after.due_offset_seconds,
        unit_before.due_offset_seconds
    );
    assert_eq!(unit_after.amount, unit_before.amount);
    assert_eq!(unit_after.status, unit_before.status);
    assert_eq!(unit_after.submission_uri, unit_before.submission_uri);

    let c = env.read_contract(&contract);
    let due_at = unit_after.due_at(c.start_time).unwrap();
    assert_eq!(due_at, c.start_time + OFFSET);
    assert_eq!(env.escrow_amount(id), TOTAL_AMOUNT);
}

#[test]
fn reject_decline_after_acceptance() {
    let mut env = setup(TOTAL_AMOUNT);
    create_streaming(&mut env);
    env.accept(1).unwrap();
    assert_rejected(env.decline(1), E_INVALID_STATE, "decline after accept");
}

#[test]
fn reject_activation_reject_before_acceptance() {
    let mut env = setup(TOTAL_AMOUNT);
    create_streaming(&mut env);
    assert_rejected(
        env.reject(1),
        E_INVALID_STATE,
        "reject_activation before accept",
    );
}

#[test]
fn reject_approve_after_activation_rejected() {
    let mut env = setup(TOTAL_AMOUNT);
    create_streaming(&mut env);
    env.accept(1).unwrap();
    env.reject(1).unwrap();
    env.svm.expire_blockhash();
    assert_rejected(
        env.approve(1),
        E_INVALID_STATE,
        "activate after employer rejection",
    );
}

#[test]
fn scheduled_activation_at_exact_start_succeeds() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    let args = CreateContractArgs {
        start_mode: StartMode::Scheduled,
        acceptance_deadline: now + 100,
        scheduled_start_time: now + 100,
        activation_review_duration: 3_600,
        duration_seconds: 3_600,
        ..streaming_args(1, now)
    };
    env.create(&args).unwrap();
    env.accept(1).unwrap();
    env.warp(now + 100);
    env.approve(1)
        .expect("activation at scheduled start is allowed");
    let c = env.read_contract(&env.contract_pda(1));
    assert_eq!(c.status, ContractStatus::Active);
    assert_eq!(c.start_time, now + 100);
    assert_eq!(c.end_time, now + 100 + 3_600);
    assert_eq!(c.last_period_end, now + 100);
}

#[test]
fn token_balances_unchanged_by_lifecycle_instructions() {
    let mut env = setup(TOTAL_AMOUNT);
    create_streaming(&mut env);
    let employer_ata = env.employer_token_account;
    assert_eq!(env.token_balance(&employer_ata), 0);
    assert_eq!(env.escrow_amount(1), TOTAL_AMOUNT);

    env.accept(1).unwrap();
    assert_eq!(env.token_balance(&employer_ata), 0);
    assert_eq!(env.escrow_amount(1), TOTAL_AMOUNT);

    env.approve(1).unwrap();
    assert_eq!(env.token_balance(&employer_ata), 0);
    assert_eq!(env.escrow_amount(1), TOTAL_AMOUNT);
}

#[test]
fn token_balances_unchanged_by_pre_activation_rejection() {
    let mut env = setup(TOTAL_AMOUNT);
    create_streaming(&mut env);
    env.accept(1).unwrap();
    env.reject(1).unwrap();
    assert_eq!(env.token_balance(&env.employer_token_account), 0);
    assert_eq!(env.escrow_amount(1), TOTAL_AMOUNT);
    let c = env.read_contract(&env.contract_pda(1));
    assert_eq!(c.total_amount, TOTAL_AMOUNT);
    assert_eq!(c.released_amount, 0);
    assert_eq!(c.withdrawn_amount, 0);
    assert_eq!(c.refunded_amount, 0);
}
