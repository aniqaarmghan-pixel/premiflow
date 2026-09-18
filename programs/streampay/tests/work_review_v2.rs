//! StreamPay V2 Phase 5 tests: post-activation work-unit review.
//!
//! After activation, Milestone and Fixed work is submitted, reviewed, revised,
//! or timeout-released. Phase 5 moves no SPL tokens. Streaming review is
//! intentionally unsupported so time-based earning cannot be collapsed into a
//! single generic approval.

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
#[allow(dead_code)]
const E_INVALID_PAYMENT_MODE: u32 = 6110;
const E_INVALID_STATE: u32 = 6111;
const E_CONTRACT_NOT_STARTED: u32 = 6112;
const E_UNIT_NOT_SUBMITTABLE: u32 = 6126;
const E_UNIT_NOT_UNDER_REVIEW: u32 = 6127;
const E_UNIT_ALREADY_RELEASED: u32 = 6128;
const E_REVIEW_WINDOW_OPEN: u32 = 6132;
const E_REVISION_LIMIT: u32 = 6134;
const E_CONSTRAINT_SEEDS: u32 = 2006;
const E_ACCOUNT_NOT_INITIALIZED: u32 = 3012;

const MINT_DECIMALS: u8 = 6;
const BASE_TS: i64 = 1_700_000_000;
const TOTAL_AMOUNT: u64 = 1_000_000;
const TRIAL_AMOUNT: u64 = 50_000;
const MAIN_AMOUNT: u64 = 950_000;
const OFFSET: i64 = 600;
const REVIEW_DURATION: i64 = 300;
const SUBMISSION_URI: &str = "ipfs://bafyMainSubmission";
const SUBMISSION_HASH: [u8; 32] = [11u8; 32];
const RESUBMIT_URI: &str = "ipfs://bafyMainResubmit";
const RESUBMIT_HASH: [u8; 32] = [12u8; 32];

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
    outsider: Keypair,
    outsider_pk: Address,
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
    let outsider = Keypair::new();
    let employer_pk = employer.pubkey();
    let freelancer_pk = freelancer.pubkey();
    let outsider_pk = outsider.pubkey();
    svm.airdrop(&employer_pk, 10_000_000_000).unwrap();
    svm.airdrop(&freelancer_pk, 1_000_000_000).unwrap();
    svm.airdrop(&outsider_pk, 1_000_000_000).unwrap();

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
        outsider,
        outsider_pk,
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
        self.svm.expire_blockhash();
        let payer = signer.pubkey();
        let message = Message::new(&[instruction], Some(&payer));
        let tx = Transaction::new(&[signer], message, self.svm.latest_blockhash());
        self.svm.send_transaction(tx)
    }

    fn send_employer(&mut self, instruction: Instruction) -> TransactionResult {
        self.send(instruction, &clone_kp(&self.employer))
    }

    fn send_freelancer(&mut self, instruction: Instruction) -> TransactionResult {
        self.send(instruction, &clone_kp(&self.freelancer))
    }

    fn create(&mut self, args: &CreateContractArgs) -> TransactionResult {
        let contract = self.contract_pda(args.contract_id);
        let trial = if args.trial_amount > 0 {
            Some(self.trial_pda(&contract))
        } else {
            None
        };
        let fixed_work_unit = if args.payment_mode == PaymentMode::Fixed {
            Some(self.work_unit_pda(&contract, 0))
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
                contract_escrow: self.escrow_pda(&contract),
                trial_work_unit: trial,
                fixed_work_unit,
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

    fn submit_trial(&mut self, contract_id: u64) -> TransactionResult {
        let contract = self.contract_pda(contract_id);
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::SubmitTrialWork {
                freelancer: self.freelancer_pk,
                contract,
                trial_work_unit: self.trial_pda(&contract),
            }
            .to_account_metas(None),
            data: streampay_program::instruction::SubmitTrialWork {
                submission_uri: SUBMISSION_URI.to_string(),
                submission_hash: SUBMISSION_HASH,
            }
            .data(),
        };
        self.send_freelancer(ix)
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

    fn submit_ix(
        &self,
        freelancer: Address,
        contract: Address,
        work_unit: Address,
        uri: &str,
        hash: [u8; 32],
    ) -> Instruction {
        Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::SubmitWorkUnit {
                freelancer,
                contract,
                work_unit,
            }
            .to_account_metas(None),
            data: streampay_program::instruction::SubmitWorkUnit {
                submission_uri: uri.to_string(),
                submission_hash: hash,
            }
            .data(),
        }
    }

    fn submit(&mut self, contract_id: u64, index: u32) -> TransactionResult {
        let contract = self.contract_pda(contract_id);
        let ix = self.submit_ix(
            self.freelancer_pk,
            contract,
            self.work_unit_pda(&contract, index),
            SUBMISSION_URI,
            SUBMISSION_HASH,
        );
        self.send_freelancer(ix)
    }

    fn approve_ix(&self, employer: Address, contract: Address, work_unit: Address) -> Instruction {
        Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::ApproveWorkUnit {
                employer,
                contract,
                work_unit,
            }
            .to_account_metas(None),
            data: streampay_program::instruction::ApproveWorkUnit {}.data(),
        }
    }

    fn approve_unit(&mut self, contract_id: u64, index: u32) -> TransactionResult {
        let contract = self.contract_pda(contract_id);
        let ix = self.approve_ix(
            self.employer_pk,
            contract,
            self.work_unit_pda(&contract, index),
        );
        self.send_employer(ix)
    }

    fn revision_ix(&self, employer: Address, contract: Address, work_unit: Address) -> Instruction {
        Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::RequestRevision {
                employer,
                contract,
                work_unit,
            }
            .to_account_metas(None),
            data: streampay_program::instruction::RequestRevision {}.data(),
        }
    }

    fn request_revision(&mut self, contract_id: u64, index: u32) -> TransactionResult {
        let contract = self.contract_pda(contract_id);
        let ix = self.revision_ix(
            self.employer_pk,
            contract,
            self.work_unit_pda(&contract, index),
        );
        self.send_employer(ix)
    }

    fn timeout_ix(&self, caller: Address, contract: Address, work_unit: Address) -> Instruction {
        Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::FinalizeReviewTimeout {
                caller,
                contract,
                work_unit,
            }
            .to_account_metas(None),
            data: streampay_program::instruction::FinalizeReviewTimeout {}.data(),
        }
    }

    fn timeout_as(&mut self, signer: &Keypair, contract_id: u64, index: u32) -> TransactionResult {
        let contract = self.contract_pda(contract_id);
        let ix = self.timeout_ix(
            signer.pubkey(),
            contract,
            self.work_unit_pda(&contract, index),
        );
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

    fn assert_no_token_movement(&self, contract_id: u64, expected_escrow: u64) {
        assert_eq!(self.escrow_amount(contract_id), expected_escrow);
        let c = self.read_contract(&self.contract_pda(contract_id));
        assert_eq!(c.withdrawn_amount, 0);
        assert_eq!(c.refunded_amount, 0);
    }
}

