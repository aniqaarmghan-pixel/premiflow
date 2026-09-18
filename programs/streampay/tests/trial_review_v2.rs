//! StreamPay V2 Phase 4 tests: paid pre-activation trial review.
//!
//! Trial compensation is reserved from `total_amount`. The main stream does
//! not start until the employer approves submitted trial work. Phase 4 moves
//! no SPL tokens except the original create_contract funding.

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

const E_INVALID_METADATA: u32 = 6108;
const E_INVALID_STATE: u32 = 6111;
const E_MILESTONE_ALLOCATION_EXCEEDED: u32 = 6119;
const E_REVISION_LIMIT: u32 = 6134;
const E_REVIEW_WINDOW_CLOSED: u32 = 6133;
const E_APPROVAL_WINDOW_EXPIRED: u32 = 6149;
const E_SCHEDULED_START_ELAPSED: u32 = 6150;
const E_INVALID_TRIAL_AMOUNT: u32 = 6151;
#[allow(dead_code)]
const E_TRIAL_NOT_CONFIGURED: u32 = 6152;
const E_TRIAL_REQUIRED: u32 = 6153;
const E_INVALID_TRIAL_STATE: u32 = 6154;
const E_CONSTRAINT_SEEDS: u32 = 2006;
const E_ACCOUNT_NOT_INITIALIZED: u32 = 3012;

const MINT_DECIMALS: u8 = 6;
const BASE_TS: i64 = 1_700_000_000;
const TOTAL_AMOUNT: u64 = 1_000_000;
const TRIAL_AMOUNT: u64 = 50_000;
const MAIN_AMOUNT: u64 = 950_000;
const OFFSET: i64 = 600;
const SUBMISSION_URI: &str = "ipfs://bafyTrialSubmission";
const SUBMISSION_HASH: [u8; 32] = [9u8; 32];

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
    svm.airdrop(&employer_pk, 10_000_000_000).unwrap();
    svm.airdrop(&freelancer_pk, 1_000_000_000).unwrap();

    let token_mint = CreateMint::new(&mut svm, &employer)
        .authority(&employer_pk)
        .decimals(MINT_DECIMALS)
        .send()
        .unwrap();
    let employer_token_account = CreateAccount::new(&mut svm, &employer, &token_mint)
        .owner(&employer_pk)
        .send()
        .unwrap();
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
        .unwrap();
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

    fn trial_pda(&self, contract: &Address) -> Address {
        Address::find_program_address(&[b"trial_unit", contract.as_ref()], &self.program_id).0
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

    fn escrow_amount(&self, contract_id: u64) -> u64 {
        self.token_balance(&self.escrow_pda(&self.contract_pda(contract_id)))
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
        let trial = if args.trial_amount > 0 {
            Some(self.trial_pda(&contract))
        } else {
            None
        };
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::CreateContract {
                employer: self.employer_pk,
                freelancer: self.freelancer_pk,
                token_mint: self.token_mint,
                employer_token_account: self.employer_token_account,
                contract,
                contract_escrow,
                trial_work_unit: trial,
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

    fn approve_activation(&mut self, contract_id: u64) -> TransactionResult {
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

    fn reject(&mut self, contract_id: u64, with_trial: bool) -> TransactionResult {
        let contract = self.contract_pda(contract_id);
        let trial_work_unit = if with_trial {
            Some(self.trial_pda(&contract))
        } else {
            None
        };
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::RejectActivation {
                employer: self.employer_pk,
                contract,
                trial_work_unit,
            }
            .to_account_metas(None),
            data: streampay_program::instruction::RejectActivation {}.data(),
        };
        self.send_employer(ix)
    }

    fn submit(&mut self, contract_id: u64, uri: &str, hash: [u8; 32]) -> TransactionResult {
        self.submit_as(
            &self.freelancer.insecure_clone(),
            self.freelancer_pk,
            self.contract_pda(contract_id),
            self.trial_pda(&self.contract_pda(contract_id)),
            uri,
            hash,
        )
    }

    fn submit_as(
        &mut self,
        signer: &Keypair,
        freelancer: Address,
        contract: Address,
        trial_work_unit: Address,
        uri: &str,
        hash: [u8; 32],
    ) -> TransactionResult {
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::SubmitTrialWork {
                freelancer,
                contract,
                trial_work_unit,
            }
            .to_account_metas(None),
            data: streampay_program::instruction::SubmitTrialWork {
                submission_uri: uri.to_string(),
                submission_hash: hash,
            }
            .data(),
        };
        self.send(ix, signer)
    }

    fn request_revision(&mut self, contract_id: u64) -> TransactionResult {
        let contract = self.contract_pda(contract_id);
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::RequestTrialRevision {
                employer: self.employer_pk,
                contract,
                trial_work_unit: self.trial_pda(&contract),
            }
            .to_account_metas(None),
            data: streampay_program::instruction::RequestTrialRevision {}.data(),
        };
        self.send_employer(ix)
    }

    fn request_revision_as(
        &mut self,
        signer: &Keypair,
        employer: Address,
        contract: Address,
        trial_work_unit: Address,
    ) -> TransactionResult {
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::RequestTrialRevision {
                employer,
                contract,
                trial_work_unit,
            }
            .to_account_metas(None),
            data: streampay_program::instruction::RequestTrialRevision {}.data(),
        };
        self.send(ix, signer)
    }

    fn approve_trial(&mut self, contract_id: u64) -> TransactionResult {
        let contract = self.contract_pda(contract_id);
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::ApproveTrialAndActivate {
                employer: self.employer_pk,
                contract,
                trial_work_unit: self.trial_pda(&contract),
            }
            .to_account_metas(None),
            data: streampay_program::instruction::ApproveTrialAndActivate {}.data(),
        };
        self.send_employer(ix)
    }

    fn approve_trial_as(
        &mut self,
        signer: &Keypair,
        employer: Address,
        contract: Address,
        trial_work_unit: Address,
    ) -> TransactionResult {
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::ApproveTrialAndActivate {
                employer,
                contract,
                trial_work_unit,
            }
            .to_account_metas(None),
            data: streampay_program::instruction::ApproveTrialAndActivate {}.data(),
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
        trial_amount: 0,
        metadata_uri: "ipfs://bafyContractMetadata".to_string(),
        metadata_hash: [7u8; 32],
    }
}

