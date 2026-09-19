//! StreamPay V2 Phase 7 tests: active-contract cancellation settlement.
//!
//! Employer cancellation freezes freelancer vs employer entitlements.
//! No SPL tokens move. Open reviews cannot be bypassed.

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
    self as streampay_program, Contract, ContractStatus, CreateContractArgs, PaymentMode, StartMode,
};

const E_INVALID_STATE: u32 = 6111;
const E_CONTRACT_TERMINAL: u32 = 6113;
const E_OPEN_REVIEW_BLOCKS: u32 = 6142;
const E_CONSTRAINT_SEEDS: u32 = 2006;
const E_ACCOUNT_NOT_INITIALIZED: u32 = 3012;

const MINT_DECIMALS: u8 = 6;
const BASE_TS: i64 = 1_700_000_000;
const TOTAL_AMOUNT: u64 = 1_000_000;
const TRIAL_AMOUNT: u64 = 50_000;
const MAIN_AMOUNT: u64 = 950_000;
const DURATION: i64 = 60;
const INTERVAL: i64 = 20;
const REVIEW: i64 = 10;
const OFFSET: i64 = 30;
const SUBMISSION_URI: &str = "ipfs://bafyCancelWork";
const SUBMISSION_HASH: [u8; 32] = [14u8; 32];

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

    fn submit_work(&mut self, contract_id: u64, index: u32) -> TransactionResult {
        let contract = self.contract_pda(contract_id);
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::SubmitWorkUnit {
                freelancer: self.freelancer_pk,
                contract,
                work_unit: self.work_unit_pda(&contract, index),
            }
            .to_account_metas(None),
            data: streampay_program::instruction::SubmitWorkUnit {
                submission_uri: SUBMISSION_URI.to_string(),
                submission_hash: SUBMISSION_HASH,
            }
            .data(),
        };
        self.send_freelancer(ix)
    }

    fn approve_work(&mut self, contract_id: u64, index: u32) -> TransactionResult {
        let contract = self.contract_pda(contract_id);
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::ApproveWorkUnit {
                employer: self.employer_pk,
                contract,
                work_unit: self.work_unit_pda(&contract, index),
            }
            .to_account_metas(None),
            data: streampay_program::instruction::ApproveWorkUnit {}.data(),
        };
        self.send_employer(ix)
    }

    fn request_revision(&mut self, contract_id: u64, index: u32) -> TransactionResult {
        let contract = self.contract_pda(contract_id);
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::RequestRevision {
                employer: self.employer_pk,
                contract,
                work_unit: self.work_unit_pda(&contract, index),
            }
            .to_account_metas(None),
            data: streampay_program::instruction::RequestRevision {}.data(),
        };
        self.send_employer(ix)
    }

    fn timeout(&mut self, contract_id: u64, index: u32) -> TransactionResult {
        let contract = self.contract_pda(contract_id);
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::FinalizeReviewTimeout {
                caller: self.outsider_pk,
                contract,
                work_unit: self.work_unit_pda(&contract, index),
            }
            .to_account_metas(None),
            data: streampay_program::instruction::FinalizeReviewTimeout {}.data(),
        };
        self.send(ix, &clone_kp(&self.outsider))
    }

    fn release_stream(&mut self, contract_id: u64) -> TransactionResult {
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::ReleaseStreamAccrual {
                caller: self.freelancer_pk,
                contract: self.contract_pda(contract_id),
            }
            .to_account_metas(None),
            data: streampay_program::instruction::ReleaseStreamAccrual {}.data(),
        };
        self.send_freelancer(ix)
    }

    fn cancel_ix(&self, employer: Address, contract: Address) -> Instruction {
        Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::CancelActiveContract {
                employer,
                contract,
                hourly_state: None,
            }
                .to_account_metas(None),
            data: streampay_program::instruction::CancelActiveContract {}.data(),
        }
    }

    fn cancel(&mut self, contract_id: u64) -> TransactionResult {
        let ix = self.cancel_ix(self.employer_pk, self.contract_pda(contract_id));
        self.send_employer(ix)
    }

    fn read_contract(&self, contract: &Address) -> Contract {
        let account = self.svm.get_account(contract).expect("contract missing");
        let mut data: &[u8] = &account.data;
        Contract::try_deserialize(&mut data).expect("deserialize contract")
    }

    fn assert_settled(&self, contract_id: u64, freelancer: u64, employer: u64, escrow: u64) {
        let c = self.read_contract(&self.contract_pda(contract_id));
        assert_eq!(c.status, ContractStatus::Cancelled);
        assert!(c.status.is_terminal());
        assert_eq!(c.freelancer_settlement_amount, freelancer);
        assert_eq!(c.employer_refundable_amount, employer);
        assert_eq!(c.released_amount, freelancer);
        assert_eq!(
            c.freelancer_settlement_amount + c.employer_refundable_amount,
            c.total_amount
        );
        assert!(c.freelancer_settlement_amount <= c.total_amount);
        assert!(c.employer_refundable_amount <= c.total_amount);
        assert!(c.withdrawn_amount <= c.freelancer_settlement_amount);
        assert!(c.refunded_amount <= c.employer_refundable_amount);
        assert_eq!(c.withdrawn_amount, 0);
        assert_eq!(c.refunded_amount, 0);
        assert_eq!(c.completed_at, 0);
        assert_eq!(self.escrow_amount(contract_id), escrow);
        assert_eq!(
            self.svm
                .get_account(&self.contract_pda(contract_id))
                .unwrap()
                .data
                .len(),
            8 + 621
        );
    }
}

