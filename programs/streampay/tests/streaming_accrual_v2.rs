//! StreamPay V2 Phase 6 tests: time-based streaming accrual and release.
//!
//! Accrual is canonical and cumulative from `start_time` over `main_amount`.
//! Phase 6 materializes RELEASED accounting only. No SPL tokens move.
//!
//! `MIN_DURATION_SECONDS` is 60, so the 10-units / 3-seconds rounding sequence
//! is exercised as 10 units / 60 seconds sampled every 20 seconds, which is
//! the same floor-division series: 0, 3, 6, 10.

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

const E_INVALID_PAYMENT_MODE: u32 = 6110;
const E_INVALID_STATE: u32 = 6111;
const E_CONTRACT_NOT_STARTED: u32 = 6112;
const E_ACCOUNT_NOT_INITIALIZED: u32 = 3012;

const MINT_DECIMALS: u8 = 6;
const BASE_TS: i64 = 1_700_000_000;
const TOTAL_AMOUNT: u64 = 1_000_000;
const TRIAL_AMOUNT: u64 = 50_000;
const MAIN_AMOUNT: u64 = 950_000;
const DURATION: i64 = 60;
const INTERVAL: i64 = 20;
const REVIEW: i64 = 10;
const SUBMISSION_URI: &str = "ipfs://bafyStreamTrial";
const SUBMISSION_HASH: [u8; 32] = [13u8; 32];

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

    fn release_ix(&self, caller: Address, contract: Address) -> Instruction {
        Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::ReleaseStreamAccrual { caller, contract }
                .to_account_metas(None),
            data: streampay_program::instruction::ReleaseStreamAccrual {}.data(),
        }
    }

    fn release(&mut self, contract_id: u64) -> TransactionResult {
        let ix = self.release_ix(self.freelancer_pk, self.contract_pda(contract_id));
        self.send_freelancer(ix)
    }

    fn release_as(&mut self, signer: &Keypair, contract_id: u64) -> TransactionResult {
        let ix = self.release_ix(signer.pubkey(), self.contract_pda(contract_id));
        self.send(ix, signer)
    }

    fn read_contract(&self, contract: &Address) -> Contract {
        let account = self.svm.get_account(contract).expect("contract missing");
        let mut data: &[u8] = &account.data;
        Contract::try_deserialize(&mut data).expect("deserialize contract")
    }

    fn assert_no_token_movement(&self, contract_id: u64, expected_escrow: u64) {
        assert_eq!(self.escrow_amount(contract_id), expected_escrow);
        let c = self.read_contract(&self.contract_pda(contract_id));
        assert_eq!(c.withdrawn_amount, 0);
        assert_eq!(c.refunded_amount, 0);
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

fn activate_streaming(env: &mut Env, total_amount: u64) -> (u64, i64) {
    let id = 1u64;
    let now = env.now();
    env.create(&streaming_args(id, total_amount, now)).unwrap();
    env.accept(id).unwrap();
    env.approve_activation(id).unwrap();
    let start = env.read_contract(&env.contract_pda(id)).start_time;
    (id, start)
}

fn activate_streaming_trial(env: &mut Env) -> (u64, i64) {
    let id = 1u64;
    let now = env.now();
    let mut args = streaming_args(id, TOTAL_AMOUNT, now);
    args.trial_amount = TRIAL_AMOUNT;
    env.create(&args).unwrap();
    env.accept(id).unwrap();
    env.submit_trial(id).unwrap();
    env.approve_trial(id).unwrap();
    let start = env.read_contract(&env.contract_pda(id)).start_time;
    (id, start)
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

#[test]
fn accrues_zero_at_start() {
    let mut env = setup(TOTAL_AMOUNT);
    let (id, start) = activate_streaming(&mut env, TOTAL_AMOUNT);
    env.warp(start);
    env.release(id).unwrap();
    let c = env.read_contract(&env.contract_pda(id));
    assert_eq!(c.stream_released_amount, 0);
    assert_eq!(c.released_amount, 0);
    assert_eq!(c.status, ContractStatus::Active);
    env.assert_no_token_movement(id, TOTAL_AMOUNT);
}

#[test]
fn accrues_half_then_full_and_caps() {
    let mut env = setup(TOTAL_AMOUNT);
    let (id, start) = activate_streaming(&mut env, TOTAL_AMOUNT);
    let end = start + DURATION;
    env.warp(start + DURATION / 2);
    env.release(id).unwrap();
    let c = env.read_contract(&env.contract_pda(id));
    assert_eq!(c.stream_released_amount, TOTAL_AMOUNT / 2);
    assert_eq!(c.released_amount, TOTAL_AMOUNT / 2);
    assert_eq!(c.withdrawn_amount, 0);

    env.warp(end);
    env.release(id).unwrap();
    let c = env.read_contract(&env.contract_pda(id));
    assert_eq!(c.stream_released_amount, TOTAL_AMOUNT);
    assert_eq!(c.released_amount, TOTAL_AMOUNT);
    assert_eq!(c.status, ContractStatus::Active);

    env.warp(end + 10_000);
    env.release(id).unwrap();
    let c = env.read_contract(&env.contract_pda(id));
    assert_eq!(c.stream_released_amount, TOTAL_AMOUNT);
    assert_eq!(c.released_amount, TOTAL_AMOUNT);
    env.assert_no_token_movement(id, TOTAL_AMOUNT);
}

#[test]
fn backward_clock_after_release_is_noop_then_resumes() {
    let mut env = setup(TOTAL_AMOUNT);
    let (id, start) = activate_streaming(&mut env, TOTAL_AMOUNT);
    let end = start + DURATION;
    env.warp(start + 40);
    env.release(id).unwrap();
    let released = expected_accrued(TOTAL_AMOUNT, start, end, start + 40);
    let c = env.read_contract(&env.contract_pda(id));
    assert_eq!(c.stream_released_amount, released);

    env.warp(start + 20);
    env.release(id).unwrap();
    let c = env.read_contract(&env.contract_pda(id));
    assert_eq!(c.stream_released_amount, released, "earlier clock adds nothing");
    assert_eq!(c.released_amount, released, "earlier clock never reduces earnings");
    assert_eq!(c.status, ContractStatus::Active);

    env.warp(start + 50);
    env.release(id).unwrap();
    let c = env.read_contract(&env.contract_pda(id));
    let at_50 = expected_accrued(TOTAL_AMOUNT, start, end, start + 50);
    assert_eq!(c.stream_released_amount, at_50);
    assert_eq!(c.released_amount, at_50);
    env.assert_no_token_movement(id, TOTAL_AMOUNT);
}

#[test]
fn second_call_at_same_time_is_idempotent() {
    let mut env = setup(TOTAL_AMOUNT);
    let (id, start) = activate_streaming(&mut env, TOTAL_AMOUNT);
    env.warp(start + DURATION / 2);
    env.release(id).unwrap();
    let first = env.read_contract(&env.contract_pda(id)).released_amount;
    env.release(id).unwrap();
    let c = env.read_contract(&env.contract_pda(id));
    assert_eq!(c.released_amount, first);
    assert_eq!(c.stream_released_amount, first);
}

#[test]
fn later_call_releases_only_delta() {
    let mut env = setup(TOTAL_AMOUNT);
    let (id, start) = activate_streaming(&mut env, TOTAL_AMOUNT);
    let end = start + DURATION;
    env.warp(start + INTERVAL);
    env.release(id).unwrap();
    let first = env
        .read_contract(&env.contract_pda(id))
        .stream_released_amount;
    assert_eq!(
        first,
        expected_accrued(TOTAL_AMOUNT, start, end, start + INTERVAL)
    );

    env.warp(start + 2 * INTERVAL);
    env.release(id).unwrap();
    let second = env
        .read_contract(&env.contract_pda(id))
        .stream_released_amount;
    assert_eq!(
        second,
        expected_accrued(TOTAL_AMOUNT, start, end, start + 2 * INTERVAL)
    );
    assert!(second > first);

    env.warp(end);
    env.release(id).unwrap();
    assert_eq!(
        env.read_contract(&env.contract_pda(id))
            .stream_released_amount,
        TOTAL_AMOUNT
    );
}

#[test]
fn last_period_end_not_used_as_accrual_clock() {
    let mut env = setup(TOTAL_AMOUNT);
    let (id, start) = activate_streaming(&mut env, TOTAL_AMOUNT);
    let before = env.read_contract(&env.contract_pda(id)).last_period_end;
    assert_eq!(before, start);
    env.warp(start + DURATION / 2);
    env.release(id).unwrap();
    let c = env.read_contract(&env.contract_pda(id));
    assert_eq!(c.last_period_end, before);
    assert_eq!(c.released_unit_count, 0);
}

#[test]
fn trial_is_not_counted_as_stream_release() {
    let mut env = setup(TOTAL_AMOUNT);
    let (id, start) = activate_streaming_trial(&mut env);
    let c = env.read_contract(&env.contract_pda(id));
    assert_eq!(c.released_amount, TRIAL_AMOUNT);
    assert_eq!(c.stream_released_amount, 0);
    assert_eq!(c.main_amount, MAIN_AMOUNT);

    env.warp(start + DURATION);
    env.release(id).unwrap();
    let c = env.read_contract(&env.contract_pda(id));
    assert_eq!(c.stream_released_amount, MAIN_AMOUNT);
    assert_eq!(c.released_amount, TOTAL_AMOUNT);
    assert_eq!(c.released_amount, c.trial_amount + c.stream_released_amount);
    assert!(c.released_amount <= c.total_amount);
    env.assert_no_token_movement(id, TOTAL_AMOUNT);
}

#[test]
fn ten_units_over_sixty_seconds_is_3_6_10() {
    let mut env = setup(10);
    let (id, start) = activate_streaming(&mut env, 10);
    let end = start + DURATION;
    env.warp(start);
    env.release(id).unwrap();
    assert_eq!(
        env.read_contract(&env.contract_pda(id))
            .stream_released_amount,
        0
    );

    env.warp(start + 20);
    env.release(id).unwrap();
    assert_eq!(
        env.read_contract(&env.contract_pda(id))
            .stream_released_amount,
        3
    );

    env.warp(start + 40);
    env.release(id).unwrap();
    assert_eq!(
        env.read_contract(&env.contract_pda(id))
            .stream_released_amount,
        6
    );

    env.warp(end);
    env.release(id).unwrap();
    assert_eq!(
        env.read_contract(&env.contract_pda(id))
            .stream_released_amount,
        10
    );
    env.assert_no_token_movement(id, 10);
}

#[test]
fn frequent_releases_still_total_exactly_ten() {
    let mut env = setup(10);
    let (id, start) = activate_streaming(&mut env, 10);
    for t in 0..=DURATION {
        env.warp(start + t);
        env.release(id).unwrap();
        let released = env
            .read_contract(&env.contract_pda(id))
            .stream_released_amount;
        assert!(released <= 10);
    }
    assert_eq!(
        env.read_contract(&env.contract_pda(id))
            .stream_released_amount,
        10
    );
}

#[test]
fn three_units_over_sixty_seconds_reach_exactly_three() {
    let mut env = setup(3);
    let (id, start) = activate_streaming(&mut env, 3);
    for t in 0..=DURATION {
        env.warp(start + t);
        env.release(id).unwrap();
    }
    let c = env.read_contract(&env.contract_pda(id));
    assert_eq!(c.stream_released_amount, 3);
    assert_eq!(c.released_amount, 3);
}

#[test]
fn one_release_at_end_equals_many_releases() {
    let mut once = setup(13);
    let (id_once, start_once) = activate_streaming(&mut once, 13);
    once.warp(start_once + DURATION);
    once.release(id_once).unwrap();
    let one_shot = once
        .read_contract(&once.contract_pda(id_once))
        .stream_released_amount;

    let mut many = setup(13);
    let (id_many, start_many) = activate_streaming(&mut many, 13);
    for t in 0..=DURATION {
        many.warp(start_many + t);
        many.release(id_many).unwrap();
    }
    let many_shot = many
        .read_contract(&many.contract_pda(id_many))
        .stream_released_amount;
    assert_eq!(one_shot, 13);
    assert_eq!(many_shot, 13);
    assert_eq!(one_shot, many_shot);
}

#[test]
fn prime_amount_reaches_exact_full() {
    let amount = 997u64;
    let mut env = setup(amount);
    let (id, start) = activate_streaming(&mut env, amount);
    env.warp(start + DURATION);
    env.release(id).unwrap();
    assert_eq!(
        env.read_contract(&env.contract_pda(id))
            .stream_released_amount,
        amount
    );
}

#[test]
fn cannot_release_before_scheduled_start() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    let mut args = streaming_args(1, TOTAL_AMOUNT, now);
    args.start_mode = StartMode::Scheduled;
    args.scheduled_start_time = now + 3_600;
    env.create(&args).unwrap();
    env.accept(1).unwrap();
    env.approve_activation(1).unwrap();
    let c = env.read_contract(&env.contract_pda(1));
    assert_eq!(c.start_time, now + 3_600);
    assert_eq!(c.last_period_end, c.start_time);
    assert_rejected(
        env.release(1),
        E_CONTRACT_NOT_STARTED,
        "release before scheduled start",
    );
    assert_eq!(env.read_contract(&env.contract_pda(1)).released_amount, 0);

    env.warp(c.start_time);
    env.release(1).unwrap();
    assert_eq!(
        env.read_contract(&env.contract_pda(1))
            .stream_released_amount,
        0
    );

    env.warp(c.start_time + DURATION / 2);
    env.release(1).unwrap();
    assert_eq!(
        env.read_contract(&env.contract_pda(1))
            .stream_released_amount,
        TOTAL_AMOUNT / 2
    );
}

#[test]
fn on_activation_uses_activation_time_not_accept() {
    let mut env = setup(TOTAL_AMOUNT);
    let created = env.now();
    env.create(&streaming_args(1, TOTAL_AMOUNT, created))
        .unwrap();
    env.accept(1).unwrap();
    let accepted_at = env.read_contract(&env.contract_pda(1)).accepted_at;
    env.warp(accepted_at + 30);
    env.approve_activation(1).unwrap();
    let c = env.read_contract(&env.contract_pda(1));
    assert_eq!(c.start_time, accepted_at + 30);
    assert_ne!(c.start_time, accepted_at);
    assert_ne!(c.start_time, created);
}

#[test]
fn acceptance_and_trial_submit_do_not_start_accrual() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    let mut args = streaming_args(1, TOTAL_AMOUNT, now);
    args.trial_amount = TRIAL_AMOUNT;
    env.create(&args).unwrap();
    env.accept(1).unwrap();
    assert_rejected(env.release(1), E_INVALID_STATE, "release after accept");
    env.submit_trial(1).unwrap();
    assert_rejected(
        env.release(1),
        E_INVALID_STATE,
        "release after trial submit",
    );
    let c = env.read_contract(&env.contract_pda(1));
    assert_eq!(c.status, ContractStatus::PendingEmployerApproval);
    assert_eq!(c.start_time, 0);
    assert_eq!(c.released_amount, 0);
    assert_eq!(c.stream_released_amount, 0);
}