fn trial_streaming_args(contract_id: u64, now: i64) -> CreateContractArgs {
    CreateContractArgs {
        trial_amount: TRIAL_AMOUNT,
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

fn create_paid_trial(env: &mut Env) -> u64 {
    let now = env.now();
    env.create(&trial_streaming_args(1, now)).unwrap();
    1
}

fn accepted_submitted(env: &mut Env) -> u64 {
    let id = create_paid_trial(env);
    env.accept(id).unwrap();
    env.submit(id, SUBMISSION_URI, SUBMISSION_HASH).unwrap();
    id
}

// ---------------------------------------------------------------------------
// A. Configuration / accounting
// ---------------------------------------------------------------------------

#[test]
fn no_trial_contract_remains_valid() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    env.create(&streaming_args(1, now)).unwrap();
    let c = env.read_contract(&env.contract_pda(1));
    assert_eq!(c.trial_amount, 0);
    assert_eq!(c.main_amount, TOTAL_AMOUNT);
    assert_eq!(c.trial_amount + c.main_amount, c.total_amount);
    assert!(!c.has_trial());
    assert_eq!(env.escrow_amount(1), TOTAL_AMOUNT);
    let trial_pda = env.trial_pda(&env.contract_pda(1));
    assert!(
        env.svm.get_account(&trial_pda).is_none()
            || env.svm.get_account(&trial_pda).unwrap().data.is_empty()
    );
}

#[test]
fn paid_trial_contract_created_successfully() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = create_paid_trial(&mut env);
    let contract = env.contract_pda(id);
    let c = env.read_contract(&contract);
    assert_eq!(c.total_amount, TOTAL_AMOUNT);
    assert_eq!(c.trial_amount, TRIAL_AMOUNT);
    assert_eq!(c.main_amount, MAIN_AMOUNT);
    assert_eq!(c.trial_amount + c.main_amount, c.total_amount);
    assert!(c.has_trial());
    assert_eq!(c.released_amount, 0);
    assert_eq!(c.work_unit_count, 0);
    assert_eq!(env.escrow_amount(id), TOTAL_AMOUNT);

    let trial = env.read_work_unit(&env.trial_pda(&contract));
    assert_eq!(trial.kind, WorkUnitKind::Trial);
    assert_eq!(trial.status, WorkUnitStatus::Defined);
    assert_eq!(trial.amount, TRIAL_AMOUNT);
    assert_eq!(trial.contract, contract);
    assert_eq!(trial.index, 0);
    assert_eq!(trial.revision_count, 0);
    assert_eq!(trial.release_trigger, ReleaseTrigger::NotReleased);
    assert!(trial.submission_uri.is_empty());
    assert_eq!(trial.submission_hash, [0u8; 32]);
    assert_eq!(trial.reserved, [0u8; 64]);
}