fn streaming_args(contract_id: u64, total_amount: u64, now: i64) -> CreateContractArgs {
    CreateContractArgs {
        contract_id,
        payment_mode: PaymentMode::Streaming,
        start_mode: StartMode::OnActivation,
        total_amount,
        acceptance_deadline: now + 3_600,
        scheduled_start_time: 0,
        duration_seconds: DURATION,
        checkpoint_interval: INTERVAL,
        review_duration: REVIEW,
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
        checkpoint_interval: 12_345,
        duration_seconds: 3_600,
        review_duration: 300,
        ..streaming_args(contract_id, total_amount, now)
    }
}

fn milestone_args(contract_id: u64, total_amount: u64, now: i64) -> CreateContractArgs {
    CreateContractArgs {
        payment_mode: PaymentMode::Milestone,
        checkpoint_interval: 12_345,
        duration_seconds: 3_600,
        review_duration: 300,
        ..streaming_args(contract_id, total_amount, now)
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

fn expected_accrued(main: u64, start: i64, end: i64, now: i64) -> u64 {
    if now <= start {
        return 0;
    }
    if now >= end {
        return main;
    }
    let elapsed = (now - start) as u128;
    let duration = (end - start) as u128;
    ((main as u128) * elapsed / duration) as u64
}

fn activate_streaming(env: &mut Env, total_amount: u64) -> (u64, i64) {
    let id = 1u64;
    env.create(&streaming_args(id, total_amount, env.now()))
        .unwrap();
    env.accept(id).unwrap();
    env.approve_activation(id).unwrap();
    let start = env.read_contract(&env.contract_pda(id)).start_time;
    (id, start)
}

fn activate_fixed(env: &mut Env, total_amount: u64, trial: u64) -> u64 {
    let id = 1u64;
    let mut args = fixed_args(id, total_amount, env.now());
    args.trial_amount = trial;
    env.create(&args).unwrap();
    env.accept(id).unwrap();
    if trial > 0 {
        env.submit_trial(id).unwrap();
        env.approve_trial(id).unwrap();
    } else {
        env.approve_activation(id).unwrap();
    }
    id
}

fn activate_milestone(env: &mut Env, amounts: &[u64]) -> u64 {
    let id = 1u64;
    let total: u64 = amounts.iter().sum();
    env.create(&milestone_args(id, total, env.now())).unwrap();
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

#[test]
fn employer_cancels_active_streaming_halfway() {
    let mut env = setup(TOTAL_AMOUNT);
    let (id, start) = activate_streaming(&mut env, TOTAL_AMOUNT);
    let end = start + DURATION;
    env.warp(start + DURATION / 2);
    let accrued = expected_accrued(TOTAL_AMOUNT, start, end, env.now());
    env.cancel(id).unwrap();
    env.assert_settled(id, accrued, TOTAL_AMOUNT - accrued, TOTAL_AMOUNT);
    let c = env.read_contract(&env.contract_pda(id));
    assert_eq!(c.stream_released_amount, accrued);
    assert_eq!(c.terminated_at, env.now());
}

#[test]
fn freelancer_and_third_party_cannot_cancel() {
    let mut env = setup(TOTAL_AMOUNT);
    let (id, _) = activate_streaming(&mut env, TOTAL_AMOUNT);
    let contract = env.contract_pda(id);
    assert_rejected(
        env.send_freelancer(env.cancel_ix(env.freelancer_pk, contract)),
        E_CONSTRAINT_SEEDS,
        "freelancer cancel",
    );
    let outsider = clone_kp(&env.outsider);
    assert_rejected(
        env.send(env.cancel_ix(env.outsider_pk, contract), &outsider),
        E_CONSTRAINT_SEEDS,
        "third party cancel",
    );
}

#[test]
fn fake_contract_pda_rejected() {
    let mut env = setup(TOTAL_AMOUNT);
    let _ = activate_streaming(&mut env, TOTAL_AMOUNT);
    let fake = Keypair::new().pubkey();
    assert_rejected(
        env.send_employer(env.cancel_ix(env.employer_pk, fake)),
        E_ACCOUNT_NOT_INITIALIZED,
        "fake contract PDA",
    );
}

#[test]
fn streaming_boundary_start_mid_end_after() {
    let cases: &[(i64, u64)] = &[
        (0, 0),
        (1, expected_accrued(10, 0, 60, 1)),
        (20, 3),
        (40, 6),
        (59, expected_accrued(10, 0, 60, 59)),
        (60, 10),
        (10_000, 10),
    ];
    for (elapsed, want) in cases {
        let mut env = setup(10);
        let (id, start) = activate_streaming(&mut env, 10);
        env.warp(start + *elapsed);
        env.cancel(id).unwrap();
        env.assert_settled(id, *want, 10 - *want, 10);
        assert_eq!(
            env.read_contract(&env.contract_pda(id))
                .stream_released_amount,
            *want
        );
    }
}

#[test]
fn no_trial_stream_exact_four_hundred() {
    let mut env = setup(1_000);
    let (id, start) = activate_streaming(&mut env, 1_000);
    env.warp(start + 24);
    env.cancel(id).unwrap();
    env.assert_settled(id, 400, 600, 1_000);
}

#[test]
fn no_prior_release_still_preserves_accrual() {
    let mut env = setup(TOTAL_AMOUNT);
    let (id, start) = activate_streaming(&mut env, TOTAL_AMOUNT);
    env.warp(start + DURATION / 2);
    env.cancel(id).unwrap();
    let want = TOTAL_AMOUNT / 2;
    env.assert_settled(id, want, TOTAL_AMOUNT - want, TOTAL_AMOUNT);
}

#[test]
fn partial_prior_release_then_cancel_adds_delta_once() {
    let mut env = setup(10);
    let (id, start) = activate_streaming(&mut env, 10);
    env.warp(start + 20);
    env.release_stream(id).unwrap();
    assert_eq!(
        env.read_contract(&env.contract_pda(id))
            .stream_released_amount,
        3
    );
    env.warp(start + 40);
    env.cancel(id).unwrap();
    env.assert_settled(id, 6, 4, 10);
    let c = env.read_contract(&env.contract_pda(id));
    assert_eq!(c.stream_released_amount, 6);
}

#[test]
fn paid_trial_plus_stream_conserves() {
    let mut env = setup(TOTAL_AMOUNT);
    let mut args = streaming_args(1, TOTAL_AMOUNT, env.now());
    args.trial_amount = TRIAL_AMOUNT;
    env.create(&args).unwrap();
    env.accept(1).unwrap();
    env.submit_trial(1).unwrap();
    env.approve_trial(1).unwrap();
    let start = env.read_contract(&env.contract_pda(1)).start_time;
    env.warp(start + DURATION / 2);
    let stream = expected_accrued(MAIN_AMOUNT, start, start + DURATION, env.now());
    env.cancel(1).unwrap();
    let freelancer = TRIAL_AMOUNT + stream;
    env.assert_settled(1, freelancer, TOTAL_AMOUNT - freelancer, TOTAL_AMOUNT);
    let c = env.read_contract(&env.contract_pda(1));
    assert_eq!(c.stream_released_amount, stream);
    assert_ne!(c.stream_released_amount, c.released_amount);
}

#[test]
fn second_cancel_and_post_settlement_stream_release_rejected() {
    let mut env = setup(TOTAL_AMOUNT);
    let (id, start) = activate_streaming(&mut env, TOTAL_AMOUNT);
    env.warp(start + DURATION / 2);
    env.cancel(id).unwrap();
    let before = env.read_contract(&env.contract_pda(id));
    assert_rejected(env.cancel(id), E_CONTRACT_TERMINAL, "second cancel");
    env.warp(start + DURATION);
    assert_rejected(
        env.release_stream(id),
        E_INVALID_STATE,
        "stream release after cancel",
    );
    let after = env.read_contract(&env.contract_pda(id));
    assert_eq!(
        after.freelancer_settlement_amount,
        before.freelancer_settlement_amount
    );
    assert_eq!(
        after.employer_refundable_amount,
        before.employer_refundable_amount
    );
    assert_eq!(after.stream_released_amount, before.stream_released_amount);
}

#[test]
fn unused_fixed_becomes_refundable() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = activate_fixed(&mut env, TOTAL_AMOUNT, 0);
    env.cancel(id).unwrap();
    env.assert_settled(id, 0, TOTAL_AMOUNT, TOTAL_AMOUNT);
}

#[test]
fn approved_fixed_stays_with_freelancer() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = activate_fixed(&mut env, TOTAL_AMOUNT, 0);
    env.submit_work(id, 0).unwrap();
    env.approve_work(id, 0).unwrap();
    env.cancel(id).unwrap();
    env.assert_settled(id, TOTAL_AMOUNT, 0, TOTAL_AMOUNT);
}

#[test]
fn fixed_under_review_or_revising_blocks_cancel() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = activate_fixed(&mut env, TOTAL_AMOUNT, 0);
    env.submit_work(id, 0).unwrap();
    assert_rejected(env.cancel(id), E_OPEN_REVIEW_BLOCKS, "fixed under review");
    env.request_revision(id, 0).unwrap();
    assert_rejected(env.cancel(id), E_OPEN_REVIEW_BLOCKS, "fixed revising");
}

