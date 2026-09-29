//! StreamPay V2 Phase H2 tests: dedicated Hourly protocol.
//!
//! Rebuild `target/deploy/streampay.so` after program changes.
//! Hourly End uses Cancelled as unused-budget settlement, not a punitive cancel.

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
    self as streampay_program, canonical_hourly_earned, Contract, ContractStatus,
    CreateContractArgs, CreateHourlyContractArgs, HourlySession, HourlySessionStatus, HourlyState,
    PaymentMode, StartMode, HOURLY_NO_ACTIVE_SESSION, MAX_HOURLY_SESSIONS,
};

const E_INVALID_PAYMENT_MODE: u32 = 6110;
const E_INVALID_STATE: u32 = 6111;
const E_INVALID_METADATA: u32 = 6108;
const E_INVALID_HOURLY_RATE: u32 = 6166;
const E_INVALID_AUTHORIZED_SECONDS: u32 = 6167;
const E_HOURLY_MAIN_AMOUNT_ZERO: u32 = 6168;
const E_HOURLY_SESSION_ALREADY_ACTIVE: u32 = 6171;
const E_HOURLY_SESSION_LIMIT: u32 = 6173;
const E_HOURLY_AUTHORIZED_EXHAUSTED: u32 = 6174;
const E_HOURLY_ENGAGEMENT_EXPIRED: u32 = 6175;
const E_HOURLY_OPEN_SESSION_BLOCKS: u32 = 6178;
const E_DISPUTE_NOT_ALLOWED: u32 = 6159;

const MINT_DECIMALS: u8 = 6;
const BASE_TS: i64 = 1_700_000_000;
const TOKEN: u64 = 1_000_000;
const RATE: u64 = 10 * TOKEN;
const RESOLVER_BYTES: [u8; 32] = [0x11; 32];
const WORK_LOG_URI: &str = "ipfs://bafyHourlyWorkLog";
const WORK_LOG_HASH: [u8; 32] = [9u8; 32];

fn earned(seconds: u64) -> u64 {
    canonical_hourly_earned(RATE, seconds).unwrap()
}