#[test]
fn trial_pda_is_deterministic_and_distinct_from_milestone() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = create_paid_trial(&mut env);
    let contract = env.contract_pda(id);
    let trial = env.trial_pda(&contract);
    let milestone0 = env.work_unit_pda(&contract, 0);
    assert_ne!(trial, milestone0);
    assert_eq!(
        trial,
        Address::find_program_address(&[b"trial_unit", contract.as_ref()], &env.program_id).0
    );
}

#[test]
fn reject_zero_trial_with_account_or_missing_account() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    // trial_amount == total leaves no main contract
    let eq_total = CreateContractArgs {
        trial_amount: TOTAL_AMOUNT,
        ..streaming_args(1, now)
    };
    assert_rejected(
        env.create(&eq_total),
        E_INVALID_TRIAL_AMOUNT,
        "trial equal to total",
    );
    let over = CreateContractArgs {
        trial_amount: TOTAL_AMOUNT + 1,
        contract_id: 2,
        ..streaming_args(2, now)
    };
    assert_rejected(
        env.create(&over),
        E_INVALID_TRIAL_AMOUNT,
        "trial over total",
    );
}

#[test]
fn reject_trial_without_trial_account() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    let args = trial_streaming_args(1, now);
    let contract = env.contract_pda(1);
    let ix = Instruction {
        program_id: env.program_id,
        accounts: streampay_program::accounts::CreateContract {
            employer: env.employer_pk,
            freelancer: env.freelancer_pk,
            token_mint: env.token_mint,
            employer_token_account: env.employer_token_account,
            contract,
            contract_escrow: env.escrow_pda(&contract),
            trial_work_unit: None,
            token_program: TOKEN_ID,
            system_program: anchor_lang::system_program::ID,
        }
        .to_account_metas(None),
        data: streampay_program::instruction::CreateContract { args }.data(),
    };
    assert_rejected(
        env.send_employer(ix),
        E_TRIAL_REQUIRED,
        "trial amount without trial account",
    );
}

// ---------------------------------------------------------------------------
// B. Acceptance
// ---------------------------------------------------------------------------

#[test]
fn freelancer_accepts_paid_trial_without_starting_stream() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = create_paid_trial(&mut env);
    env.accept(id).unwrap();
    let c = env.read_contract(&env.contract_pda(id));
    assert_eq!(c.status, ContractStatus::PendingEmployerApproval);
    assert!(!c.status.is_started());
    assert_eq!(c.start_time, 0);
    assert_eq!(c.released_amount, 0);
    assert_eq!(env.escrow_amount(id), TOTAL_AMOUNT);
    let trial = env.read_work_unit(&env.trial_pda(&env.contract_pda(id)));
    assert_eq!(trial.status, WorkUnitStatus::Defined);
}