fn milestone_args(contract_id: u64, now: i64) -> CreateContractArgs {
    CreateContractArgs {
        contract_id,
        payment_mode: PaymentMode::Milestone,
        start_mode: StartMode::OnActivation,
        total_amount: TOTAL_AMOUNT,
        acceptance_deadline: now + 3_600,
        scheduled_start_time: 0,
        duration_seconds: 3_600,
        checkpoint_interval: 12_345,
        review_duration: REVIEW_DURATION,
        activation_review_duration: 3_600,
        max_revisions: 2,
        trial_amount: 0,
        metadata_uri: "ipfs://bafyContractMetadata".to_string(),
        metadata_hash: [7u8; 32],
    }
}

fn fixed_args(contract_id: u64, now: i64) -> CreateContractArgs {
    CreateContractArgs {
        payment_mode: PaymentMode::Fixed,
        ..milestone_args(contract_id, now)
    }
}

fn streaming_args(contract_id: u64, now: i64) -> CreateContractArgs {
    CreateContractArgs {
        payment_mode: PaymentMode::Streaming,
        checkpoint_interval: 900,
        ..milestone_args(contract_id, now)
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

fn activate_milestone(env: &mut Env, amounts: &[u64]) -> u64 {
    let id = 1u64;
    let now = env.now();
    env.create(&milestone_args(id, now)).unwrap();
    let mut offset = OFFSET;
    for amount in amounts {
        env.add_milestone(id, *amount, offset).unwrap();
        offset += OFFSET;
    }
    env.finalize_terms(id).unwrap();
    env.accept(id).unwrap();
    env.approve_activation(id).unwrap();
    id
}

fn activate_fixed(env: &mut Env) -> u64 {
    let id = 1u64;
    let now = env.now();
    env.create(&fixed_args(id, now)).unwrap();
    env.accept(id).unwrap();
    env.approve_activation(id).unwrap();
    id
}

fn activate_streaming(env: &mut Env) -> u64 {
    let id = 1u64;
    let now = env.now();
    env.create(&streaming_args(id, now)).unwrap();
    env.accept(id).unwrap();
    env.approve_activation(id).unwrap();
    id
}

fn submitted_milestone(env: &mut Env) -> u64 {
    let id = activate_milestone(env, &[TOTAL_AMOUNT]);
    env.submit(id, 0).unwrap();
    id
}

#[test]
fn freelancer_submits_active_milestone() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = activate_milestone(&mut env, &[TOTAL_AMOUNT]);
    let submitted_at = env.now();
    env.submit(id, 0).unwrap();

    let contract = env.contract_pda(id);
    let unit = env.read_work_unit(&env.work_unit_pda(&contract, 0));
    assert_eq!(unit.status, WorkUnitStatus::Submitted);
    assert_eq!(unit.submission_uri, SUBMISSION_URI);
    assert_eq!(unit.submission_hash, SUBMISSION_HASH);
    assert_eq!(unit.submitted_at, submitted_at);
    assert_eq!(unit.action_deadline, submitted_at + REVIEW_DURATION);
    assert_eq!(unit.kind, WorkUnitKind::Milestone);

    let c = env.read_contract(&contract);
    assert_eq!(c.open_review_count, 1);
    assert_eq!(c.released_amount, 0);
    assert_eq!(c.released_unit_count, 0);
    env.assert_no_token_movement(id, TOTAL_AMOUNT);
}

#[test]
fn employer_cannot_submit_work_unit() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = activate_milestone(&mut env, &[TOTAL_AMOUNT]);
    let contract = env.contract_pda(id);
    let ix = env.submit_ix(
        env.employer_pk,
        contract,
        env.work_unit_pda(&contract, 0),
        SUBMISSION_URI,
        SUBMISSION_HASH,
    );
    assert_rejected(
        env.send_employer(ix),
        E_CONSTRAINT_SEEDS,
        "employer submitting work",
    );
}