fn error_code(failure: &FailedTransactionMetadata) -> u32 {
    match &failure.err {
        TransactionError::InstructionError(_, InstructionError::Custom(code)) => *code,
        other => panic!(
            "expected custom program error, got {other:?}\nlogs:\n{}",
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
        "{what}: expected {expected}, got {actual}\nlogs:\n{}",
        failure.meta.logs.join("\n")
    );
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
    freelancer_token_account: Address,
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
    svm.airdrop(&freelancer_pk, 10_000_000_000).unwrap();

    let token_mint = CreateMint::new(&mut svm, &employer)
        .authority(&employer_pk)
        .decimals(MINT_DECIMALS)
        .send()
        .unwrap();
    let employer_token_account = CreateAccount::new(&mut svm, &employer, &token_mint)
        .owner(&employer_pk)
        .send()
        .unwrap();
    let freelancer_token_account = CreateAccount::new(&mut svm, &employer, &token_mint)
        .owner(&freelancer_pk)
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
        freelancer_token_account,
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

    fn contract_pda(&self, id: u64) -> Address {
        Address::find_program_address(
            &[
                b"contract",
                self.employer_pk.as_ref(),
                self.freelancer_pk.as_ref(),
                &id.to_le_bytes(),
            ],
            &self.program_id,
        )
        .0
    }

    fn escrow_pda(&self, contract: &Address) -> Address {
        Address::find_program_address(&[b"contract_escrow", contract.as_ref()], &self.program_id).0
    }

    fn hourly_state_pda(&self, contract: &Address) -> Address {
        Address::find_program_address(&[b"hourly_state", contract.as_ref()], &self.program_id).0
    }

    fn hourly_session_pda(&self, contract: &Address, index: u32) -> Address {
        Address::find_program_address(
            &[
                b"hourly_session",
                contract.as_ref(),
                &index.to_le_bytes(),
            ],
            &self.program_id,
        )
        .0
    }

    fn trial_pda(&self, contract: &Address) -> Address {
        Address::find_program_address(&[b"trial_unit", contract.as_ref()], &self.program_id).0
    }

    fn token_balance(&self, account: &Address) -> u64 {
        let parsed: SplTokenAccount = get_spl_account(&self.svm, account).unwrap();
        parsed.amount
    }

    fn read_contract(&self, contract: &Address) -> Contract {
        let account = self.svm.get_account(contract).expect("contract missing");
        let mut data: &[u8] = &account.data;
        Contract::try_deserialize(&mut data).expect("contract decode")
    }

    fn read_hourly_state(&self, contract: &Address) -> HourlyState {
        let pda = self.hourly_state_pda(contract);
        let account = self.svm.get_account(&pda).expect("hourly state missing");
        let mut data: &[u8] = &account.data;
        HourlyState::try_deserialize(&mut data).expect("hourly state decode")
    }

    fn read_session(&self, contract: &Address, index: u32) -> HourlySession {
        let pda = self.hourly_session_pda(contract, index);
        let account = self.svm.get_account(&pda).expect("session missing");
        let mut data: &[u8] = &account.data;
        HourlySession::try_deserialize(&mut data).expect("session decode")
    }

    fn send_employer(&mut self, instruction: Instruction) -> TransactionResult {
        let message = Message::new(&[instruction], Some(&self.employer_pk));
        let tx = Transaction::new(&[&self.employer], message, self.svm.latest_blockhash());
        self.svm.send_transaction(tx)
    }

    fn send_freelancer(&mut self, instruction: Instruction) -> TransactionResult {
        let message = Message::new(&[instruction], Some(&self.freelancer_pk));
        let tx = Transaction::new(&[&self.freelancer], message, self.svm.latest_blockhash());
        self.svm.send_transaction(tx)
    }

    fn create_hourly(&mut self, args: &CreateHourlyContractArgs) -> TransactionResult {
        let contract = self.contract_pda(args.contract_id);
        let trial = if args.trial_amount > 0 {
            Some(self.trial_pda(&contract))
        } else {
            None
        };
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::CreateHourlyContract {
                employer: self.employer_pk,
                freelancer: self.freelancer_pk,
                token_mint: self.token_mint,
                employer_token_account: self.employer_token_account,
                contract,
                contract_escrow: self.escrow_pda(&contract),
                hourly_state: self.hourly_state_pda(&contract),
                trial_work_unit: trial,
                token_program: TOKEN_ID,
                system_program: anchor_lang::system_program::ID,
            }
            .to_account_metas(None),
            data: streampay_program::instruction::CreateHourlyContract { args: args.clone() }
                .data(),
        };
        self.send_employer(ix)
    }

    fn accept(&mut self, id: u64) -> TransactionResult {
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::AcceptContract {
                freelancer: self.freelancer_pk,
                contract: self.contract_pda(id),
            }
            .to_account_metas(None),
            data: streampay_program::instruction::AcceptContract {}.data(),
        };
        self.send_freelancer(ix)
    }

    fn approve(&mut self, id: u64) -> TransactionResult {
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::ApproveActivation {
                employer: self.employer_pk,
                contract: self.contract_pda(id),
            }
            .to_account_metas(None),
            data: streampay_program::instruction::ApproveActivation {}.data(),
        };
        self.send_employer(ix)
    }

    fn submit_trial(&mut self, id: u64) -> TransactionResult {
        let contract = self.contract_pda(id);
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::SubmitTrialWork {
                freelancer: self.freelancer_pk,
                contract,
                trial_work_unit: self.trial_pda(&contract),
            }
            .to_account_metas(None),
            data: streampay_program::instruction::SubmitTrialWork {
                submission_uri: "ipfs://bafyTrial".to_string(),
                submission_hash: [3u8; 32],
            }
            .data(),
        };
        self.send_freelancer(ix)
    }

    fn approve_trial(&mut self, id: u64) -> TransactionResult {
        let contract = self.contract_pda(id);
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

    fn start(&mut self, id: u64) -> TransactionResult {
        let contract = self.contract_pda(id);
        let state = self.read_hourly_state(&contract);
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::StartHourlySession {
                freelancer: self.freelancer_pk,
                contract,
                hourly_state: self.hourly_state_pda(&contract),
                hourly_session: self.hourly_session_pda(&contract, state.session_count),
                system_program: anchor_lang::system_program::ID,
            }
            .to_account_metas(None),
            data: streampay_program::instruction::StartHourlySession {}.data(),
        };
        self.send_freelancer(ix)
    }

    fn stop(&mut self, id: u64) -> TransactionResult {
        let contract = self.contract_pda(id);
        let state = self.read_hourly_state(&contract);
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::StopHourlySession {
                freelancer: self.freelancer_pk,
                contract,
                hourly_state: self.hourly_state_pda(&contract),
                hourly_session: self.hourly_session_pda(&contract, state.active_session_index),
            }
            .to_account_metas(None),
            data: streampay_program::instruction::StopHourlySession {
                work_log_uri: WORK_LOG_URI.to_string(),
                work_log_hash: WORK_LOG_HASH,
            }
            .data(),
        };
        self.send_freelancer(ix)
    }

    fn end(&mut self, id: u64) -> TransactionResult {
        let contract = self.contract_pda(id);
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::EndHourlyContract {
                employer: self.employer_pk,
                contract,
                hourly_state: self.hourly_state_pda(&contract),
            }
            .to_account_metas(None),
            data: streampay_program::instruction::EndHourlyContract {}.data(),
        };
        self.send_employer(ix)
    }

    fn cancel(&mut self, id: u64) -> TransactionResult {
        let contract = self.contract_pda(id);
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::CancelActiveContract {
                employer: self.employer_pk,
                contract,
                hourly_state: Some(self.hourly_state_pda(&contract)),
            }
            .to_account_metas(None),
            data: streampay_program::instruction::CancelActiveContract {}.data(),
        };
        self.send_employer(ix)
    }

    fn open_dispute(&mut self, id: u64) -> TransactionResult {
        let contract = self.contract_pda(id);
        let state = self.read_hourly_state(&contract);
        let session = if state.has_active_session() {
            Some(self.hourly_session_pda(&contract, state.active_session_index))
        } else {
            None
        };
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::OpenDispute {
                party: self.employer_pk,
                contract,
                hourly_state: Some(self.hourly_state_pda(&contract)),
                hourly_session: session,
            }
            .to_account_metas(None),
            data: streampay_program::instruction::OpenDispute {}.data(),
        };
        self.send_employer(ix)
    }

    fn withdraw(&mut self, id: u64) -> TransactionResult {
        let contract = self.contract_pda(id);
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::WithdrawFreelancer {
                freelancer: self.freelancer_pk,
                contract,
                token_mint: self.token_mint,
                contract_escrow: self.escrow_pda(&contract),
                freelancer_token_account: self.freelancer_token_account,
                token_program: TOKEN_ID,
            }
            .to_account_metas(None),
            data: streampay_program::instruction::WithdrawFreelancer {}.data(),
        };
        self.send_freelancer(ix)
    }

    fn refund(&mut self, id: u64) -> TransactionResult {
        let contract = self.contract_pda(id);
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::ClaimEmployerRefund {
                employer: self.employer_pk,
                contract,
                token_mint: self.token_mint,
                contract_escrow: self.escrow_pda(&contract),
                employer_token_account: self.employer_token_account,
                token_program: TOKEN_ID,
            }
            .to_account_metas(None),
            data: streampay_program::instruction::ClaimEmployerRefund {}.data(),
        };
        self.send_employer(ix)
    }

    fn complete(&mut self, id: u64) -> TransactionResult {
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::CompleteContract {
                caller: self.employer_pk,
                contract: self.contract_pda(id),
            }
            .to_account_metas(None),
            data: streampay_program::instruction::CompleteContract {}.data(),
        };
        self.send_employer(ix)
    }

    fn release_stream(&mut self, id: u64) -> TransactionResult {
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::ReleaseStreamAccrual {
                caller: self.employer_pk,
                contract: self.contract_pda(id),
            }
            .to_account_metas(None),
            data: streampay_program::instruction::ReleaseStreamAccrual {}.data(),
        };
        self.send_employer(ix)
    }

    fn offer_and_activate(&mut self, id: u64, authorized: u64, duration: i64, trial: u64) {
        let args = hourly_args(id, authorized, duration, trial, self.now());
        self.create_hourly(&args).expect("create hourly");
        self.accept(id).expect("accept");
        if trial > 0 {
            self.submit_trial(id).expect("submit trial");
            self.approve_trial(id).expect("approve trial");
        } else {
            self.approve(id).expect("approve");
        }
    }
}