#[test]
fn paid_trial_plus_unused_fixed_keeps_trial() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = activate_fixed(&mut env, TOTAL_AMOUNT, TRIAL_AMOUNT);
    env.cancel(id).unwrap();
    env.assert_settled(id, TRIAL_AMOUNT, MAIN_AMOUNT, TOTAL_AMOUNT);
}

#[test]
fn zero_released_milestones_refundable() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = activate_milestone(&mut env, &[400_000, 600_000]);
    env.cancel(id).unwrap();
    env.assert_settled(id, 0, TOTAL_AMOUNT, TOTAL_AMOUNT);
}

#[test]
fn released_milestones_kept_remainder_refundable() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = activate_milestone(&mut env, &[400_000, 600_000]);
    env.submit_work(id, 0).unwrap();
    env.approve_work(id, 0).unwrap();
    env.cancel(id).unwrap();
    env.assert_settled(id, 400_000, 600_000, TOTAL_AMOUNT);
}

#[test]
fn both_milestones_released_zero_refundable() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = activate_milestone(&mut env, &[400_000, 600_000]);
    env.submit_work(id, 0).unwrap();
    env.approve_work(id, 0).unwrap();
    env.submit_work(id, 1).unwrap();
    env.approve_work(id, 1).unwrap();
    env.cancel(id).unwrap();
    env.assert_settled(id, TOTAL_AMOUNT, 0, TOTAL_AMOUNT);
}