#[test]
fn third_party_cannot_submit_work_unit() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = activate_milestone(&mut env, &[TOTAL_AMOUNT]);
    let contract = env.contract_pda(id);
    let outsider = clone_kp(&env.outsider);
    let ix = env.submit_ix(
        env.outsider_pk,
        contract,
        env.work_unit_pda(&contract, 0),
        SUBMISSION_URI,
        SUBMISSION_HASH,
    );
    assert_rejected(
        env.send(ix, &outsider),
        E_CONSTRAINT_SEEDS,
        "third party submitting work",
    );
}

#[test]
fn cannot_submit_before_active() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    env.create(&milestone_args(1, now)).unwrap();
    env.add_milestone(1, TOTAL_AMOUNT, OFFSET).unwrap();
    env.finalize_terms(1).unwrap();
    assert_rejected(
        env.submit(1, 0),
        E_INVALID_STATE,
        "submit while draft-offer",
    );
    env.accept(1).unwrap();
    assert_rejected(
        env.submit(1, 0),
        E_INVALID_STATE,
        "submit before activation",
    );
}

#[test]
fn cannot_submit_scheduled_before_start() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    let mut args = milestone_args(1, now);
    args.start_mode = StartMode::Scheduled;
    args.scheduled_start_time = now + 3_600;
    env.create(&args).unwrap();
    env.add_milestone(1, TOTAL_AMOUNT, OFFSET).unwrap();
    env.finalize_terms(1).unwrap();
    env.accept(1).unwrap();
    env.approve_activation(1).unwrap();
    assert_rejected(
        env.submit(1, 0),
        E_CONTRACT_NOT_STARTED,
        "submit before scheduled start",
    );
    env.warp(now + 3_600);
    env.submit(1, 0).unwrap();
}

