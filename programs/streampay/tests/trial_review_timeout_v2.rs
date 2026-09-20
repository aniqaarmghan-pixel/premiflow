//! StreamPay V2 T6: permissionless Submitted trial review timeout.
//!
//! `finalize_trial_review_timeout` reuses T1 settlement after
//! `trial.action_deadline`. Revising is rejected. No SPL transfer.
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
const E_REVIEW_WINDOW_OPEN: u32 = 6132;
const E_APPROVAL_WINDOW_EXPIRED: u32 = 6149;
const E_INVALID_TRIAL_STATE: u32 = 6154;
const E_CONSTRAINT_SEEDS: u32 = 2006;

const MINT_DECIMALS: u8 = 6;
const BASE_TS: i64 = 1_700_000_000;
const TOTAL_AMOUNT: u64 = 1_000_000;
const TRIAL_AMOUNT: u64 = 50_000;
const MAIN_AMOUNT: u64 = 950_000;
const OFFSET: i64 = 600;
const SUBMISSION_URI: &str = "ipfs://bafyTrialTimeout";
const SUBMISSION_HASH: [u8; 32] = [9u8; 32];
const TOKEN: u64 = 1_000_000;
const HOURLY_RATE: u64 = 10 * TOKEN;
const HOURLY_AUTHORIZED: u64 = 10;

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

    fn hourly_state_pda(&self, contract: &Address) -> Address {
        Address::find_program_address(&[b"hourly_state", contract.as_ref()], &self.program_id).0
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

    fn timeout_ix(&self, caller: Address, contract: Address) -> Instruction {
        Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::FinalizeTrialReviewTimeout {
                caller,
                contract,
                trial_work_unit: self.trial_pda(&contract),
            }
            .to_account_metas(None),
            data: streampay_program::instruction::FinalizeTrialReviewTimeout {}.data(),
        }
    }

    fn timeout(&mut self, contract_id: u64) -> TransactionResult {
        let contract = self.contract_pda(contract_id);
        self.send_employer(self.timeout_ix(self.employer_pk, contract))
    }

    fn timeout_as(&mut self, signer: &Keypair, contract_id: u64) -> TransactionResult {
        let contract = self.contract_pda(contract_id);
        self.send(
            self.timeout_ix(signer.pubkey(), contract),
            signer,
        )
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

    fn settle(&mut self, contract_id: u64) -> TransactionResult {
        let contract = self.contract_pda(contract_id);
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::SettleTrialAndEnd {
                employer: self.employer_pk,
                contract,
                trial_work_unit: self.trial_pda(&contract),
            }
            .to_account_metas(None),
            data: streampay_program::instruction::SettleTrialAndEnd {}.data(),
        };
        self.send_employer(ix)
    }

    fn reject(&mut self, contract_id: u64) -> TransactionResult {
        let contract = self.contract_pda(contract_id);
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::RejectActivation {
                employer: self.employer_pk,
                contract,
                trial_work_unit: Some(self.trial_pda(&contract)),
            }
            .to_account_metas(None),
            data: streampay_program::instruction::RejectActivation {}.data(),
        };
        self.send_employer(ix)
    }

    fn expire_activation(&mut self, contract_id: u64) -> TransactionResult {
        let contract = self.contract_pda(contract_id);
        let trial = self.svm.get_account(&self.trial_pda(&contract));
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::ExpireActivation {
                caller: self.employer_pk,
                contract,
                trial_work_unit: trial.map(|_| self.trial_pda(&contract)),
            }
            .to_account_metas(None),
            data: streampay_program::instruction::ExpireActivation {}.data(),
        };
        self.send_employer(ix)
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
                hourly_session: Address::find_program_address(
                    &[
                        b"hourly_session",
                        contract.as_ref(),
                        &state.session_count.to_le_bytes(),
                    ],
                    &self.program_id,
                )
                .0,
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
        metadata_uri: "ipfs://bafyContractMetadata".to_string(),
        metadata_hash: [7u8; 32],
    }
}