fn hourly_args(
    id: u64,
    authorized_seconds: u64,
    duration_seconds: i64,
    trial_amount: u64,
    now: i64,
) -> CreateHourlyContractArgs {
    CreateHourlyContractArgs {
        contract_id: id,
        hourly_rate: RATE,
        authorized_seconds,
        acceptance_deadline: now + 3_600,
        duration_seconds,
        review_duration: 300,
        activation_review_duration: 3_600,
        max_revisions: 2,
        trial_amount,
        resolver: Pubkey::new_from_array(RESOLVER_BYTES),
        metadata_uri: "ipfs://bafyHourlyMeta".to_string(),
        metadata_hash: [7u8; 32],
    }
}

fn offer_active(id: u64, authorized: u64, duration: i64) -> (Env, Address) {
    let main = earned(authorized);
    let mut env = setup(main + 50 * TOKEN);
    env.offer_and_activate(id, authorized, duration, 0);
    let contract = env.contract_pda(id);
    (env, contract)
}

// ---------------------------------------------------------------------------
// Creation / funding
// ---------------------------------------------------------------------------

#[test]
fn create_hourly_funds_derived_total_and_inits_idle_state() {
    let authorized = 7_200u64;
    let main = earned(authorized);
    let mut env = setup(main);
    let args = hourly_args(1, authorized, 86_400, 0, env.now());
    env.create_hourly(&args).expect("create");

    let contract_addr = env.contract_pda(1);
    let contract = env.read_contract(&contract_addr);
    assert_eq!(contract.payment_mode, PaymentMode::Hourly);
    assert_eq!(contract.status, ContractStatus::PendingAcceptance);
    assert_eq!(contract.start_mode, StartMode::OnActivation);
    assert_eq!(contract.main_amount, main);
    assert_eq!(contract.trial_amount, 0);
    assert_eq!(contract.total_amount, main);
    assert_eq!(contract.released_amount, 0);
    assert_eq!(env.token_balance(&env.escrow_pda(&contract_addr)), main);

    let state = env.read_hourly_state(&contract_addr);
    assert_eq!(state.hourly_rate, RATE);
    assert_eq!(state.authorized_seconds, authorized);
    assert_eq!(state.approved_seconds, 0);
    assert_eq!(state.session_count, 0);
    assert_eq!(state.active_session_index, HOURLY_NO_ACTIVE_SESSION);
    assert!(!state.has_active_session());
}