// ---------------------------------------------------------------------------
// C. Submission
// ---------------------------------------------------------------------------

#[test]
fn freelancer_submits_trial() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = create_paid_trial(&mut env);
    env.accept(id).unwrap();
    let now = env.now();
    env.submit(id, SUBMISSION_URI, SUBMISSION_HASH).unwrap();
    let contract = env.contract_pda(id);
    let trial = env.read_work_unit(&env.trial_pda(&contract));
    assert_eq!(trial.status, WorkUnitStatus::Submitted);
    assert_eq!(trial.submission_uri, SUBMISSION_URI);
    assert_eq!(trial.submission_hash, SUBMISSION_HASH);
    assert_eq!(trial.submitted_at, now);
    assert_eq!(trial.action_deadline, now + 300);
    let c = env.read_contract(&contract);
    assert_eq!(c.open_review_count, 1);
    assert_eq!(c.released_amount, 0);
    assert_eq!(c.status, ContractStatus::PendingEmployerApproval);
    assert_eq!(env.escrow_amount(id), TOTAL_AMOUNT);
    assert_eq!(env.token_balance(&env.employer_token_account), 0);
}

#[test]
fn reject_submit_by_employer_or_third_party_or_before_accept() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = create_paid_trial(&mut env);
    let contract = env.contract_pda(id);
    let trial = env.trial_pda(&contract);
    let employer = clone_kp(&env.employer);
    assert_rejected(
        env.submit_as(
            &employer,
            env.employer_pk,
            contract,
            trial,
            SUBMISSION_URI,
            SUBMISSION_HASH,
        ),
        E_CONSTRAINT_SEEDS,
        "employer submitting trial",
    );
    let attacker = Keypair::new();
    env.svm.airdrop(&attacker.pubkey(), 1_000_000_000).unwrap();
    assert_rejected(
        env.submit_as(
            &attacker,
            attacker.pubkey(),
            contract,
            trial,
            SUBMISSION_URI,
            SUBMISSION_HASH,
        ),
        E_CONSTRAINT_SEEDS,
        "third party submitting",
    );
    assert_rejected(
        env.submit(id, SUBMISSION_URI, SUBMISSION_HASH),
        E_INVALID_STATE,
        "submit before accept",
    );
}

#[test]
fn reject_empty_submission_uri() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = create_paid_trial(&mut env);
    env.accept(id).unwrap();
    assert_rejected(
        env.submit(id, "", SUBMISSION_HASH),
        E_INVALID_METADATA,
        "empty submission uri",
    );
}

// ---------------------------------------------------------------------------
// D. Revision
// ---------------------------------------------------------------------------

#[test]
fn employer_requests_revision_and_freelancer_resubmits() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = accepted_submitted(&mut env);
    env.request_revision(id).unwrap();
    let contract = env.contract_pda(id);
    let trial = env.read_work_unit(&env.trial_pda(&contract));
    assert_eq!(trial.status, WorkUnitStatus::Revising);
    assert_eq!(trial.revision_count, 1);
    let deadline_after_revision = trial.action_deadline;

    env.warp(env.now() + 10);
    let resub_hash = [3u8; 32];
    env.submit(id, "ipfs://bafyTrialResubmission", resub_hash)
        .unwrap();
    let trial = env.read_work_unit(&env.trial_pda(&contract));
    assert_eq!(trial.status, WorkUnitStatus::Submitted);
    assert_eq!(trial.revision_count, 1);
    assert_eq!(trial.submission_uri, "ipfs://bafyTrialResubmission");
    assert_eq!(trial.submission_hash, resub_hash);
    assert!(trial.action_deadline > deadline_after_revision);
    assert_eq!(env.read_contract(&contract).open_review_count, 1);
}