#[test]
fn pending_acceptance_cannot_release() {
    let mut env = setup(TOTAL_AMOUNT);
    env.create(&streaming_args(1, TOTAL_AMOUNT, env.now()))
        .unwrap();
    assert_rejected(
        env.release(1),
        E_INVALID_STATE,
        "release while pending acceptance",
    );
}

#[test]
fn activation_rejected_cannot_release() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    let mut args = streaming_args(1, TOTAL_AMOUNT, now);
    args.trial_amount = TRIAL_AMOUNT;
    env.create(&args).unwrap();
    env.accept(1).unwrap();
    env.reject(1, true).unwrap();
    let c = env.read_contract(&env.contract_pda(1));
    assert_eq!(c.status, ContractStatus::ActivationRejected);
    assert_rejected(
        env.release(1),
        E_INVALID_STATE,
        "release after activation rejected",
    );
}

#[test]
fn disputed_cannot_release() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    let mut args = streaming_args(1, TOTAL_AMOUNT, now);
    args.trial_amount = TRIAL_AMOUNT;
    env.create(&args).unwrap();
    env.accept(1).unwrap();
    env.submit_trial(1).unwrap();
    env.reject(1, true).unwrap();
    let c = env.read_contract(&env.contract_pda(1));
    assert_eq!(c.status, ContractStatus::Disputed);
    assert_rejected(env.release(1), E_INVALID_STATE, "release while disputed");
}