#[test]
fn create_hourly_rejects_invalid_rate_and_authorized_seconds() {
    let mut env = setup(100 * TOKEN);
    let now = env.now();
    let mut zero_rate = hourly_args(1, 3_600, 86_400, 0, now);
    zero_rate.hourly_rate = 0;
    assert_rejected(env.create_hourly(&zero_rate), E_INVALID_HOURLY_RATE, "zero rate");

    let mut zero_auth = hourly_args(2, 3_600, 86_400, 0, now);
    zero_auth.authorized_seconds = 0;
    assert_rejected(
        env.create_hourly(&zero_auth),
        E_INVALID_AUTHORIZED_SECONDS,
        "zero authorized",
    );

    let mut dust = hourly_args(3, 1, 86_400, 0, now);
    dust.hourly_rate = 1;
    assert_rejected(
        env.create_hourly(&dust),
        E_HOURLY_MAIN_AMOUNT_ZERO,
        "main amount zero",
    );
}

#[test]
fn create_contract_still_rejects_hourly_mode() {
    let mut env = setup(TOKEN);
    let now = env.now();
    let args = CreateContractArgs {
        contract_id: 9,
        payment_mode: PaymentMode::Hourly,
        start_mode: StartMode::OnActivation,
        total_amount: TOKEN,
        acceptance_deadline: now + 3_600,
        scheduled_start_time: 0,
        duration_seconds: 3_600,
        checkpoint_interval: 0,
        review_duration: 300,
        activation_review_duration: 3_600,
        max_revisions: 1,
        trial_amount: 0,
        resolver: Pubkey::new_from_array(RESOLVER_BYTES),
        metadata_uri: "ipfs://bafyMeta".to_string(),
        metadata_hash: [1u8; 32],
    };
    let contract = env.contract_pda(9);
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
            fixed_work_unit: None,
            token_program: TOKEN_ID,
            system_program: anchor_lang::system_program::ID,
        }
        .to_account_metas(None),
        data: streampay_program::instruction::CreateContract { args }.data(),
    };
    assert_rejected(env.send_employer(ix), E_INVALID_PAYMENT_MODE, "hourly via create_contract");
}

#[test]
fn trial_plus_hourly_activation_does_not_start_timer() {
    let authorized = 3_600u64;
    let trial = 2 * TOKEN;
    let main = earned(authorized);
    let mut env = setup(main + trial);
    env.offer_and_activate(1, authorized, 86_400, trial);
    let contract_addr = env.contract_pda(1);
    let contract = env.read_contract(&contract_addr);
    assert_eq!(contract.status, ContractStatus::Active);
    assert_eq!(contract.released_amount, trial);
    assert_eq!(contract.main_amount, main);
    let state = env.read_hourly_state(&contract_addr);
    assert_eq!(state.approved_seconds, 0);
    assert!(!state.has_active_session());
    assert_eq!(state.session_count, 0);
}