#[test]
fn fake_and_cross_contract_work_unit_rejected() {
    let mut env = setup(TOTAL_AMOUNT * 2);
    let id = activate_milestone(&mut env, &[TOTAL_AMOUNT]);
    let contract = env.contract_pda(id);
    let fake = Keypair::new().pubkey();
    let ix = env.submit_ix(
        env.freelancer_pk,
        contract,
        fake,
        SUBMISSION_URI,
        SUBMISSION_HASH,
    );
    assert_rejected(
        env.send_freelancer(ix),
        E_ACCOUNT_NOT_INITIALIZED,
        "fake work unit PDA",
    );

    let now = env.now();
    let mut args = milestone_args(2, now);
    args.contract_id = 2;
    env.create(&args).unwrap();
    env.add_milestone(2, TOTAL_AMOUNT, OFFSET).unwrap();
    env.finalize_terms(2).unwrap();
    env.accept(2).unwrap();
    env.approve_activation(2).unwrap();
    let other_unit = env.work_unit_pda(&env.contract_pda(2), 0);
    let ix = env.submit_ix(
        env.freelancer_pk,
        contract,
        other_unit,
        SUBMISSION_URI,
        SUBMISSION_HASH,
    );
    assert_rejected(
        env.send_freelancer(ix),
        E_CONSTRAINT_SEEDS,
        "cross-contract work unit",
    );
}

#[test]
fn empty_submission_uri_rejected() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = activate_milestone(&mut env, &[TOTAL_AMOUNT]);
    let contract = env.contract_pda(id);
    let ix = env.submit_ix(
        env.freelancer_pk,
        contract,
        env.work_unit_pda(&contract, 0),
        "",
        SUBMISSION_HASH,
    );
    assert_rejected(
        env.send_freelancer(ix),
        E_INVALID_METADATA,
        "empty submission URI",
    );
}

#[test]
fn cannot_submit_twice_without_revision() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = submitted_milestone(&mut env);
    assert_rejected(
        env.submit(id, 0),
        E_UNIT_NOT_SUBMITTABLE,
        "second submit without revision",
    );
}

#[test]
fn employer_approves_submitted_milestone() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = submitted_milestone(&mut env);
    let approved_at = env.now();
    env.approve_unit(id, 0).unwrap();

    let contract = env.contract_pda(id);
    let unit = env.read_work_unit(&env.work_unit_pda(&contract, 0));
    assert_eq!(unit.status, WorkUnitStatus::Released);
    assert_eq!(unit.release_trigger, ReleaseTrigger::EmployerApproval);
    assert_eq!(unit.approved_at, approved_at);
    assert_eq!(unit.released_at, approved_at);

    let c = env.read_contract(&contract);
    assert_eq!(c.released_amount, TOTAL_AMOUNT);
    assert_eq!(c.released_unit_count, 1);
    assert_eq!(c.open_review_count, 0);
    assert_eq!(c.withdrawn_amount, 0);
    env.assert_no_token_movement(id, TOTAL_AMOUNT);
}

#[test]
fn freelancer_cannot_approve_work_unit() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = submitted_milestone(&mut env);
    let contract = env.contract_pda(id);
    let ix = env.approve_ix(env.freelancer_pk, contract, env.work_unit_pda(&contract, 0));
    assert_rejected(
        env.send_freelancer(ix),
        E_CONSTRAINT_SEEDS,
        "freelancer approving work",
    );
}

#[test]
fn third_party_cannot_approve_work_unit() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = submitted_milestone(&mut env);
    let contract = env.contract_pda(id);
    let outsider = clone_kp(&env.outsider);
    let ix = env.approve_ix(env.outsider_pk, contract, env.work_unit_pda(&contract, 0));
    assert_rejected(
        env.send(ix, &outsider),
        E_CONSTRAINT_SEEDS,
        "third party approving work",
    );
}

#[test]
fn cannot_approve_before_submission() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = activate_milestone(&mut env, &[TOTAL_AMOUNT]);
    assert_rejected(
        env.approve_unit(id, 0),
        E_UNIT_NOT_UNDER_REVIEW,
        "approve before submit",
    );
}