#[test]
fn non_streaming_contract_rejected() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    let args = CreateContractArgs {
        payment_mode: PaymentMode::Fixed,
        checkpoint_interval: 12_345,
        ..streaming_args(1, TOTAL_AMOUNT, now)
    };
    env.create(&args).unwrap();
    env.accept(1).unwrap();
    env.approve_activation(1).unwrap();
    assert_rejected(
        env.release(1),
        E_INVALID_PAYMENT_MODE,
        "fixed contract stream release",
    );
}

#[test]
fn third_party_release_cannot_redirect_value() {
    let mut env = setup(TOTAL_AMOUNT);
    let (id, start) = activate_streaming(&mut env, TOTAL_AMOUNT);
    env.warp(start + DURATION);
    let outsider = clone_kp(&env.outsider);
    env.release_as(&outsider, id).unwrap();
    let _ = env.outsider_pk;
    let c = env.read_contract(&env.contract_pda(id));
    assert_eq!(c.stream_released_amount, TOTAL_AMOUNT);
    assert_eq!(c.released_amount, TOTAL_AMOUNT);
    assert_eq!(c.freelancer, env.freelancer_pk);
    env.assert_no_token_movement(id, TOTAL_AMOUNT);
}

#[test]
fn fake_contract_pda_rejected() {
    let mut env = setup(TOTAL_AMOUNT);
    let _ = activate_streaming(&mut env, TOTAL_AMOUNT);
    let fake = Keypair::new().pubkey();
    let ix = env.release_ix(env.freelancer_pk, fake);
    assert_rejected(
        env.send_freelancer(ix),
        E_ACCOUNT_NOT_INITIALIZED,
        "fake contract PDA",
    );
}