#[test]
fn activation_without_trial_leaves_idle_hourly_state() {
    let (env, contract) = offer_active(1, 3_600, 86_400);
    let c = env.read_contract(&contract);
    assert_eq!(c.status, ContractStatus::Active);
    assert_eq!(c.released_amount, 0);
    let state = env.read_hourly_state(&contract);
    assert!(!state.has_active_session());
    assert_eq!(state.approved_seconds, 0);
}

// ---------------------------------------------------------------------------
// Start / Stop
// ---------------------------------------------------------------------------

#[test]
fn start_requires_freelancer_and_engagement_window() {
    let (mut env, contract) = offer_active(1, 3_600, 86_400);
    let start_ix_employer = {
        let state = env.read_hourly_state(&contract);
        Instruction {
            program_id: env.program_id,
            accounts: streampay_program::accounts::StartHourlySession {
                freelancer: env.employer_pk,
                contract,
                hourly_state: env.hourly_state_pda(&contract),
                hourly_session: env.hourly_session_pda(&contract, state.session_count),
                system_program: anchor_lang::system_program::ID,
            }
            .to_account_metas(None),
            data: streampay_program::instruction::StartHourlySession {}.data(),
        }
    };
    assert_rejected(
        env.send_employer(start_ix_employer),
        2006,
        "employer cannot start (seeds bind the freelancer)",
    );

    env.start(1).expect("start");
    assert_rejected(env.start(1), E_HOURLY_SESSION_ALREADY_ACTIVE, "second start");

    let state = env.read_hourly_state(&contract);
    assert_eq!(state.active_session_index, 0);
    assert_eq!(state.session_count, 1);
    let session = env.read_session(&contract, 0);
    assert_eq!(session.status, HourlySessionStatus::Open);
    assert_eq!(session.index, 0);
    assert_eq!(session.started_at, env.now());
}

#[test]
fn stop_credits_cumulative_earnings_and_clears_active_index() {
    let (mut env, contract) = offer_active(1, 7_200, 86_400);
    env.start(1).expect("start");
    env.warp(env.now() + 3_600);
    env.stop(1).expect("stop");

    let c = env.read_contract(&contract);
    assert_eq!(c.released_amount, earned(3_600));
    assert!(c.released_amount <= c.total_amount);
    let state = env.read_hourly_state(&contract);
    assert_eq!(state.approved_seconds, 3_600);
    assert!(!state.has_active_session());
    let session = env.read_session(&contract, 0);
    assert_eq!(session.status, HourlySessionStatus::Recorded);
    assert_eq!(session.duration_seconds, 3_600);
    assert_eq!(session.work_log_uri, WORK_LOG_URI);

    let replay = env.stop(1);
    assert!(
        replay.is_err(),
        "duplicate stop after index cleared must fail"
    );
}

#[test]
fn short_session_voids_when_authorized_remainder_meets_minimum() {
    let (mut env, contract) = offer_active(1, 3_600, 86_400);
    env.start(1).expect("start");
    env.warp(env.now() + 30);
    env.stop(1).expect("short stop");
    let state = env.read_hourly_state(&contract);
    assert_eq!(state.approved_seconds, 0);
    assert!(!state.has_active_session());
    let session = env.read_session(&contract, 0);
    assert_eq!(session.status, HourlySessionStatus::Void);
    assert_eq!(session.duration_seconds, 0);
    assert_eq!(env.read_contract(&contract).released_amount, 0);
}

#[test]
fn final_short_remainder_is_recorded() {
    let (mut env, contract) = offer_active(1, 45, 86_400);
    env.start(1).expect("start");
    env.warp(env.now() + 30);
    env.stop(1).expect("final remainder");
    let state = env.read_hourly_state(&contract);
    assert_eq!(state.approved_seconds, 30);
    let session = env.read_session(&contract, 0);
    assert_eq!(session.status, HourlySessionStatus::Recorded);
    assert_eq!(session.duration_seconds, 30);
}

#[test]
fn forgotten_timer_caps_at_eight_hours() {
    let (mut env, contract) = offer_active(1, 100_000, 200_000);
    env.start(1).expect("start");
    env.warp(env.now() + 10 * 3_600);
    env.stop(1).expect("late stop");
    let state = env.read_hourly_state(&contract);
    assert_eq!(state.approved_seconds, 28_800);
    assert_eq!(env.read_contract(&contract).released_amount, earned(28_800));
}