#[test]
fn reject_revision_beyond_max_and_by_wrong_party() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = accepted_submitted(&mut env);
    env.request_revision(id).unwrap();
    env.submit(id, "ipfs://bafyR2", [4u8; 32]).unwrap();
    env.svm.expire_blockhash();
    env.request_revision(id).unwrap(); // revision_count = 2 == max_revisions
    env.submit(id, "ipfs://bafyR3", [5u8; 32]).unwrap();
    env.svm.expire_blockhash();
    assert_rejected(
        env.request_revision(id),
        E_REVISION_LIMIT,
        "revision beyond max",
    );

    let mut env = setup(TOTAL_AMOUNT);
    let id = accepted_submitted(&mut env);
    let contract = env.contract_pda(id);
    let trial = env.trial_pda(&contract);
    let freelancer = clone_kp(&env.freelancer);
    assert_rejected(
        env.request_revision_as(&freelancer, env.freelancer_pk, contract, trial),
        E_CONSTRAINT_SEEDS,
        "freelancer requesting revision",
    );
    let attacker = Keypair::new();
    env.svm.airdrop(&attacker.pubkey(), 1_000_000_000).unwrap();
    assert_rejected(
        env.request_revision_as(&attacker, attacker.pubkey(), contract, trial),
        E_CONSTRAINT_SEEDS,
        "third party requesting revision",
    );
}

#[test]
fn reject_revision_after_approval() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = accepted_submitted(&mut env);
    env.approve_trial(id).unwrap();
    env.svm.expire_blockhash();
    assert_rejected(
        env.request_revision(id),
        E_INVALID_STATE,
        "revision after approval",
    );
}

#[test]
fn reject_revision_after_review_window() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = accepted_submitted(&mut env);
    let trial = env.read_work_unit(&env.trial_pda(&env.contract_pda(id)));
    env.warp(trial.action_deadline);
    assert_rejected(
        env.request_revision(id),
        E_REVIEW_WINDOW_CLOSED,
        "revision after review window",
    );
}

// ---------------------------------------------------------------------------
// E. Approval / activation
// ---------------------------------------------------------------------------

#[test]
fn employer_approves_trial_and_activates() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = accepted_submitted(&mut env);
    env.warp(env.now() + 5);
    let activated_at = env.now();
    let before = env.read_contract(&env.contract_pda(id));
    env.approve_trial(id).unwrap();

    let contract = env.contract_pda(id);
    let c = env.read_contract(&contract);
    assert_eq!(c.status, ContractStatus::Active);
    assert_eq!(c.start_time, activated_at);
    assert_eq!(c.end_time, activated_at + 3_600);
    assert_eq!(c.last_period_end, activated_at);
    assert_eq!(c.released_amount, TRIAL_AMOUNT);
    assert_eq!(c.withdrawn_amount, 0);
    assert_eq!(c.released_unit_count, 1);
    assert_eq!(c.open_review_count, 0);
    assert_eq!(c.main_amount, MAIN_AMOUNT);
    assert_eq!(c.trial_amount, TRIAL_AMOUNT);
    assert_eq!(c.allocated_amount, before.allocated_amount);
    assert_eq!(env.escrow_amount(id), TOTAL_AMOUNT);
    assert_eq!(env.token_balance(&env.employer_token_account), 0);

    let trial = env.read_work_unit(&env.trial_pda(&contract));
    assert_eq!(trial.status, WorkUnitStatus::Released);
    assert_eq!(trial.release_trigger, ReleaseTrigger::EmployerApproval);
    assert_eq!(trial.approved_at, activated_at);
    assert_eq!(trial.released_at, activated_at);
    assert_eq!(trial.amount, TRIAL_AMOUNT);
}

