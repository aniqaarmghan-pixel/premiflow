//! StreamPay V2 T1: pay submitted trial and end without activating.
//!
//! `settle_trial_and_end` releases the trial, freezes Cancelled settlement,
//! and never starts the main engagement. No SPL transfer. Not a dispute.
//!
//! Rebuild `target/deploy/streampay.so` after program changes.

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
    CreateContractArgs, CreateHourlyContractArgs, HourlyState, PaymentMode, ReleaseTrigger,
    StartMode, WorkUnit, WorkUnitKind, WorkUnitStatus, HOURLY_NO_ACTIVE_SESSION,
};

const E_INVALID_STATE: u32 = 6111;
const E_CONTRACT_TERMINAL: u32 = 6113;
const E_INVALID_TRIAL_STATE: u32 = 6154;
const E_NOTHING_TO_WITHDRAW: u32 = 6139;
const E_NOTHING_TO_REFUND: u32 = 6140;
const E_CONSTRAINT_SEEDS: u32 = 2006;
const E_ACCOUNT_NOT_INITIALIZED: u32 = 3012;

const MINT_DECIMALS: u8 = 6;
const BASE_TS: i64 = 1_700_000_000;
const TOTAL_AMOUNT: u64 = 1_000_000;
const TRIAL_AMOUNT: u64 = 50_000;
const MAIN_AMOUNT: u64 = 950_000;
const OFFSET: i64 = 600;
const SUBMISSION_URI: &str = "ipfs://bafyTrialSettle";
const SUBMISSION_HASH: [u8; 32] = [9u8; 32];
const TOKEN: u64 = 1_000_000;
const HOURLY_RATE: u64 = 10 * TOKEN;
const HOURLY_AUTHORIZED: u64 = 10;
const WORK_UNIT_STATUS_OFFSET: usize = 8 + 1 + 32 + 4 + 1;

fn clone_kp(kp: &Keypair) -> Keypair {
    kp.insecure_clone()
}