#[test]
fn cannot_approve_twice() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = submitted_milestone(&mut env);
    env.approve_unit(id, 0).unwrap();
    env.svm.expire_blockhash();
    assert_rejected(
        env.approve_unit(id, 0),
        E_UNIT_ALREADY_RELEASED,
        "approve twice",
    );
}

#[test]
fn revision_then_resubmit_refreshes_deadline() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = submitted_milestone(&mut env);
    let first_deadline = env
        .read_work_unit(&env.work_unit_pda(&env.contract_pda(id), 0))
        .action_deadline;
    env.request_revision(id, 0).unwrap();

    let contract = env.contract_pda(id);
    let unit = env.read_work_unit(&env.work_unit_pda(&contract, 0));
    assert_eq!(unit.status, WorkUnitStatus::Revising);
    assert_eq!(unit.revision_count, 1);
    let c = env.read_contract(&contract);
    assert_eq!(c.open_review_count, 1);
    assert_eq!(c.released_amount, 0);

    env.warp(env.now() + 10);
    let resubmitted_at = env.now();
    let ix = env.submit_ix(
        env.freelancer_pk,
        contract,
        env.work_unit_pda(&contract, 0),
        RESUBMIT_URI,
        RESUBMIT_HASH,
    );
    env.send_freelancer(ix).unwrap();

    let unit = env.read_work_unit(&env.work_unit_pda(&contract, 0));
    assert_eq!(unit.status, WorkUnitStatus::Submitted);
    assert_eq!(unit.submission_uri, RESUBMIT_URI);
    assert_eq!(unit.submission_hash, RESUBMIT_HASH);
    assert_eq!(unit.submitted_at, resubmitted_at);
    assert_eq!(unit.action_deadline, resubmitted_at + REVIEW_DURATION);
    assert_eq!(unit.revision_count, 1);
    assert_ne!(unit.action_deadline, first_deadline);
    assert_eq!(env.read_contract(&contract).open_review_count, 1);
    env.assert_no_token_movement(id, TOTAL_AMOUNT);
}

#[test]
fn revision_prevents_stale_timeout() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = submitted_milestone(&mut env);
    let old_deadline = env
        .read_work_unit(&env.work_unit_pda(&env.contract_pda(id), 0))
        .action_deadline;
    env.request_revision(id, 0).unwrap();

    env.warp(old_deadline);
    let outsider = clone_kp(&env.outsider);
    assert_rejected(
        env.timeout_as(&outsider, id, 0),
        E_UNIT_NOT_UNDER_REVIEW,
        "timeout while revising",
    );

    let contract = env.contract_pda(id);
    let ix = env.submit_ix(
        env.freelancer_pk,
        contract,
        env.work_unit_pda(&contract, 0),
        RESUBMIT_URI,
        RESUBMIT_HASH,
    );
    env.send_freelancer(ix).unwrap();
    let new_deadline = env
        .read_work_unit(&env.work_unit_pda(&contract, 0))
        .action_deadline;
    env.warp(old_deadline);
    assert_rejected(
        env.timeout_as(&outsider, id, 0),
        E_REVIEW_WINDOW_OPEN,
        "old deadline after resubmit",
    );
    env.warp(new_deadline);
    env.timeout_as(&outsider, id, 0).unwrap();
}

#[test]
fn revision_limit_enforced() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = submitted_milestone(&mut env);
    env.request_revision(id, 0).unwrap();
    env.submit(id, 0).unwrap();
    env.request_revision(id, 0).unwrap();
    env.submit(id, 0).unwrap();
    assert_rejected(
        env.request_revision(id, 0),
        E_REVISION_LIMIT,
        "third revision",
    );
}

#[test]
fn freelancer_cannot_request_revision() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = submitted_milestone(&mut env);
    let contract = env.contract_pda(id);
    let ix = env.revision_ix(env.freelancer_pk, contract, env.work_unit_pda(&contract, 0));
    assert_rejected(
        env.send_freelancer(ix),
        E_CONSTRAINT_SEEDS,
        "freelancer requesting revision",
    );
}