#[test]
fn reject_approve_trial_by_freelancer_third_party_before_submit_or_twice() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = create_paid_trial(&mut env);
    env.accept(id).unwrap();
    let contract = env.contract_pda(id);
    let trial = env.trial_pda(&contract);
    assert_rejected(
        env.approve_trial(id),
        E_INVALID_TRIAL_STATE,
        "approve before submission",
    );
    env.svm.expire_blockhash();

    env.submit(id, SUBMISSION_URI, SUBMISSION_HASH).unwrap();
    let freelancer = clone_kp(&env.freelancer);
    assert_rejected(
        env.approve_trial_as(&freelancer, env.freelancer_pk, contract, trial),
        E_CONSTRAINT_SEEDS,
        "freelancer approving trial",
    );
    let attacker = Keypair::new();
    env.svm.airdrop(&attacker.pubkey(), 1_000_000_000).unwrap();
    assert_rejected(
        env.approve_trial_as(&attacker, attacker.pubkey(), contract, trial),
        E_CONSTRAINT_SEEDS,
        "third party approving trial",
    );

    env.approve_trial(id).unwrap();
    env.svm.expire_blockhash();
    assert_rejected(env.approve_trial(id), E_INVALID_STATE, "approve twice");
}

#[test]
fn approve_trial_on_no_trial_contract_rejected() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    env.create(&streaming_args(1, now)).unwrap();
    env.accept(1).unwrap();
    // Uninitialized trial PDA
    assert_rejected(
        env.approve_trial(1),
        E_ACCOUNT_NOT_INITIALIZED,
        "approve_trial on no-trial contract",
    );
}

// ---------------------------------------------------------------------------
// F. Bypass protection
// ---------------------------------------------------------------------------

#[test]
fn approve_activation_rejects_paid_trial_but_works_without_trial() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = create_paid_trial(&mut env);
    env.accept(id).unwrap();
    env.submit(id, SUBMISSION_URI, SUBMISSION_HASH).unwrap();
    assert_rejected(
        env.approve_activation(id),
        E_TRIAL_REQUIRED,
        "bypass trial via approve_activation",
    );

    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    env.create(&streaming_args(1, now)).unwrap();
    env.accept(1).unwrap();
    env.approve_activation(1).unwrap();
    assert_eq!(
        env.read_contract(&env.contract_pda(1)).status,
        ContractStatus::Active
    );
}

// ---------------------------------------------------------------------------
// G. Rejection
// ---------------------------------------------------------------------------

#[test]
fn reject_before_submission_is_activation_rejected() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = create_paid_trial(&mut env);
    env.accept(id).unwrap();
    let now = env.now();
    env.reject(id, true).unwrap();
    let c = env.read_contract(&env.contract_pda(id));
    assert_eq!(c.status, ContractStatus::ActivationRejected);
    assert_eq!(c.terminated_at, now);
    assert!(!c.status.is_started());
    assert_eq!(c.released_amount, 0);
    assert_eq!(env.escrow_amount(id), TOTAL_AMOUNT);
}

#[test]
fn reject_submitted_trial_is_disputed() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = accepted_submitted(&mut env);
    let now = env.now();
    env.reject(id, true).unwrap();
    let c = env.read_contract(&env.contract_pda(id));
    assert_eq!(c.status, ContractStatus::Disputed);
    assert_eq!(c.terminated_at, now);
    assert!(c.status.is_terminal());
    assert!(!c.status.is_started());
    assert_eq!(c.released_amount, 0);
    assert_eq!(env.escrow_amount(id), TOTAL_AMOUNT);
    let trial = env.read_work_unit(&env.trial_pda(&env.contract_pda(id)));
    assert_eq!(trial.status, WorkUnitStatus::Submitted);
}