#[test]
fn authorized_seconds_cap_on_stop() {
    let (mut env, contract) = offer_active(1, 1_800, 86_400);
    env.start(1).expect("start");
    env.warp(env.now() + 10_000);
    env.stop(1).expect("capped stop");
    let state = env.read_hourly_state(&contract);
    assert_eq!(state.approved_seconds, 1_800);
    assert_eq!(env.read_contract(&contract).released_amount, earned(1_800));
    assert_rejected(env.start(1), E_HOURLY_AUTHORIZED_EXHAUSTED, "exhausted");
}

#[test]
fn engagement_window_caps_stop_and_blocks_late_start() {
    let (mut env, contract) = offer_active(1, 100_000, 1_200);
    env.start(1).expect("start");
    env.warp(env.now() + 10_000);
    env.stop(1).expect("capped by end_time");
    let state = env.read_hourly_state(&contract);
    assert_eq!(state.approved_seconds, 1_200);
    assert_rejected(env.start(1), E_HOURLY_ENGAGEMENT_EXPIRED, "start after end");
}

#[test]
fn multiple_sessions_use_indexed_pdas_and_cumulative_rounding() {
    let (mut env, contract) = offer_active(1, 3_600, 86_400);
    for _ in 0..3 {
        env.start(1).expect("start");
        env.warp(env.now() + 1_200);
        env.stop(1).expect("stop 20m");
    }
    let state = env.read_hourly_state(&contract);
    assert_eq!(state.session_count, 3);
    assert_eq!(state.approved_seconds, 3_600);
    let released = env.read_contract(&contract).released_amount;
    assert_eq!(released, earned(3_600));
    assert_eq!(released, 10 * TOKEN);
    let s0 = env.hourly_session_pda(&contract, 0);
    let s1 = env.hourly_session_pda(&contract, 1);
    assert_ne!(s0, s1);
    assert_eq!(env.read_session(&contract, 0).index, 0);
    assert_eq!(env.read_session(&contract, 2).index, 2);
}

#[test]
fn session_limit_is_enforced() {
    let (mut env, _contract) = offer_active(1, 200_000, 1_000_000);
    for i in 0..MAX_HOURLY_SESSIONS {
        env.start(1).unwrap_or_else(|_| panic!("start {i}"));
        env.warp(env.now() + 60);
        env.stop(1).unwrap_or_else(|_| panic!("stop {i}"));
    }
    assert_rejected(env.start(1), E_HOURLY_SESSION_LIMIT, "65th session");
}

#[test]
fn stop_requires_work_log_uri() {
    let (mut env, contract) = offer_active(1, 3_600, 86_400);
    env.start(1).expect("start");
    env.warp(env.now() + 60);
    let state = env.read_hourly_state(&contract);
    let ix = Instruction {
        program_id: env.program_id,
        accounts: streampay_program::accounts::StopHourlySession {
            freelancer: env.freelancer_pk,
            contract,
            hourly_state: env.hourly_state_pda(&contract),
            hourly_session: env.hourly_session_pda(&contract, state.active_session_index),
        }
        .to_account_metas(None),
        data: streampay_program::instruction::StopHourlySession {
            work_log_uri: String::new(),
            work_log_hash: WORK_LOG_HASH,
        }
        .data(),
    };
    assert_rejected(env.send_freelancer(ix), E_INVALID_METADATA, "empty work log");
}

// ---------------------------------------------------------------------------
// Cancel / End / Withdraw
// ---------------------------------------------------------------------------

#[test]
fn cancel_without_open_session_settles_released_remainder() {
    let (mut env, contract) = offer_active(1, 7_200, 86_400);
    env.start(1).expect("start");
    env.warp(env.now() + 3_600);
    env.stop(1).expect("stop");
    env.cancel(1).expect("cancel idle hourly");
    let c = env.read_contract(&contract);
    assert_eq!(c.status, ContractStatus::Cancelled);
    assert_eq!(c.freelancer_settlement_amount, earned(3_600));
    assert_eq!(c.employer_refundable_amount, c.total_amount - earned(3_600));
}

#[test]
fn cancel_and_end_reject_open_session() {
    let (mut env, _contract) = offer_active(1, 7_200, 86_400);
    env.start(1).expect("start");
    assert_rejected(env.cancel(1), E_HOURLY_OPEN_SESSION_BLOCKS, "cancel open");
    assert_rejected(env.end(1), E_HOURLY_OPEN_SESSION_BLOCKS, "end open");
}