#[test]
fn third_party_cannot_request_revision() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = submitted_milestone(&mut env);
    let contract = env.contract_pda(id);
    let outsider = clone_kp(&env.outsider);
    let ix = env.revision_ix(env.outsider_pk, contract, env.work_unit_pda(&contract, 0));
    assert_rejected(
        env.send(ix, &outsider),
        E_CONSTRAINT_SEEDS,
        "third party requesting revision",
    );
}

#[test]
fn cannot_revise_released_unit() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = submitted_milestone(&mut env);
    env.approve_unit(id, 0).unwrap();
    assert_rejected(
        env.request_revision(id, 0),
        E_UNIT_ALREADY_RELEASED,
        "revise released unit",
    );
}

#[test]
fn cannot_finalize_timeout_before_deadline() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = submitted_milestone(&mut env);
    let outsider = clone_kp(&env.outsider);
    assert_rejected(
        env.timeout_as(&outsider, id, 0),
        E_REVIEW_WINDOW_OPEN,
        "timeout before deadline",
    );
}

#[test]
fn permissionless_timeout_releases_exactly_once() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = submitted_milestone(&mut env);
    let deadline = env
        .read_work_unit(&env.work_unit_pda(&env.contract_pda(id), 0))
        .action_deadline;
    env.warp(deadline);
    let released_at = env.now();
    let outsider = clone_kp(&env.outsider);
    env.timeout_as(&outsider, id, 0).unwrap();

    let contract = env.contract_pda(id);
    let unit = env.read_work_unit(&env.work_unit_pda(&contract, 0));
    assert_eq!(unit.status, WorkUnitStatus::Released);
    assert_eq!(unit.release_trigger, ReleaseTrigger::ReviewTimeout);
    assert_eq!(unit.approved_at, 0);
    assert_eq!(unit.released_at, released_at);

    let c = env.read_contract(&contract);
    assert_eq!(c.released_amount, TOTAL_AMOUNT);
    assert_eq!(c.released_unit_count, 1);
    assert_eq!(c.open_review_count, 0);
    assert_eq!(c.withdrawn_amount, 0);
    env.assert_no_token_movement(id, TOTAL_AMOUNT);

    env.svm.expire_blockhash();
    assert_rejected(
        env.timeout_as(&outsider, id, 0),
        E_UNIT_ALREADY_RELEASED,
        "timeout twice",
    );
}

#[test]
fn approval_after_timeout_rejected() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = submitted_milestone(&mut env);
    let deadline = env
        .read_work_unit(&env.work_unit_pda(&env.contract_pda(id), 0))
        .action_deadline;
    env.warp(deadline);
    let outsider = clone_kp(&env.outsider);
    env.timeout_as(&outsider, id, 0).unwrap();
    assert_rejected(
        env.approve_unit(id, 0),
        E_UNIT_ALREADY_RELEASED,
        "approve after timeout",
    );
}

#[test]
fn timeout_after_approval_rejected() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = submitted_milestone(&mut env);
    env.approve_unit(id, 0).unwrap();
    let deadline = env
        .read_work_unit(&env.work_unit_pda(&env.contract_pda(id), 0))
        .action_deadline;
    env.warp(deadline);
    let outsider = clone_kp(&env.outsider);
    assert_rejected(
        env.timeout_as(&outsider, id, 0),
        E_UNIT_ALREADY_RELEASED,
        "timeout after approval",
    );
}

#[test]
fn fixed_deliverable_is_deterministic_index_zero() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    env.create(&fixed_args(1, now)).unwrap();
    let contract = env.contract_pda(1);
    let c = env.read_contract(&contract);
    assert_eq!(c.work_unit_count, 1);
    assert_eq!(c.allocated_amount, TOTAL_AMOUNT);
    assert_eq!(c.main_amount, TOTAL_AMOUNT);
    let unit = env.read_work_unit(&env.work_unit_pda(&contract, 0));
    assert_eq!(unit.kind, WorkUnitKind::Fixed);
    assert_eq!(unit.index, 0);
    assert_eq!(unit.amount, TOTAL_AMOUNT);
    assert_eq!(unit.status, WorkUnitStatus::Defined);
    assert_eq!(unit.due_offset_seconds, 3_600);
}