fn hourly_main() -> u64 {
    canonical_hourly_earned(HOURLY_RATE, HOURLY_AUTHORIZED).unwrap()
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
    let freelancer_token_account = CreateAccount::new(&mut svm, &freelancer, &token_mint)
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

    fn hourly_state_pda(&self, contract: &Address) -> Address {
        Address::find_program_address(&[b"hourly_state", contract.as_ref()], &self.program_id).0
    }

    fn hourly_session_pda(&self, contract: &Address, index: u32) -> Address {
        Address::find_program_address(
            &[b"hourly_session", contract.as_ref(), &index.to_le_bytes()],
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

    fn submit(&mut self, contract_id: u64) -> TransactionResult {
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

    fn reject(&mut self, contract_id: u64) -> TransactionResult {
        self.reject_as(
            &clone_kp(&self.employer),
            self.employer_pk,
            self.contract_pda(contract_id),
            Some(self.trial_pda(&self.contract_pda(contract_id))),
        )
    }

    fn reject_no_trial(&mut self, contract_id: u64) -> TransactionResult {
        self.reject_as(
            &clone_kp(&self.employer),
            self.employer_pk,
            self.contract_pda(contract_id),
            None,
        )
    }

    fn reject_as(
        &mut self,
        signer: &Keypair,
        employer: Address,
        contract: Address,
        trial_work_unit: Option<Address>,
    ) -> TransactionResult {
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::RejectActivation {
                employer,
                contract,
                trial_work_unit,
            }
            .to_account_metas(None),
            data: streampay_program::instruction::RejectActivation {}.data(),
        };
        self.send(ix, signer)
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

    fn settle(&mut self, contract_id: u64) -> TransactionResult {
        self.settle_as(
            &clone_kp(&self.employer),
            self.employer_pk,
            self.contract_pda(contract_id),
            self.trial_pda(&self.contract_pda(contract_id)),
        )
    }

    fn settle_as(
        &mut self,
        signer: &Keypair,
        employer: Address,
        contract: Address,
        trial_work_unit: Address,
    ) -> TransactionResult {
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::SettleTrialAndEnd {
                employer,
                contract,
                trial_work_unit,
            }
            .to_account_metas(None),
            data: streampay_program::instruction::SettleTrialAndEnd {}.data(),
        };
        self.send(ix, signer)
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

    fn start_hourly(&mut self, contract_id: u64) -> TransactionResult {
        let contract = self.contract_pda(contract_id);
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

    fn withdraw(&mut self, contract_id: u64) -> TransactionResult {
        let contract = self.contract_pda(contract_id);
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

    fn refund(&mut self, contract_id: u64) -> TransactionResult {
        let contract = self.contract_pda(contract_id);
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

    fn read_hourly_state(&self, contract: &Address) -> HourlyState {
        let account = self
            .svm
            .get_account(&self.hourly_state_pda(contract))
            .expect("hourly state missing");
        let mut data: &[u8] = &account.data;
        HourlyState::try_deserialize(&mut data).expect("deserialize hourly state")
    }

    fn set_trial_status(&mut self, contract_id: u64, status: u8) {
        let trial = self.trial_pda(&self.contract_pda(contract_id));
        let mut acc = self.svm.get_account(&trial).expect("trial missing");
        acc.data[WORK_UNIT_STATUS_OFFSET] = status;
        self.svm.set_account(trial, acc).expect("set trial status");
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
        trial_amount: TRIAL_AMOUNT,
        resolver: Pubkey::new_from_array([0x11; 32]),
        metadata_uri: "ipfs://bafyContractMetadata".to_string(),
        metadata_hash: [7u8; 32],
    }
}

fn fixed_args(contract_id: u64, now: i64) -> CreateContractArgs {
    CreateContractArgs {
        payment_mode: PaymentMode::Fixed,
        checkpoint_interval: 0,
        duration_seconds: 3_600,
        review_duration: 300,
        ..streaming_args(contract_id, now)
    }
}

fn milestone_args(contract_id: u64, now: i64) -> CreateContractArgs {
    CreateContractArgs {
        payment_mode: PaymentMode::Milestone,
        checkpoint_interval: 0,
        duration_seconds: 3_600,
        review_duration: 300,
        ..streaming_args(contract_id, now)
    }
}

fn hourly_args(contract_id: u64, now: i64) -> CreateHourlyContractArgs {
    CreateHourlyContractArgs {
        contract_id,
        hourly_rate: HOURLY_RATE,
        authorized_seconds: HOURLY_AUTHORIZED,
        acceptance_deadline: now + 3_600,
        duration_seconds: 86_400,
        review_duration: 300,
        activation_review_duration: 3_600,
        max_revisions: 2,
        trial_amount: TRIAL_AMOUNT,
        resolver: Pubkey::new_from_array([0x11; 32]),
        metadata_uri: "ipfs://bafyHourlyMeta".to_string(),
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

fn accepted_submitted_streaming(env: &mut Env, id: u64) {
    env.create(&streaming_args(id, env.now())).unwrap();
    env.accept(id).unwrap();
    env.submit(id).unwrap();
}

fn accepted_submitted_fixed(env: &mut Env, id: u64) {
    env.create(&fixed_args(id, env.now())).unwrap();
    env.accept(id).unwrap();
    env.submit(id).unwrap();
}

fn accepted_submitted_milestone(env: &mut Env, id: u64) {
    env.create(&milestone_args(id, env.now())).unwrap();
    env.add_milestone(id, MAIN_AMOUNT, OFFSET).unwrap();
    env.finalize_terms(id).unwrap();
    env.accept(id).unwrap();
    env.submit(id).unwrap();
}

fn accepted_submitted_hourly(env: &mut Env, id: u64) {
    env.create_hourly(&hourly_args(id, env.now())).unwrap();
    env.accept(id).unwrap();
    env.submit(id).unwrap();
}

fn assert_peaceful_exit(env: &Env, id: u64, expected_main: u64, expected_total: u64) {
    let contract = env.contract_pda(id);
    let c = env.read_contract(&contract);
    let trial = env.read_work_unit(&env.trial_pda(&contract));
    assert_eq!(c.status, ContractStatus::Cancelled);
    assert_eq!(c.terminated_at, env.now());
    assert_eq!(c.start_time, 0);
    assert_eq!(c.end_time, 0);
    assert_eq!(c.stream_released_amount, 0);
    assert_eq!(c.released_amount, TRIAL_AMOUNT);
    assert_eq!(c.released_unit_count, 1);
    assert_eq!(c.open_review_count, 0);
    assert_eq!(c.freelancer_settlement_amount, TRIAL_AMOUNT);
    assert_eq!(c.employer_refundable_amount, expected_main);
    assert_eq!(c.contested_amount, 0);
    assert_eq!(
        c.freelancer_settlement_amount + c.employer_refundable_amount,
        expected_total
    );
    assert_eq!(c.withdrawn_amount, 0);
    assert_eq!(c.refunded_amount, 0);
    assert_eq!(env.escrow_amount(id), expected_total);
    assert_eq!(trial.kind, WorkUnitKind::Trial);
    assert_eq!(trial.status, WorkUnitStatus::Released);
    assert_eq!(trial.amount, TRIAL_AMOUNT);
    assert_eq!(trial.release_trigger, ReleaseTrigger::EmployerApproval);
    assert_eq!(trial.approved_at, env.now());
    assert_eq!(trial.released_at, env.now());
}

fn claim_and_conserve(env: &mut Env, id: u64, expected_main: u64, expected_total: u64) {
    let employer_before = env.token_balance(&env.employer_token_account);
    env.withdraw(id).unwrap();
    env.refund(id).unwrap();
    let c = env.read_contract(&env.contract_pda(id));
    assert_eq!(c.withdrawn_amount, TRIAL_AMOUNT);
    assert_eq!(c.refunded_amount, expected_main);
    assert_eq!(env.escrow_amount(id), 0);
    assert_eq!(env.token_balance(&env.freelancer_token_account), TRIAL_AMOUNT);
    assert_eq!(
        env.token_balance(&env.employer_token_account),
        employer_before + expected_main
    );
    assert_eq!(c.withdrawn_amount + c.refunded_amount + env.escrow_amount(id), expected_total);
}

#[test]
fn settle_submitted_trial_fixed_pays_trial_and_refunds_main() {
    let mut env = setup(TOTAL_AMOUNT);
    accepted_submitted_fixed(&mut env, 1);
    let before = env.escrow_amount(1);
    env.settle(1).unwrap();
    assert_eq!(env.escrow_amount(1), before);
    assert_peaceful_exit(&env, 1, MAIN_AMOUNT, TOTAL_AMOUNT);
    let main = env.read_work_unit(&env.work_unit_pda(&env.contract_pda(1), 0));
    assert_eq!(main.status, WorkUnitStatus::Defined);
    assert_rejected(
        env.submit_work(1, 0),
        E_INVALID_STATE,
        "main Fixed cannot be submitted after trial exit",
    );
    claim_and_conserve(&mut env, 1, MAIN_AMOUNT, TOTAL_AMOUNT);
}

#[test]
fn settle_submitted_trial_milestone_leaves_stages_unreleased() {
    let mut env = setup(TOTAL_AMOUNT);
    accepted_submitted_milestone(&mut env, 1);
    env.settle(1).unwrap();
    assert_peaceful_exit(&env, 1, MAIN_AMOUNT, TOTAL_AMOUNT);
    let stage = env.read_work_unit(&env.work_unit_pda(&env.contract_pda(1), 0));
    assert_eq!(stage.kind, WorkUnitKind::Milestone);
    assert_eq!(stage.status, WorkUnitStatus::Defined);
    assert_eq!(stage.amount, MAIN_AMOUNT);
    assert_rejected(
        env.submit_work(1, 0),
        E_INVALID_STATE,
        "milestone cannot progress after trial exit",
    );
    claim_and_conserve(&mut env, 1, MAIN_AMOUNT, TOTAL_AMOUNT);
}

#[test]
fn settle_submitted_trial_streaming_does_not_activate_or_accrue() {
    let mut env = setup(TOTAL_AMOUNT);
    accepted_submitted_streaming(&mut env, 1);
    env.settle(1).unwrap();
    assert_peaceful_exit(&env, 1, MAIN_AMOUNT, TOTAL_AMOUNT);
    let c = env.read_contract(&env.contract_pda(1));
    assert_eq!(c.payment_mode, PaymentMode::Streaming);
    assert_eq!(c.start_time, 0);
    assert_eq!(c.stream_released_amount, 0);
    assert_rejected(
        env.release_stream(1),
        E_INVALID_STATE,
        "stream accrual after trial exit",
    );
    claim_and_conserve(&mut env, 1, MAIN_AMOUNT, TOTAL_AMOUNT);
}

#[test]
fn settle_submitted_trial_hourly_does_not_start_session() {
    let funded = hourly_main() + TRIAL_AMOUNT;
    let mut env = setup(funded);
    accepted_submitted_hourly(&mut env, 1);
    env.settle(1).unwrap();
    assert_peaceful_exit(&env, 1, hourly_main(), funded);
    let state = env.read_hourly_state(&env.contract_pda(1));
    assert!(!state.has_active_session());
    assert_eq!(state.session_count, 0);
    assert_eq!(state.active_session_index, HOURLY_NO_ACTIVE_SESSION);
    assert_eq!(state.approved_seconds, 0);
    assert_rejected(
        env.start_hourly(1),
        E_INVALID_STATE,
        "start_hourly_session after trial exit",
    );
    claim_and_conserve(&mut env, 1, hourly_main(), funded);
}

#[test]
fn settle_rejects_wrong_signer_and_invalid_trial_account() {
    let mut env = setup(TOTAL_AMOUNT * 2);
    accepted_submitted_streaming(&mut env, 1);
    accepted_submitted_streaming(&mut env, 2);
    let contract = env.contract_pda(1);
    let trial = env.trial_pda(&contract);
    let freelancer = clone_kp(&env.freelancer);
    assert_rejected(
        env.settle_as(&freelancer, env.freelancer_pk, contract, trial),
        E_CONSTRAINT_SEEDS,
        "freelancer settling trial",
    );
    let attacker = Keypair::new();
    env.svm.airdrop(&attacker.pubkey(), 1_000_000_000).unwrap();
    assert_rejected(
        env.settle_as(&attacker, attacker.pubkey(), contract, trial),
        E_CONSTRAINT_SEEDS,
        "third party settling trial",
    );
    assert_rejected(
        env.settle_as(
            &clone_kp(&env.employer),
            env.employer_pk,
            contract,
            env.trial_pda(&env.contract_pda(2)),
        ),
        E_CONSTRAINT_SEEDS,
        "wrong trial account",
    );
}

#[test]
fn settle_rejects_defined_revising_released_and_void_trial() {
    let mut env = setup(TOTAL_AMOUNT * 4);
    env.create(&streaming_args(1, env.now())).unwrap();
    env.accept(1).unwrap();
    assert_rejected(env.settle(1), E_INVALID_TRIAL_STATE, "Defined trial");

    accepted_submitted_streaming(&mut env, 2);
    env.request_revision(2).unwrap();
    assert_eq!(
        env.read_work_unit(&env.trial_pda(&env.contract_pda(2)))
            .status,
        WorkUnitStatus::Revising
    );
    assert_rejected(env.settle(2), E_INVALID_TRIAL_STATE, "Revising trial");

    accepted_submitted_streaming(&mut env, 3);
    env.set_trial_status(3, 3);
    assert_rejected(env.settle(3), E_INVALID_TRIAL_STATE, "Released trial");

    accepted_submitted_streaming(&mut env, 4);
    env.set_trial_status(4, 4);
    assert_rejected(env.settle(4), E_INVALID_TRIAL_STATE, "Void trial");
}

#[test]
fn settle_rejects_active_disputed_duplicate_and_no_trial() {
    let mut env = setup(TOTAL_AMOUNT * 4);
    accepted_submitted_streaming(&mut env, 1);
    env.approve_trial(1).unwrap();
    assert_eq!(
        env.read_contract(&env.contract_pda(1)).status,
        ContractStatus::Active
    );
    assert_rejected(env.settle(1), E_INVALID_STATE, "Active contract");

    accepted_submitted_streaming(&mut env, 2);
    env.reject(2).unwrap();
    assert_eq!(
        env.read_contract(&env.contract_pda(2)).status,
        ContractStatus::Disputed
    );
    assert_rejected(env.settle(2), E_INVALID_STATE, "Disputed contract");

    accepted_submitted_streaming(&mut env, 3);
    env.settle(3).unwrap();
    env.svm.expire_blockhash();
    assert_rejected(env.settle(3), E_INVALID_STATE, "duplicate settle");

    let mut args = streaming_args(4, env.now());
    args.trial_amount = 0;
    env.create(&args).unwrap();
    env.accept(4).unwrap();
    assert_rejected(
        env.settle(4),
        E_ACCOUNT_NOT_INITIALIZED,
        "no trial account",
    );
}

#[test]
fn approve_trial_and_activate_still_activates() {
    let mut env = setup(TOTAL_AMOUNT);
    accepted_submitted_streaming(&mut env, 1);
    env.approve_trial(1).unwrap();
    let c = env.read_contract(&env.contract_pda(1));
    assert_eq!(c.status, ContractStatus::Active);
    assert!(c.start_time > 0);
    assert_eq!(c.released_amount, TRIAL_AMOUNT);
    assert_eq!(c.freelancer_settlement_amount, 0);
    assert_eq!(c.employer_refundable_amount, 0);
    assert_eq!(
        env.read_work_unit(&env.trial_pda(&env.contract_pda(1)))
            .status,
        WorkUnitStatus::Released
    );
}

#[test]
fn reject_activation_submitted_still_disputes() {
    let mut env = setup(TOTAL_AMOUNT);
    accepted_submitted_streaming(&mut env, 1);
    env.reject(1).unwrap();
    let c = env.read_contract(&env.contract_pda(1));
    assert_eq!(c.status, ContractStatus::Disputed);
    assert_eq!(c.released_amount, 0);
    assert_eq!(c.contested_amount, TOTAL_AMOUNT);
    assert_eq!(
        env.read_work_unit(&env.trial_pda(&env.contract_pda(1)))
            .status,
        WorkUnitStatus::Submitted
    );
}

#[test]
fn request_revision_behavior_unchanged() {
    let mut env = setup(TOTAL_AMOUNT);
    accepted_submitted_streaming(&mut env, 1);
    env.request_revision(1).unwrap();
    let trial = env.read_work_unit(&env.trial_pda(&env.contract_pda(1)));
    assert_eq!(trial.status, WorkUnitStatus::Revising);
    assert_eq!(
        env.read_contract(&env.contract_pda(1)).status,
        ContractStatus::PendingEmployerApproval
    );
    env.svm.expire_blockhash();
    env.submit(1).unwrap();
    assert_eq!(
        env.read_work_unit(&env.trial_pda(&env.contract_pda(1)))
            .status,
        WorkUnitStatus::Submitted
    );
    env.settle(1).unwrap();
    assert_eq!(
        env.read_contract(&env.contract_pda(1)).status,
        ContractStatus::Cancelled
    );
}