#[test]
fn end_is_unused_budget_settlement_not_complete() {
    let (mut env, contract) = offer_active(1, 7_200, 86_400);
    env.start(1).expect("start");
    env.warp(env.now() + 3_600);
    env.stop(1).expect("stop");
    assert_rejected(env.complete(1), E_INVALID_PAYMENT_MODE, "complete hourly");
    env.end(1).expect("end");
    let c = env.read_contract(&contract);
    // Hourly End uses Cancelled so settlement-claim instructions apply.
    // This is unused-budget close, not a punitive cancellation.
    assert_eq!(c.status, ContractStatus::Cancelled);
    assert_eq!(c.freelancer_settlement_amount, earned(3_600));
    assert_eq!(c.employer_refundable_amount, c.total_amount - earned(3_600));
}

#[test]
fn withdraw_and_refund_reuse_existing_instructions() {
    let (mut env, contract) = offer_active(1, 7_200, 86_400);
    env.start(1).expect("start");
    env.warp(env.now() + 3_600);
    env.stop(1).expect("stop");
    env.withdraw(1).expect("withdraw after stop");
    assert_eq!(env.token_balance(&env.freelancer_token_account), earned(3_600));

    env.end(1).expect("end");
    let before = env.token_balance(&env.employer_token_account);
    env.refund(1).expect("refund unused");
    let refunded = env.read_contract(&contract).employer_refundable_amount;
    assert_eq!(env.token_balance(&env.employer_token_account), before + refunded);
    assert_eq!(env.token_balance(&env.escrow_pda(&contract)), 0);
}

#[test]
fn released_never_exceeds_total() {
    let (mut env, contract) = offer_active(1, 3_600, 86_400);
    env.start(1).expect("start");
    env.warp(env.now() + 20_000);
    env.stop(1).expect("stop");
    let c = env.read_contract(&contract);
    assert!(c.released_amount <= c.total_amount);
    assert_eq!(c.released_amount, c.main_amount);
}

#[test]
fn hourly_rejected_from_stream_release() {
    let (mut env, _contract) = offer_active(1, 3_600, 86_400);
    assert_rejected(env.release_stream(1), E_INVALID_PAYMENT_MODE, "stream on hourly");
}

// ---------------------------------------------------------------------------
// Dispute materialization
// ---------------------------------------------------------------------------

#[test]
fn dispute_without_open_session_freezes_remainder() {
    let (mut env, contract) = offer_active(1, 7_200, 86_400);
    env.start(1).expect("start");
    env.warp(env.now() + 3_600);
    env.stop(1).expect("stop");
    env.open_dispute(1).expect("dispute idle");
    let c = env.read_contract(&contract);
    assert_eq!(c.status, ContractStatus::Disputed);
    assert_eq!(c.released_amount, earned(3_600));
    assert_eq!(c.contested_amount, c.total_amount - c.released_amount);
}

#[test]
fn employer_cannot_erase_three_hours_by_disputing_before_stop() {
    let (mut env, contract) = offer_active(1, 14_400, 200_000);
    env.start(1).expect("start");
    env.warp(env.now() + 3 * 3_600);
    env.open_dispute(1).expect("dispute running session");

    let state = env.read_hourly_state(&contract);
    assert_eq!(state.approved_seconds, 10_800);
    assert!(!state.has_active_session());
    let session = env.read_session(&contract, 0);
    assert_eq!(session.status, HourlySessionStatus::Recorded);
    assert_eq!(session.duration_seconds, 10_800);
    let c = env.read_contract(&contract);
    assert_eq!(c.released_amount, earned(10_800));
    assert_eq!(c.status, ContractStatus::Disputed);
    assert_eq!(c.contested_amount, c.total_amount - earned(10_800));
    assert!(c.contested_amount > 0);
}