#[test]
fn reject_activation_wrong_party() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = accepted_submitted(&mut env);
    let freelancer = clone_kp(&env.freelancer);
    let ix = Instruction {
        program_id: env.program_id,
        accounts: streampay_program::accounts::RejectActivation {
            employer: env.freelancer_pk,
            contract: env.contract_pda(id),
            trial_work_unit: Some(env.trial_pda(&env.contract_pda(id))),
        }
        .to_account_metas(None),
        data: streampay_program::instruction::RejectActivation {}.data(),
    };
    assert_rejected(
        env.send(ix, &freelancer),
        E_CONSTRAINT_SEEDS,
        "freelancer rejecting trial",
    );
}

// ---------------------------------------------------------------------------
// H. Scheduled
// ---------------------------------------------------------------------------

#[test]
fn scheduled_trial_approval_preserves_start() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    let args = CreateContractArgs {
        start_mode: StartMode::Scheduled,
        acceptance_deadline: now + 3_600,
        scheduled_start_time: now + 7_200,
        trial_amount: TRIAL_AMOUNT,
        ..streaming_args(1, now)
    };
    env.create(&args).unwrap();
    env.accept(1).unwrap();
    env.submit(1, SUBMISSION_URI, SUBMISSION_HASH).unwrap();
    env.approve_trial(1).unwrap();
    let c = env.read_contract(&env.contract_pda(1));
    assert_eq!(c.status, ContractStatus::Active);
    assert_eq!(c.start_time, now + 7_200);
    assert_eq!(c.end_time, now + 7_200 + 3_600);
    assert_eq!(c.last_period_end, now + 7_200);
    assert!(c.start_time > env.now());
    assert_eq!(c.released_amount, TRIAL_AMOUNT);
    assert_eq!(c.main_amount, MAIN_AMOUNT);
}

#[test]
fn late_scheduled_trial_approval_rejected() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    let args = CreateContractArgs {
        start_mode: StartMode::Scheduled,
        acceptance_deadline: now + 100,
        scheduled_start_time: now + 100,
        activation_review_duration: 3_600,
        trial_amount: TRIAL_AMOUNT,
        ..streaming_args(1, now)
    };
    env.create(&args).unwrap();
    env.accept(1).unwrap();
    env.submit(1, SUBMISSION_URI, SUBMISSION_HASH).unwrap();
    env.warp(now + 101);
    assert_rejected(
        env.approve_trial(1),
        E_SCHEDULED_START_ELAPSED,
        "late scheduled trial approval",
    );
}

// ---------------------------------------------------------------------------
// I. Milestone interaction
// ---------------------------------------------------------------------------

#[test]
fn trial_plus_milestones_use_main_amount() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    let args = CreateContractArgs {
        payment_mode: PaymentMode::Milestone,
        checkpoint_interval: 0,
        trial_amount: TRIAL_AMOUNT,
        ..streaming_args(1, now)
    };
    env.create(&args).unwrap();
    let contract = env.contract_pda(1);
    assert_ne!(env.trial_pda(&contract), env.work_unit_pda(&contract, 0));

    assert_rejected(
        env.add_milestone(1, TOTAL_AMOUNT, OFFSET),
        E_MILESTONE_ALLOCATION_EXCEEDED,
        "milestone using full total including trial",
    );
    env.add_milestone(1, MAIN_AMOUNT, OFFSET).unwrap();
    env.finalize_terms(1).unwrap();

    let c = env.read_contract(&contract);
    assert_eq!(c.allocated_amount, MAIN_AMOUNT);
    assert_eq!(c.allocated_amount + c.trial_amount, c.total_amount);
    assert_eq!(c.work_unit_count, 1);
    let unit = env.read_work_unit(&env.work_unit_pda(&contract, 0));
    assert_eq!(unit.kind, WorkUnitKind::Milestone);
    assert_eq!(unit.due_offset_seconds, OFFSET);
    assert_eq!(unit.index, 0);

    env.accept(1).unwrap();
    env.submit(1, SUBMISSION_URI, SUBMISSION_HASH).unwrap();
    env.approve_trial(1).unwrap();
    let c = env.read_contract(&contract);
    assert_eq!(c.status, ContractStatus::Active);
    let unit = env.read_work_unit(&env.work_unit_pda(&contract, 0));
    assert_eq!(unit.due_offset_seconds, OFFSET);
    assert_eq!(unit.amount, MAIN_AMOUNT);
}

