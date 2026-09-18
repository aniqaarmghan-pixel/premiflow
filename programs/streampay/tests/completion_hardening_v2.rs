//! StreamPay V2 Phase 10 tests: successful completion and terminal freeze.
//!
//! Completion moves zero SPL tokens. Phase 8 claims the frozen settlement.

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
const E_INVALID_PAYMENT_MODE: u32 = 6110;
const E_CONTRACT_TERMINAL: u32 = 6113;
const E_NOTHING_TO_WITHDRAW: u32 = 6139;
const E_NOTHING_TO_REFUND: u32 = 6140;
const E_ALREADY_DISPUTED: u32 = 6160;
const E_COMPLETION_NOT_ALLOWED: u32 = 6162;
const E_UNRESOLVED_WORK: u32 = 6163;
const E_NOT_READY: u32 = 6164;
const E_ALREADY_COMPLETED: u32 = 6165;

const MINT_DECIMALS: u8 = 6;
const BASE_TS: i64 = 1_700_000_000;
const TOTAL_AMOUNT: u64 = 1_000_000;
const TRIAL_AMOUNT: u64 = 50_000;
const MAIN_AMOUNT: u64 = 950_000;
const DURATION: i64 = 60;
const INTERVAL: i64 = 20;
const REVIEW: i64 = 10;
const OFFSET: i64 = 30;
const SUBMISSION_URI: &str = "ipfs://bafyCompleteWork";
const SUBMISSION_HASH: [u8; 32] = [17u8; 32];

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
    resolver: Keypair,
    resolver_pk: Address,
    outsider: Keypair,
    outsider_pk: Address,
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
    let resolver = Keypair::new();
    let outsider = Keypair::new();
    let employer_pk = employer.pubkey();
    let freelancer_pk = freelancer.pubkey();
    let resolver_pk = resolver.pubkey();
    let outsider_pk = outsider.pubkey();
    svm.airdrop(&employer_pk, 10_000_000_000).unwrap();
    svm.airdrop(&freelancer_pk, 1_000_000_000).unwrap();
    svm.airdrop(&resolver_pk, 1_000_000_000).unwrap();
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
        resolver,
        resolver_pk,
        outsider,
        outsider_pk,
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

    fn send_outsider(&mut self, instruction: Instruction) -> TransactionResult {
        self.send(instruction, &clone_kp(&self.outsider))
    }

    fn send_resolver(&mut self, instruction: Instruction) -> TransactionResult {
        self.send(instruction, &clone_kp(&self.resolver))
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

    fn reject_activation(&mut self, contract_id: u64, with_trial: bool) -> TransactionResult {
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
        self.send_outsider(ix)
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

    fn cancel(&mut self, contract_id: u64) -> TransactionResult {
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::CancelActiveContract {
                employer: self.employer_pk,
                contract: self.contract_pda(contract_id),
            }
            .to_account_metas(None),
            data: streampay_program::instruction::CancelActiveContract {}.data(),
        };
        self.send_employer(ix)
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

    fn open_dispute(&mut self, contract_id: u64) -> TransactionResult {
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::OpenDispute {
                party: self.employer_pk,
                contract: self.contract_pda(contract_id),
            }
            .to_account_metas(None),
            data: streampay_program::instruction::OpenDispute {}.data(),
        };
        self.send_employer(ix)
    }

    fn resolve(&mut self, contract_id: u64, award: u64) -> TransactionResult {
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::ResolveDispute {
                resolver: self.resolver_pk,
                contract: self.contract_pda(contract_id),
            }
            .to_account_metas(None),
            data: streampay_program::instruction::ResolveDispute {
                freelancer_contested_award: award,
            }
            .data(),
        };
        self.send_resolver(ix)
    }

    fn complete_ix(&self, caller: Address, contract: Address) -> Instruction {
        Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::CompleteContract { caller, contract }
                .to_account_metas(None),
            data: streampay_program::instruction::CompleteContract {}.data(),
        }
    }

    fn complete(&mut self, contract_id: u64) -> TransactionResult {
        let ix = self.complete_ix(self.outsider_pk, self.contract_pda(contract_id));
        self.send_outsider(ix)
    }

    fn read_contract(&self, contract: &Address) -> Contract {
        let account = self.svm.get_account(contract).expect("contract missing");
        let mut data: &[u8] = &account.data;
        Contract::try_deserialize(&mut data).expect("deserialize contract")
    }

    fn assert_completed_full(&self, contract_id: u64, total: u64) {
        let c = self.read_contract(&self.contract_pda(contract_id));
        assert_eq!(c.status, ContractStatus::Completed);
        assert_eq!(c.freelancer_settlement_amount, total);
        assert_eq!(c.employer_refundable_amount, 0);
        assert_eq!(c.released_amount, total);
        assert_eq!(
            c.freelancer_settlement_amount + c.employer_refundable_amount,
            c.total_amount
        );
        assert!(c.withdrawn_amount <= c.released_amount);
        assert!(c.withdrawn_amount <= c.freelancer_settlement_amount);
        assert!(c.refunded_amount <= c.employer_refundable_amount);
        assert_eq!(c.refunded_amount, 0);
        assert!(c.completed_at > 0);
    }
}