#[test]
fn milestone_under_review_blocks_cancel() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = activate_milestone(&mut env, &[TOTAL_AMOUNT]);
    env.submit_work(id, 0).unwrap();
    assert_rejected(
        env.cancel(id),
        E_OPEN_REVIEW_BLOCKS,
        "milestone under review",
    );
}

#[test]
fn pending_states_cannot_cancel() {
    let mut env = setup(TOTAL_AMOUNT);
    env.create(&streaming_args(1, TOTAL_AMOUNT, env.now()))
        .unwrap();
    assert_rejected(env.cancel(1), E_INVALID_STATE, "pending acceptance");
    env.accept(1).unwrap();
    assert_rejected(env.cancel(1), E_INVALID_STATE, "pending employer approval");
}

#[test]
fn activation_rejected_and_disputed_cannot_cancel() {
    let mut env = setup(TOTAL_AMOUNT * 2);
    let mut args = streaming_args(1, TOTAL_AMOUNT, env.now());
    args.trial_amount = TRIAL_AMOUNT;
    env.create(&args).unwrap();
    env.accept(1).unwrap();
    env.reject(1, true).unwrap();
    assert_eq!(
        env.read_contract(&env.contract_pda(1)).status,
        ContractStatus::ActivationRejected
    );
    assert_rejected(env.cancel(1), E_CONTRACT_TERMINAL, "activation rejected");

    let mut args = streaming_args(2, TOTAL_AMOUNT, env.now());
    args.trial_amount = TRIAL_AMOUNT;
    env.create(&args).unwrap();
    env.accept(2).unwrap();
    env.submit_trial(2).unwrap();
    env.reject(2, true).unwrap();
    assert_eq!(
        env.read_contract(&env.contract_pda(2)).status,
        ContractStatus::Disputed
    );
    assert_rejected(env.cancel(2), E_CONTRACT_TERMINAL, "disputed");
}

#[test]
fn post_settlement_work_review_rejected() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = activate_fixed(&mut env, TOTAL_AMOUNT, 0);
    env.cancel(id).unwrap();
    assert_rejected(
        env.submit_work(id, 0),
        E_INVALID_STATE,
        "submit after cancel",
    );
    assert_rejected(
        env.approve_work(id, 0),
        E_INVALID_STATE,
        "approve after cancel",
    );
    assert_rejected(
        env.request_revision(id, 0),
        E_INVALID_STATE,
        "revision after cancel",
    );
    assert_rejected(env.timeout(id, 0), E_INVALID_STATE, "timeout after cancel");
}