#[test]
fn fixed_approval_releases_main_amount_once() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = activate_fixed(&mut env);
    env.submit(id, 0).unwrap();
    env.approve_unit(id, 0).unwrap();
    let c = env.read_contract(&env.contract_pda(id));
    assert_eq!(c.released_amount, TOTAL_AMOUNT);
    assert_eq!(c.released_unit_count, 1);
    env.svm.expire_blockhash();
    assert_rejected(
        env.approve_unit(id, 0),
        E_UNIT_ALREADY_RELEASED,
        "fixed double release",
    );
    env.assert_no_token_movement(id, TOTAL_AMOUNT);
}

#[test]
fn fixed_timeout_releases_exactly_once() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = activate_fixed(&mut env);
    env.submit(id, 0).unwrap();
    let deadline = env
        .read_work_unit(&env.work_unit_pda(&env.contract_pda(id), 0))
        .action_deadline;
    env.warp(deadline);
    let outsider = clone_kp(&env.outsider);
    env.timeout_as(&outsider, id, 0).unwrap();
    let c = env.read_contract(&env.contract_pda(id));
    assert_eq!(c.released_amount, TOTAL_AMOUNT);
    assert_eq!(c.released_unit_count, 1);
    env.svm.expire_blockhash();
    assert_rejected(
        env.timeout_as(&outsider, id, 0),
        E_UNIT_ALREADY_RELEASED,
        "fixed timeout twice",
    );
    env.assert_no_token_movement(id, TOTAL_AMOUNT);
}

#[test]
fn trial_plus_fixed_never_exceeds_total() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    let mut args = fixed_args(1, now);
    args.trial_amount = TRIAL_AMOUNT;
    env.create(&args).unwrap();
    env.accept(1).unwrap();
    env.submit_trial(1).unwrap();
    env.approve_trial(1).unwrap();

    let c = env.read_contract(&env.contract_pda(1));
    assert_eq!(c.status, ContractStatus::Active);
    assert_eq!(c.released_amount, TRIAL_AMOUNT);
    assert_eq!(c.released_unit_count, 1);
    assert_eq!(c.main_amount, MAIN_AMOUNT);
    assert_eq!(c.trial_amount + c.main_amount, c.total_amount);

    env.submit(1, 0).unwrap();
    env.approve_unit(1, 0).unwrap();
    let c = env.read_contract(&env.contract_pda(1));
    assert_eq!(c.released_amount, TOTAL_AMOUNT);
    assert_eq!(c.released_unit_count, 2);
    assert_eq!(c.open_review_count, 0);
    env.assert_no_token_movement(1, TOTAL_AMOUNT);
}

#[test]
fn streaming_generic_review_is_rejected() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = activate_streaming(&mut env);
    let contract = env.contract_pda(id);
    let c = env.read_contract(&contract);
    assert_eq!(c.payment_mode, PaymentMode::Streaming);
    assert_eq!(c.released_amount, 0);
    assert_eq!(c.last_period_end, c.start_time);
    assert_eq!(c.work_unit_count, 0);

    // Streaming has no WorkUnit in this phase, so generic review cannot even
    // address one. AccountNotInitialized is the reachable rejection; the
    // handler also guards with InvalidPaymentMode if a unit ever existed.
    let missing = env.work_unit_pda(&contract, 0);
    let ix = env.submit_ix(
        env.freelancer_pk,
        contract,
        missing,
        SUBMISSION_URI,
        SUBMISSION_HASH,
    );
    assert_rejected(
        env.send_freelancer(ix),
        E_ACCOUNT_NOT_INITIALIZED,
        "streaming submit_work_unit",
    );
    let ix = env.approve_ix(env.employer_pk, contract, missing);
    assert_rejected(
        env.send_employer(ix),
        E_ACCOUNT_NOT_INITIALIZED,
        "streaming approve_work_unit",
    );
    let outsider = clone_kp(&env.outsider);
    let ix = env.timeout_ix(env.outsider_pk, contract, missing);
    assert_rejected(
        env.send(ix, &outsider),
        E_ACCOUNT_NOT_INITIALIZED,
        "streaming finalize_review_timeout",
    );

    let c = env.read_contract(&contract);
    assert_eq!(c.released_amount, 0);
    assert_eq!(c.main_amount, TOTAL_AMOUNT);
    env.assert_no_token_movement(id, TOTAL_AMOUNT);
}