#[test]
fn phase_five_generic_flow_cannot_release_streaming() {
    let mut env = setup(TOTAL_AMOUNT);
    let (id, start) = activate_streaming(&mut env, TOTAL_AMOUNT);
    let contract = env.contract_pda(id);
    let missing = env.work_unit_pda(&contract, 0);
    let ix = Instruction {
        program_id: env.program_id,
        accounts: streampay_program::accounts::SubmitWorkUnit {
            freelancer: env.freelancer_pk,
            contract,
            work_unit: missing,
        }
        .to_account_metas(None),
        data: streampay_program::instruction::SubmitWorkUnit {
            submission_uri: SUBMISSION_URI.to_string(),
            submission_hash: SUBMISSION_HASH,
        }
        .data(),
    };
    assert_rejected(
        env.send_freelancer(ix),
        E_ACCOUNT_NOT_INITIALIZED,
        "streaming submit_work_unit",
    );
    env.warp(start + DURATION);
    env.release(id).unwrap();
    assert_eq!(
        env.read_contract(&contract).stream_released_amount,
        TOTAL_AMOUNT
    );
}

#[test]
fn skipped_releases_do_not_lose_accrual() {
    let mut env = setup(TOTAL_AMOUNT);
    let (id, start) = activate_streaming(&mut env, TOTAL_AMOUNT);
    env.warp(start + DURATION / 2);
    // Intentionally no release at midpoint: future cancellation at this Tc
    // can still read canonical accrual from start/end/main/now.
    env.warp(start + DURATION);
    env.release(id).unwrap();
    let c = env.read_contract(&env.contract_pda(id));
    assert_eq!(c.stream_released_amount, TOTAL_AMOUNT);
    assert_eq!(c.released_amount, TOTAL_AMOUNT);
    assert!(c.withdrawn_amount <= c.released_amount);
}

#[test]
fn withdrawn_never_exceeds_released() {
    let mut env = setup(TOTAL_AMOUNT);
    let (id, start) = activate_streaming(&mut env, TOTAL_AMOUNT);
    env.warp(start + DURATION / 2);
    env.release(id).unwrap();
    let c = env.read_contract(&env.contract_pda(id));
    assert!(c.withdrawn_amount <= c.released_amount);
    assert!(c.stream_released_amount <= c.main_amount);
    assert!(c.released_amount <= c.total_amount);
    env.assert_no_token_movement(id, TOTAL_AMOUNT);
}