// ---------------------------------------------------------------------------
// J. Security / conservation
// ---------------------------------------------------------------------------

#[test]
fn fake_and_cross_contract_trial_pdas_rejected() {
    let mut env = setup(TOTAL_AMOUNT * 2);
    let id = create_paid_trial(&mut env);
    env.accept(id).unwrap();
    let contract = env.contract_pda(id);
    let fake = Keypair::new().pubkey();
    let freelancer = clone_kp(&env.freelancer);
    assert_rejected(
        env.submit_as(
            &freelancer,
            env.freelancer_pk,
            contract,
            fake,
            SUBMISSION_URI,
            SUBMISSION_HASH,
        ),
        E_ACCOUNT_NOT_INITIALIZED,
        "submit fake trial PDA",
    );
    let milestone_ns = env.work_unit_pda(&contract, 0);
    assert_rejected(
        env.submit_as(
            &freelancer,
            env.freelancer_pk,
            contract,
            milestone_ns,
            SUBMISSION_URI,
            SUBMISSION_HASH,
        ),
        E_ACCOUNT_NOT_INITIALIZED,
        "submit milestone PDA as trial",
    );

    // Second contract, attempt to use its trial on the first.
    env.create(&trial_streaming_args(2, env.now())).unwrap();
    let other_trial = env.trial_pda(&env.contract_pda(2));
    assert_rejected(
        env.submit_as(
            &freelancer,
            env.freelancer_pk,
            contract,
            other_trial,
            SUBMISSION_URI,
            SUBMISSION_HASH,
        ),
        E_CONSTRAINT_SEEDS,
        "cross-contract trial WorkUnit",
    );
}

#[test]
fn fake_contract_pda_rejected() {
    let mut env = setup(TOTAL_AMOUNT);
    create_paid_trial(&mut env);
    let fake = Keypair::new().pubkey();
    let freelancer = clone_kp(&env.freelancer);
    assert_rejected(
        env.submit_as(
            &freelancer,
            env.freelancer_pk,
            fake,
            env.trial_pda(&env.contract_pda(1)),
            SUBMISSION_URI,
            SUBMISSION_HASH,
        ),
        E_ACCOUNT_NOT_INITIALIZED,
        "submit with fake contract",
    );
}

#[test]
fn counters_consistent_through_full_trial_path() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = accepted_submitted(&mut env);
    env.approve_trial(id).unwrap();
    let c = env.read_contract(&env.contract_pda(id));
    assert_eq!(c.total_amount, TOTAL_AMOUNT);
    assert_eq!(c.trial_amount + c.main_amount, c.total_amount);
    assert_eq!(c.released_amount, TRIAL_AMOUNT);
    assert_eq!(c.withdrawn_amount, 0);
    assert_eq!(c.refunded_amount, 0);
    assert_eq!(env.escrow_amount(id), TOTAL_AMOUNT);
    assert_eq!(
        env.escrow_amount(id),
        c.total_amount - c.withdrawn_amount - c.refunded_amount
    );
}

#[test]
fn cannot_submit_after_approval_window() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = create_paid_trial(&mut env);
    env.accept(id).unwrap();
    let accepted_at = env.read_contract(&env.contract_pda(id)).accepted_at;
    env.warp(accepted_at + 3_600);
    assert_rejected(
        env.submit(id, SUBMISSION_URI, SUBMISSION_HASH),
        E_APPROVAL_WINDOW_EXPIRED,
        "submit after activation window",
    );
}