#[test]
fn streaming_scheduled_does_not_earn_before_start() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    let mut args = streaming_args(1, now);
    args.start_mode = StartMode::Scheduled;
    args.scheduled_start_time = now + 3_600;
    env.create(&args).unwrap();
    env.accept(1).unwrap();
    env.approve_activation(1).unwrap();
    let c = env.read_contract(&env.contract_pda(1));
    assert_eq!(c.status, ContractStatus::Active);
    assert_eq!(c.start_time, now + 3_600);
    assert_eq!(c.last_period_end, c.start_time);
    assert_eq!(c.released_amount, 0);
    assert!(env.now() < c.start_time);
}

#[test]
fn two_milestones_release_independently_without_exceeding_total() {
    let mut env = setup(TOTAL_AMOUNT);
    let first = 400_000u64;
    let second = 600_000u64;
    let id = activate_milestone(&mut env, &[first, second]);
    env.submit(id, 0).unwrap();
    env.submit(id, 1).unwrap();
    let c = env.read_contract(&env.contract_pda(id));
    assert_eq!(c.open_review_count, 2);

    env.approve_unit(id, 0).unwrap();
    let c = env.read_contract(&env.contract_pda(id));
    assert_eq!(c.released_amount, first);
    assert_eq!(c.released_unit_count, 1);
    assert_eq!(c.open_review_count, 1);

    env.approve_unit(id, 1).unwrap();
    let c = env.read_contract(&env.contract_pda(id));
    assert_eq!(c.released_amount, TOTAL_AMOUNT);
    assert_eq!(c.released_unit_count, 2);
    assert_eq!(c.open_review_count, 0);
    assert!(c.released_amount <= c.total_amount);
    assert_eq!(c.released_amount + c.refunded_amount, c.total_amount);
    env.assert_no_token_movement(id, TOTAL_AMOUNT);
}

#[test]
fn open_review_count_tracks_submit_revision_approve() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = activate_milestone(&mut env, &[TOTAL_AMOUNT]);
    assert_eq!(
        env.read_contract(&env.contract_pda(id)).open_review_count,
        0
    );
    env.submit(id, 0).unwrap();
    assert_eq!(
        env.read_contract(&env.contract_pda(id)).open_review_count,
        1
    );
    env.request_revision(id, 0).unwrap();
    assert_eq!(
        env.read_contract(&env.contract_pda(id)).open_review_count,
        1
    );
    env.submit(id, 0).unwrap();
    assert_eq!(
        env.read_contract(&env.contract_pda(id)).open_review_count,
        1
    );
    env.approve_unit(id, 0).unwrap();
    assert_eq!(
        env.read_contract(&env.contract_pda(id)).open_review_count,
        0
    );
}

#[test]
fn fake_contract_pda_rejected() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = activate_milestone(&mut env, &[TOTAL_AMOUNT]);
    let fake_contract = Keypair::new().pubkey();
    let real_unit = env.work_unit_pda(&env.contract_pda(id), 0);
    let ix = env.submit_ix(
        env.freelancer_pk,
        fake_contract,
        real_unit,
        SUBMISSION_URI,
        SUBMISSION_HASH,
    );
    assert_rejected(
        env.send_freelancer(ix),
        E_ACCOUNT_NOT_INITIALIZED,
        "fake contract PDA",
    );
}

#[test]
fn generic_submit_cannot_target_trial_pda() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    let mut args = fixed_args(1, now);
    args.trial_amount = TRIAL_AMOUNT;
    env.create(&args).unwrap();
    env.accept(1).unwrap();
    env.submit_trial(1).unwrap();
    env.approve_trial(1).unwrap();

    let contract = env.contract_pda(1);
    let ix = env.submit_ix(
        env.freelancer_pk,
        contract,
        env.trial_pda(&contract),
        SUBMISSION_URI,
        SUBMISSION_HASH,
    );
    assert_rejected(
        env.send_freelancer(ix),
        E_CONSTRAINT_SEEDS,
        "submit_work_unit against trial PDA",
    );
}