#[test]
fn disputed_hourly_recorded_time_is_withdrawable_contested_frozen() {
    const E_CONTRACT_TERMINAL: u32 = 6113;
    const E_NOTHING_TO_WITHDRAW: u32 = 6139;
    let (mut env, contract) = offer_active(1, 14_400, 200_000);
    // Prior partial withdrawal of a stopped 1h session.
    env.start(1).expect("start");
    env.warp(env.now() + 3_600);
    env.stop(1).expect("stop");
    env.svm.expire_blockhash();
    env.withdraw(1).expect("withdraw before dispute");
    let prior = env.read_contract(&contract).withdrawn_amount;
    assert_eq!(prior, earned(3_600));
    // A running 2h session is recorded when the dispute opens.
    env.svm.expire_blockhash();
    env.start(1).expect("second start");
    env.warp(env.now() + 7_200);
    env.open_dispute(1).expect("dispute running session");
    let c = env.read_contract(&contract);
    assert_eq!(c.status, ContractStatus::Disputed);
    assert_eq!(env.read_hourly_state(&contract).approved_seconds, 10_800);
    assert!(c.released_amount > prior);
    assert_eq!(c.contested_amount, c.total_amount - c.released_amount);
    env.svm.expire_blockhash();
    assert_rejected(env.refund(1), E_CONTRACT_TERMINAL, "hourly refund while disputed");

    let before = env.token_balance(&env.freelancer_token_account);
    env.svm.expire_blockhash();
    env.withdraw(1).expect("withdraw recorded time while disputed");
    assert_eq!(
        env.token_balance(&env.freelancer_token_account),
        before + (c.released_amount - prior)
    );
    let after = env.read_contract(&contract);
    assert_eq!(after.status, ContractStatus::Disputed);
    assert_eq!(after.withdrawn_amount, after.released_amount);
    assert_eq!(after.released_amount, c.released_amount);
    assert_eq!(after.contested_amount, c.contested_amount);
    assert_eq!(
        env.token_balance(&env.escrow_pda(&contract)),
        after.contested_amount
    );
    env.svm.expire_blockhash();
    assert_rejected(env.withdraw(1), E_NOTHING_TO_WITHDRAW, "hourly second withdraw");
    env.svm.expire_blockhash();
    assert_rejected(env.refund(1), E_CONTRACT_TERMINAL, "hourly refund after withdraw");
}

#[test]
fn dispute_materializes_at_most_eight_hours() {
    let (mut env, contract) = offer_active(1, 100_000, 200_000);
    env.start(1).expect("start");
    env.warp(env.now() + 10 * 3_600);
    env.open_dispute(1).expect("dispute late timer");
    let state = env.read_hourly_state(&contract);
    assert_eq!(state.approved_seconds, 28_800);
    assert_eq!(env.read_contract(&contract).released_amount, earned(28_800));
}

#[test]
fn dispute_materialization_cannot_exceed_authorized_seconds() {
    // Consuming the last authorized second makes contested == 0, so dispute
    // is rejected after the same cap math as Stop. Stop is the observable
    // authorized-cap proof; dispute of a fully-consumed remainder cannot
    // persist because freeze requires a positive contested amount.
    let (mut env, contract) = offer_active(1, 1_800, 86_400);
    env.start(1).expect("start");
    env.warp(env.now() + 10_000);
    env.stop(1).expect("stop caps at authorized");
    assert_eq!(env.read_hourly_state(&contract).approved_seconds, 1_800);
    assert_eq!(env.read_contract(&contract).released_amount, earned(1_800));
    assert_rejected(
        env.open_dispute(1),
        E_DISPUTE_NOT_ALLOWED,
        "no remainder after authorized cap",
    );
}

#[test]
fn dispute_requires_positive_contested_remainder() {
    let (mut env, _contract) = offer_active(1, 1_800, 86_400);
    env.start(1).expect("start");
    env.warp(env.now() + 10_000);
    // Materializing the full authorized amount leaves contested == 0.
    assert_rejected(
        env.open_dispute(1),
        E_DISPUTE_NOT_ALLOWED,
        "zero contested after full materialize",
    );
}

#[test]
fn trial_release_is_not_hourly_approved_time() {
    let authorized = 3_600u64;
    let trial = 2 * TOKEN;
    let mut env = setup(earned(authorized) + trial);
    env.offer_and_activate(1, authorized, 86_400, trial);
    let contract = env.contract_pda(1);
    assert_eq!(env.read_hourly_state(&contract).approved_seconds, 0);
    assert_eq!(env.read_contract(&contract).released_amount, trial);

    env.start(1).expect("start");
    env.warp(env.now() + 3_600);
    env.stop(1).expect("stop");
    let state = env.read_hourly_state(&contract);
    assert_eq!(state.approved_seconds, 3_600);
    let c = env.read_contract(&contract);
    assert_eq!(c.released_amount, trial + earned(3_600));
}

#[test]
fn start_rejected_before_activation() {
    let main = earned(3_600);
    let mut env = setup(main);
    let args = hourly_args(1, 3_600, 86_400, 0, env.now());
    env.create_hourly(&args).expect("create");
    env.accept(1).expect("accept");
    assert_rejected(env.start(1), E_INVALID_STATE, "start before activation");
}