fn streaming_args(env: &Env, contract_id: u64, total_amount: u64, now: i64) -> CreateContractArgs {
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
        resolver: env.resolver_pk,
        metadata_uri: "ipfs://bafyContractMetadata".to_string(),
        metadata_hash: [7u8; 32],
    }
}

fn fixed_args(env: &Env, contract_id: u64, total_amount: u64, now: i64) -> CreateContractArgs {
    CreateContractArgs {
        payment_mode: PaymentMode::Fixed,
        checkpoint_interval: 12_345,
        duration_seconds: 3_600,
        review_duration: 300,
        ..streaming_args(env, contract_id, total_amount, now)
    }
}

fn milestone_args(env: &Env, contract_id: u64, total_amount: u64, now: i64) -> CreateContractArgs {
    CreateContractArgs {
        payment_mode: PaymentMode::Milestone,
        checkpoint_interval: 12_345,
        duration_seconds: 3_600,
        review_duration: 300,
        ..streaming_args(env, contract_id, total_amount, now)
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

fn activate_streaming(env: &mut Env, id: u64, total: u64) -> i64 {
    let args = streaming_args(env, id, total, env.now());
    env.create(&args).unwrap();
    env.accept(id).unwrap();
    env.approve_activation(id).unwrap();
    env.read_contract(&env.contract_pda(id)).start_time
}

fn activate_fixed(env: &mut Env, id: u64, total: u64, trial: u64) {
    let mut args = fixed_args(env, id, total, env.now());
    args.trial_amount = trial;
    env.create(&args).unwrap();
    env.accept(id).unwrap();
    if trial > 0 {
        env.submit_trial(id).unwrap();
        env.approve_trial(id).unwrap();
    } else {
        env.approve_activation(id).unwrap();
    }
}

fn activate_milestone(env: &mut Env, id: u64, amounts: &[u64], trial: u64) {
    let main: u64 = amounts.iter().sum();
    let total = main + trial;
    let mut args = milestone_args(env, id, total, env.now());
    args.trial_amount = trial;
    env.create(&args).unwrap();
    let mut offset = OFFSET;
    for amount in amounts {
        env.add_milestone(id, *amount, offset).unwrap();
        offset += OFFSET;
    }
    env.finalize_terms(id).unwrap();
    env.accept(id).unwrap();
    if trial > 0 {
        env.submit_trial(id).unwrap();
        env.approve_trial(id).unwrap();
    } else {
        env.approve_activation(id).unwrap();
    }
}

#[test]
fn streaming_completion_respects_end_time_and_caps_accrual() {
    let mut env = setup(10);
    let start = activate_streaming(&mut env, 1, 10);
    let end = start + DURATION;

    env.warp(end - 1);
    let before = env.read_contract(&env.contract_pda(1));
    let escrow = env.escrow_amount(1);
    assert_rejected(env.complete(1), E_NOT_READY, "before end_time");
    let after_fail = env.read_contract(&env.contract_pda(1));
    assert_eq!(after_fail.status, before.status);
    assert_eq!(after_fail.released_amount, before.released_amount);
    assert_eq!(env.escrow_amount(1), escrow);

    env.warp(end);
    env.complete(1).unwrap();
    let c = env.read_contract(&env.contract_pda(1));
    assert_eq!(c.stream_released_amount, 10);
    assert_eq!(c.released_amount, 10);
    env.assert_completed_full(1, 10);
    assert_eq!(env.escrow_amount(1), escrow);

    assert_rejected(env.complete(1), E_ALREADY_COMPLETED, "second complete");
    assert_rejected(
        env.release_stream(1),
        E_INVALID_STATE,
        "stream after complete",
    );
}

#[test]
fn streaming_after_end_does_not_over_accrue_and_materializes_delta() {
    let mut env = setup(20);
    let start = activate_streaming(&mut env, 1, 10);
    env.warp(start + 20);
    env.release_stream(1).unwrap();
    assert_eq!(
        env.read_contract(&env.contract_pda(1))
            .stream_released_amount,
        3
    );

    env.warp(start + DURATION + 10_000);
    let escrow = env.escrow_amount(1);
    env.complete(1).unwrap();
    let c = env.read_contract(&env.contract_pda(1));
    assert_eq!(c.stream_released_amount, 10);
    assert_eq!(c.released_amount, 10);
    assert_eq!(env.escrow_amount(1), escrow);

    let start2 = activate_streaming(&mut env, 2, 10);
    env.warp(start2 + DURATION);
    env.complete(2).unwrap();
    env.assert_completed_full(2, 10);
}

#[test]
fn streaming_trial_completion_and_phase_eight_claims() {
    let mut env = setup(TOTAL_AMOUNT);
    let mut args = streaming_args(&env, 1, TOTAL_AMOUNT, env.now());
    args.trial_amount = TRIAL_AMOUNT;
    env.create(&args).unwrap();
    env.accept(1).unwrap();
    env.submit_trial(1).unwrap();
    env.approve_trial(1).unwrap();
    env.withdraw(1).unwrap();
    let start = env.read_contract(&env.contract_pda(1)).start_time;
    env.warp(start + DURATION);
    env.complete(1).unwrap();
    let c = env.read_contract(&env.contract_pda(1));
    assert_eq!(c.stream_released_amount, MAIN_AMOUNT);
    assert_eq!(c.released_amount, TOTAL_AMOUNT);
    assert_eq!(c.withdrawn_amount, TRIAL_AMOUNT);
    env.assert_completed_full(1, TOTAL_AMOUNT);

    env.withdraw(1).unwrap();
    assert_rejected(env.refund(1), E_NOTHING_TO_REFUND, "no employer remainder");
    assert_rejected(env.withdraw(1), E_NOTHING_TO_WITHDRAW, "double withdraw");
    let done = env.read_contract(&env.contract_pda(1));
    assert_eq!(done.withdrawn_amount, TOTAL_AMOUNT);
    assert_eq!(done.refunded_amount, 0);
    assert_eq!(env.escrow_amount(1), 0);
}

#[test]
fn scheduled_streaming_respects_start_and_end() {
    let mut env = setup(10);
    let now = env.now();
    let mut args = streaming_args(&env, 1, 10, now);
    args.start_mode = StartMode::Scheduled;
    args.acceptance_deadline = now + 100;
    args.scheduled_start_time = now + 100;
    env.create(&args).unwrap();
    env.accept(1).unwrap();
    env.approve_activation(1).unwrap();
    let c = env.read_contract(&env.contract_pda(1));
    let start = c.start_time;
    let end = c.end_time;
    assert_eq!(start, now + 100);
    assert_eq!(end, start + DURATION);

    env.warp(start - 1);
    assert_rejected(env.complete(1), E_NOT_READY, "before scheduled start");
    env.warp(start);
    assert_rejected(env.complete(1), E_NOT_READY, "at start not end");
    env.warp(end);
    env.complete(1).unwrap();
    env.assert_completed_full(1, 10);
}

#[test]
fn fixed_completion_requires_released_work_and_does_not_double() {
    let mut env = setup(TOTAL_AMOUNT * 3);
    activate_fixed(&mut env, 1, TOTAL_AMOUNT, 0);
    assert_rejected(env.complete(1), E_UNRESOLVED_WORK, "unsubmitted fixed");
    env.submit_work(1, 0).unwrap();
    let submitted = env.read_contract(&env.contract_pda(1));
    assert_rejected(env.complete(1), E_UNRESOLVED_WORK, "submitted fixed");
    assert_eq!(
        env.read_contract(&env.contract_pda(1)).released_amount,
        submitted.released_amount
    );

    env.request_revision(1, 0).unwrap();
    assert_rejected(env.complete(1), E_UNRESOLVED_WORK, "revising fixed");
    env.submit_work(1, 0).unwrap();
    env.approve_work(1, 0).unwrap();
    let escrow = env.escrow_amount(1);
    env.complete(1).unwrap();
    env.assert_completed_full(1, TOTAL_AMOUNT);
    assert_eq!(env.escrow_amount(1), escrow);
    assert_rejected(env.approve_work(1, 0), E_INVALID_STATE, "approve after");
    env.withdraw(1).unwrap();
    assert_eq!(env.escrow_amount(1), 0);

    activate_fixed(&mut env, 2, TOTAL_AMOUNT, 0);
    env.submit_work(2, 0).unwrap();
    env.warp(env.now() + 300);
    env.timeout(2, 0).unwrap();
    env.complete(2).unwrap();
    env.assert_completed_full(2, TOTAL_AMOUNT);

    activate_fixed(&mut env, 3, TOTAL_AMOUNT, TRIAL_AMOUNT);
    env.submit_work(3, 0).unwrap();
    env.approve_work(3, 0).unwrap();
    env.complete(3).unwrap();
    let t = env.read_contract(&env.contract_pda(3));
    assert_eq!(t.released_amount, TOTAL_AMOUNT);
    assert_eq!(t.freelancer_settlement_amount, TOTAL_AMOUNT);
}

#[test]
fn milestone_completion_requires_every_unit_released() {
    let mut env = setup(TOTAL_AMOUNT * 2);
    activate_milestone(&mut env, 1, &[400_000, 600_000], 0);
    assert_rejected(env.complete(1), E_UNRESOLVED_WORK, "none released");
    env.submit_work(1, 0).unwrap();
    assert_rejected(env.complete(1), E_UNRESOLVED_WORK, "one submitted");
    env.approve_work(1, 0).unwrap();
    assert_rejected(env.complete(1), E_UNRESOLVED_WORK, "one remaining");
    env.submit_work(1, 1).unwrap();
    env.request_revision(1, 1).unwrap();
    assert_rejected(env.complete(1), E_UNRESOLVED_WORK, "revising remaining");
    env.submit_work(1, 1).unwrap();
    env.approve_work(1, 1).unwrap();
    env.complete(1).unwrap();
    env.assert_completed_full(1, 1_000_000);
    assert_rejected(
        env.add_milestone(1, 1, OFFSET),
        E_INVALID_STATE,
        "completed cannot add milestone",
    );
    env.withdraw(1).unwrap();
    assert_eq!(env.escrow_amount(1), 0);

    activate_milestone(&mut env, 2, &[400_000, 550_000], TRIAL_AMOUNT);
    env.submit_work(2, 0).unwrap();
    env.warp(env.now() + 300);
    env.timeout(2, 0).unwrap();
    env.submit_work(2, 1).unwrap();
    env.warp(env.now() + 300);
    env.timeout(2, 1).unwrap();
    env.complete(2).unwrap();
    let m = env.read_contract(&env.contract_pda(2));
    assert_eq!(m.released_amount, TOTAL_AMOUNT);
    assert_eq!(m.freelancer_settlement_amount, TOTAL_AMOUNT);
    assert_eq!(m.allocated_amount, MAIN_AMOUNT);
}

#[test]
fn pre_active_and_terminal_states_cannot_complete() {
    let mut env = setup(TOTAL_AMOUNT * 6);
    env.create(&streaming_args(&env, 1, TOTAL_AMOUNT, env.now()))
        .unwrap();
    assert_rejected(env.complete(1), E_COMPLETION_NOT_ALLOWED, "draft/pending");
    // streaming create is PendingAcceptance
    env.accept(1).unwrap();
    assert_rejected(
        env.complete(1),
        E_COMPLETION_NOT_ALLOWED,
        "pending employer approval",
    );
    env.reject_activation(1, false).unwrap();
    assert_rejected(env.complete(1), E_CONTRACT_TERMINAL, "activation rejected");

    activate_fixed(&mut env, 2, TOTAL_AMOUNT, 0);
    env.cancel(2).unwrap();
    assert_rejected(env.complete(2), E_CONTRACT_TERMINAL, "cancelled");

    activate_fixed(&mut env, 3, TOTAL_AMOUNT, 0);
    env.open_dispute(3).unwrap();
    assert_rejected(env.complete(3), E_CONTRACT_TERMINAL, "disputed");
    env.resolve(3, 0).unwrap();
    assert_rejected(env.complete(3), E_CONTRACT_TERMINAL, "resolved");

    env.create(&milestone_args(&env, 4, TOTAL_AMOUNT, env.now()))
        .unwrap();
    assert_rejected(env.complete(4), E_COMPLETION_NOT_ALLOWED, "draft milestone");
}

#[test]
fn completed_cancelled_resolved_and_disputed_stay_frozen() {
    let mut env = setup(TOTAL_AMOUNT * 3);
    activate_fixed(&mut env, 1, TOTAL_AMOUNT, 0);
    env.submit_work(1, 0).unwrap();
    env.approve_work(1, 0).unwrap();
    env.complete(1).unwrap();
    assert_rejected(env.submit_work(1, 0), E_INVALID_STATE, "submit");
    assert_rejected(env.request_revision(1, 0), E_INVALID_STATE, "revision");
    assert_rejected(env.approve_work(1, 0), E_INVALID_STATE, "approve");
    assert_rejected(env.timeout(1, 0), E_INVALID_STATE, "timeout");
    assert_rejected(env.cancel(1), E_CONTRACT_TERMINAL, "cancel");
    assert_rejected(env.open_dispute(1), E_CONTRACT_TERMINAL, "dispute");
    assert_rejected(
        env.add_milestone(1, 1, OFFSET),
        E_INVALID_PAYMENT_MODE,
        "milestone terms",
    );
    assert_rejected(env.complete(1), E_ALREADY_COMPLETED, "complete twice");

    activate_fixed(&mut env, 2, TOTAL_AMOUNT, 0);
    env.cancel(2).unwrap();
    let cancelled = env.read_contract(&env.contract_pda(2));
    assert_rejected(env.submit_work(2, 0), E_INVALID_STATE, "cancel submit");
    assert_rejected(env.complete(2), E_CONTRACT_TERMINAL, "cancel complete");
    assert_eq!(
        env.read_contract(&env.contract_pda(2))
            .freelancer_settlement_amount,
        cancelled.freelancer_settlement_amount
    );

    activate_fixed(&mut env, 3, TOTAL_AMOUNT, 0);
    env.submit_work(3, 0).unwrap();
    env.open_dispute(3).unwrap();
    assert_rejected(env.approve_work(3, 0), E_INVALID_STATE, "disputed approve");
    assert_rejected(env.timeout(3, 0), E_INVALID_STATE, "disputed timeout");
    assert_rejected(env.cancel(3), E_CONTRACT_TERMINAL, "disputed cancel");
    assert_rejected(env.complete(3), E_CONTRACT_TERMINAL, "disputed complete");
    assert_rejected(env.withdraw(3), E_CONTRACT_TERMINAL, "disputed withdraw");
    assert_rejected(env.refund(3), E_CONTRACT_TERMINAL, "disputed refund");
    assert_rejected(env.open_dispute(3), E_ALREADY_DISPUTED, "second dispute");
    env.resolve(3, 0).unwrap();
    let resolved = env.read_contract(&env.contract_pda(3));
    assert_rejected(env.complete(3), E_CONTRACT_TERMINAL, "resolved complete");
    assert_eq!(
        env.read_contract(&env.contract_pda(3))
            .freelancer_settlement_amount,
        resolved.freelancer_settlement_amount
    );
}

#[test]
fn permissionless_completion_cannot_bypass_review() {
    let mut env = setup(TOTAL_AMOUNT);
    activate_fixed(&mut env, 1, TOTAL_AMOUNT, 0);
    env.submit_work(1, 0).unwrap();
    assert_rejected(
        env.complete(1),
        E_UNRESOLVED_WORK,
        "outsider cannot skip review",
    );
    env.approve_work(1, 0).unwrap();
    env.complete(1).unwrap();
    env.assert_completed_full(1, TOTAL_AMOUNT);
}

#[test]
fn claim_order_after_completion_is_independent_and_drains_escrow() {
    fn settle(freelancer_first: bool) -> (u64, u64, u64, u64, u64) {
        let mut env = setup(10);
        let start = activate_streaming(&mut env, 1, 10);
        env.warp(start + 20);
        env.release_stream(1).unwrap();
        env.withdraw(1).unwrap();
        env.warp(start + DURATION);
        env.complete(1).unwrap();
        if freelancer_first {
            env.withdraw(1).unwrap();
            assert_rejected(env.refund(1), E_NOTHING_TO_REFUND, "no refund");
        } else {
            assert_rejected(env.refund(1), E_NOTHING_TO_REFUND, "no refund first");
            env.withdraw(1).unwrap();
        }
        let c = env.read_contract(&env.contract_pda(1));
        assert_eq!(c.withdrawn_amount, 10);
        assert_eq!(c.refunded_amount, 0);
        assert_eq!(env.escrow_amount(1), 0);
        (
            c.withdrawn_amount,
            c.refunded_amount,
            env.escrow_amount(1),
            env.token_balance(&env.freelancer_token_account),
            env.token_balance(&env.employer_token_account),
        )
    }
    assert_eq!(settle(true), settle(false));
}

#[test]
fn duplicate_settlement_paths_fail_atomically() {
    let mut env = setup(30);
    let start = activate_streaming(&mut env, 1, 10);
    env.warp(start + DURATION);
    env.complete(1).unwrap();
    let frozen = env.read_contract(&env.contract_pda(1));
    assert_rejected(env.cancel(1), E_CONTRACT_TERMINAL, "complete then cancel");
    assert_rejected(
        env.open_dispute(1),
        E_CONTRACT_TERMINAL,
        "complete then dispute",
    );
    assert_rejected(env.complete(1), E_ALREADY_COMPLETED, "complete twice");
    assert_eq!(
        env.read_contract(&env.contract_pda(1)).status,
        frozen.status
    );

    activate_streaming(&mut env, 2, 10);
    env.cancel(2).unwrap();
    assert_rejected(env.complete(2), E_CONTRACT_TERMINAL, "cancel then complete");

    activate_streaming(&mut env, 3, 10);
    env.open_dispute(3).unwrap();
    assert_rejected(
        env.complete(3),
        E_CONTRACT_TERMINAL,
        "dispute then complete",
    );
    env.resolve(3, 4).unwrap();
    assert_rejected(
        env.complete(3),
        E_CONTRACT_TERMINAL,
        "resolve then complete",
    );
}