fn error_code(failure: &FailedTransactionMetadata) -> u32 {
    match &failure.err {
        TransactionError::InstructionError(_, InstructionError::Custom(code)) => *code,
        other => panic!("unexpected error {other:?}\n{}", failure.meta.logs.join("\n")),
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

fn accepted_submitted_fixed(env: &mut Env, id: u64) {
    env.create(&fixed_args(id, env.now())).unwrap();
    env.accept(id).unwrap();
    env.submit(id).unwrap();
}

fn accepted_submitted_streaming(env: &mut Env, id: u64) {
    env.create(&streaming_args(id, env.now())).unwrap();
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

fn warp_to_trial_deadline(env: &mut Env, id: u64) {
    let trial = env.read_work_unit(&env.trial_pda(&env.contract_pda(id)));
    env.warp(trial.action_deadline);
}

fn assert_t6_freeze(env: &Env, id: u64, expected_main: u64, expected_total: u64) {
    let contract = env.contract_pda(id);
    let c = env.read_contract(&contract);
    let trial = env.read_work_unit(&env.trial_pda(&contract));
    assert_eq!(c.status, ContractStatus::Cancelled);
    assert!(c.status.allows_settlement_claims());
    assert_eq!(c.terminated_at, env.now());
    assert_eq!(c.start_time, 0);
    assert_eq!(c.end_time, 0);
    assert_eq!(c.stream_released_amount, 0);
    assert_eq!(c.released_amount, TRIAL_AMOUNT);
    assert_eq!(c.released_unit_count, 1);
    assert_eq!(c.open_review_count, 0);
    assert_eq!(c.freelancer_settlement_amount, TRIAL_AMOUNT);
    assert_eq!(c.freelancer_settlement_amount, c.released_amount);
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
    assert_eq!(trial.release_trigger, ReleaseTrigger::ReviewTimeout);
    assert_eq!(trial.approved_at, 0);
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
    assert_eq!(
        c.withdrawn_amount + c.refunded_amount + env.escrow_amount(id),
        expected_total
    );
}

#[test]
fn timeout_before_deadline_rejected() {
    let mut env = setup(TOTAL_AMOUNT);
    accepted_submitted_fixed(&mut env, 1);
    let trial = env.read_work_unit(&env.trial_pda(&env.contract_pda(1)));
    env.warp(trial.action_deadline - 1);
    assert_rejected(env.timeout(1), E_REVIEW_WINDOW_OPEN, "before deadline");
}

#[test]
fn timeout_at_exact_deadline_succeeds() {
    let mut env = setup(TOTAL_AMOUNT);
    accepted_submitted_fixed(&mut env, 1);
    let before = env.escrow_amount(1);
    warp_to_trial_deadline(&mut env, 1);
    env.timeout(1).unwrap();
    assert_eq!(env.escrow_amount(1), before);
    assert_t6_freeze(&env, 1, MAIN_AMOUNT, TOTAL_AMOUNT);
}

#[test]
fn timeout_after_deadline_succeeds() {
    let mut env = setup(TOTAL_AMOUNT);
    accepted_submitted_fixed(&mut env, 1);
    let trial = env.read_work_unit(&env.trial_pda(&env.contract_pda(1)));
    env.warp(trial.action_deadline + 1);
    env.timeout(1).unwrap();
    assert_t6_freeze(&env, 1, MAIN_AMOUNT, TOTAL_AMOUNT);
}

#[test]
fn timeout_employer_freelancer_and_third_party() {
    let mut env = setup(TOTAL_AMOUNT * 3);
    accepted_submitted_fixed(&mut env, 1);
    warp_to_trial_deadline(&mut env, 1);
    env.timeout_as(&clone_kp(&env.employer), 1).unwrap();
    assert_eq!(
        env.read_contract(&env.contract_pda(1)).status,
        ContractStatus::Cancelled
    );

    accepted_submitted_fixed(&mut env, 2);
    warp_to_trial_deadline(&mut env, 2);
    env.timeout_as(&clone_kp(&env.freelancer), 2).unwrap();
    assert_eq!(
        env.read_contract(&env.contract_pda(2)).status,
        ContractStatus::Cancelled
    );

    accepted_submitted_fixed(&mut env, 3);
    warp_to_trial_deadline(&mut env, 3);
    let stranger = Keypair::new();
    env.svm.airdrop(&stranger.pubkey(), 1_000_000_000).unwrap();
    env.timeout_as(&stranger, 3).unwrap();
    assert_eq!(
        env.read_contract(&env.contract_pda(3)).status,
        ContractStatus::Cancelled
    );
}

#[test]
fn timeout_defined_and_revising_rejected() {
    let mut env = setup(TOTAL_AMOUNT * 2);
    env.create(&fixed_args(1, env.now())).unwrap();
    env.accept(1).unwrap();
    env.warp(env.now() + 300);
    assert_rejected(env.timeout(1), E_INVALID_TRIAL_STATE, "Defined trial");

    accepted_submitted_fixed(&mut env, 2);
    env.request_revision(2).unwrap();
    let trial = env.read_work_unit(&env.trial_pda(&env.contract_pda(2)));
    assert_eq!(trial.status, WorkUnitStatus::Revising);
    env.warp(trial.action_deadline);
    assert_rejected(env.timeout(2), E_INVALID_TRIAL_STATE, "Revising trial");
}

#[test]
fn timeout_duplicate_rejected() {
    let mut env = setup(TOTAL_AMOUNT);
    accepted_submitted_fixed(&mut env, 1);
    warp_to_trial_deadline(&mut env, 1);
    env.timeout(1).unwrap();
    env.svm.expire_blockhash();
    assert_rejected(env.timeout(1), E_INVALID_STATE, "duplicate timeout");
}

#[test]
fn timeout_fixed_never_starts_main_deliverable() {
    let mut env = setup(TOTAL_AMOUNT);
    accepted_submitted_fixed(&mut env, 1);
    warp_to_trial_deadline(&mut env, 1);
    env.timeout(1).unwrap();
    assert_t6_freeze(&env, 1, MAIN_AMOUNT, TOTAL_AMOUNT);
    let main = env.read_work_unit(&env.work_unit_pda(&env.contract_pda(1), 0));
    assert_eq!(main.kind, WorkUnitKind::Fixed);
    assert_eq!(main.status, WorkUnitStatus::Defined);
    assert_eq!(main.amount, MAIN_AMOUNT);
    assert_rejected(
        env.submit_work(1, 0),
        E_INVALID_STATE,
        "main submit after T6",
    );
}

#[test]
fn timeout_milestone_leaves_stages_unreleased() {
    let mut env = setup(TOTAL_AMOUNT);
    accepted_submitted_milestone(&mut env, 1);
    warp_to_trial_deadline(&mut env, 1);
    env.timeout(1).unwrap();
    assert_t6_freeze(&env, 1, MAIN_AMOUNT, TOTAL_AMOUNT);
    let stage = env.read_work_unit(&env.work_unit_pda(&env.contract_pda(1), 0));
    assert_eq!(stage.kind, WorkUnitKind::Milestone);
    assert_eq!(stage.status, WorkUnitStatus::Defined);
    assert_eq!(stage.amount, MAIN_AMOUNT);
}

#[test]
fn timeout_streaming_does_not_activate_or_accrue() {
    let mut env = setup(TOTAL_AMOUNT);
    accepted_submitted_streaming(&mut env, 1);
    warp_to_trial_deadline(&mut env, 1);
    env.timeout(1).unwrap();
    assert_t6_freeze(&env, 1, MAIN_AMOUNT, TOTAL_AMOUNT);
    env.warp(env.now() + 3_600);
    assert_rejected(
        env.release_stream(1),
        E_INVALID_STATE,
        "stream accrual after T6",
    );
}

#[test]
fn timeout_hourly_does_not_start_session() {
    let mut env = setup(TOTAL_AMOUNT + hourly_main());
    accepted_submitted_hourly(&mut env, 1);
    let expected_total = env.read_contract(&env.contract_pda(1)).total_amount;
    let expected_main = expected_total - TRIAL_AMOUNT;
    warp_to_trial_deadline(&mut env, 1);
    env.timeout(1).unwrap();
    assert_t6_freeze(&env, 1, expected_main, expected_total);
    let state = env.read_hourly_state(&env.contract_pda(1));
    assert_eq!(state.session_count, 0);
    assert_eq!(state.active_session_index, HOURLY_NO_ACTIVE_SESSION);
    assert_rejected(env.start_hourly(1), E_INVALID_STATE, "start after T6");
}

#[test]
fn timeout_collect_and_claim_conserve() {
    let mut env = setup(TOTAL_AMOUNT);
    accepted_submitted_fixed(&mut env, 1);
    let before = env.escrow_amount(1);
    warp_to_trial_deadline(&mut env, 1);
    env.timeout(1).unwrap();
    assert_eq!(env.escrow_amount(1), before);
    claim_and_conserve(&mut env, 1, MAIN_AMOUNT, TOTAL_AMOUNT);
}

#[test]
fn request_trial_revision_rejected_after_activation_deadline() {
    let mut env = setup(TOTAL_AMOUNT);
    let mut args = fixed_args(1, env.now());
    args.activation_review_duration = 60;
    args.review_duration = 300;
    env.create(&args).unwrap();
    env.accept(1).unwrap();
    env.submit(1).unwrap();
    let c = env.read_contract(&env.contract_pda(1));
    let trial = env.read_work_unit(&env.trial_pda(&env.contract_pda(1)));
    assert!(trial.action_deadline > c.accepted_at + c.activation_review_duration);
    env.warp(c.accepted_at + c.activation_review_duration);
    assert_rejected(
        env.request_revision(1),
        E_APPROVAL_WINDOW_EXPIRED,
        "revision after activation window",
    );
    assert_eq!(
        env.read_work_unit(&env.trial_pda(&env.contract_pda(1))).status,
        WorkUnitStatus::Submitted
    );
}

#[test]
fn t1_settle_still_works_before_timeout() {
    let mut env = setup(TOTAL_AMOUNT);
    accepted_submitted_fixed(&mut env, 1);
    env.settle(1).unwrap();
    let c = env.read_contract(&env.contract_pda(1));
    let trial = env.read_work_unit(&env.trial_pda(&env.contract_pda(1)));
    assert_eq!(c.status, ContractStatus::Cancelled);
    assert_eq!(trial.release_trigger, ReleaseTrigger::EmployerApproval);
    assert_eq!(c.freelancer_settlement_amount, TRIAL_AMOUNT);
}

#[test]
fn t2_defined_reject_still_activation_rejected() {
    let mut env = setup(TOTAL_AMOUNT);
    env.create(&fixed_args(1, env.now())).unwrap();
    env.accept(1).unwrap();
    env.reject(1).unwrap();
    let c = env.read_contract(&env.contract_pda(1));
    assert_eq!(c.status, ContractStatus::ActivationRejected);
    assert_eq!(c.freelancer_settlement_amount, 0);
    assert_eq!(c.employer_refundable_amount, TOTAL_AMOUNT);
}

#[test]
fn t3_decline_still_full_refund() {
    let mut env = setup(TOTAL_AMOUNT);
    env.create(&fixed_args(1, env.now())).unwrap();
    env.decline(1).unwrap();
    let c = env.read_contract(&env.contract_pda(1));
    assert_eq!(c.status, ContractStatus::Declined);
    assert_eq!(c.freelancer_settlement_amount, 0);
    assert_eq!(c.employer_refundable_amount, TOTAL_AMOUNT);
}

#[test]
fn t4_expire_still_rejects_submitted_and_closes_defined() {
    let mut env = setup(TOTAL_AMOUNT * 2);
    accepted_submitted_fixed(&mut env, 1);
    let c = env.read_contract(&env.contract_pda(1));
    env.warp(c.accepted_at + c.activation_review_duration);
    assert_rejected(
        env.expire_activation(1),
        E_INVALID_TRIAL_STATE,
        "T4 on Submitted",
    );

    env.create(&fixed_args(2, env.now())).unwrap();
    env.accept(2).unwrap();
    let defined = env.read_contract(&env.contract_pda(2));
    env.warp(defined.accepted_at + defined.activation_review_duration);
    env.expire_activation(2).unwrap();
    let after = env.read_contract(&env.contract_pda(2));
    assert_eq!(after.status, ContractStatus::ActivationRejected);
    assert_eq!(after.employer_refundable_amount, TOTAL_AMOUNT);
}

#[test]
fn timeout_wrong_pda_rejected() {
    let mut env = setup(TOTAL_AMOUNT);
    accepted_submitted_fixed(&mut env, 1);
    warp_to_trial_deadline(&mut env, 1);
    let contract = env.contract_pda(1);
    let ix = Instruction {
        program_id: env.program_id,
        accounts: streampay_program::accounts::FinalizeTrialReviewTimeout {
            caller: env.employer_pk,
            contract,
            trial_work_unit: env.work_unit_pda(&contract, 0),
        }
        .to_account_metas(None),
        data: streampay_program::instruction::FinalizeTrialReviewTimeout {}.data(),
    };
    assert_rejected(
        env.send_employer(ix),
        E_CONSTRAINT_SEEDS,
        "main work unit as trial",
    );
}

#[test]
fn timeout_does_not_set_disputed_or_resolver_fields() {
    let mut env = setup(TOTAL_AMOUNT);
    accepted_submitted_fixed(&mut env, 1);
    warp_to_trial_deadline(&mut env, 1);
    env.timeout(1).unwrap();
    let c = env.read_contract(&env.contract_pda(1));
    assert_eq!(c.status, ContractStatus::Cancelled);
    assert_eq!(c.contested_amount, 0);
    assert_eq!(c.disputed_at, 0);
}
