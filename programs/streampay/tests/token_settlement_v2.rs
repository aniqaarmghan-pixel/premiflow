//! StreamPay V2 Phase 8 tests: real SPL withdrawal and employer refund.
//!
//! Withdraw-all-available. Refund only after Phase 7 freeze. Zero-value CPIs
//! are rejected. Failed claims must leave accounting and balances unchanged.

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
const E_NOTHING_TO_WITHDRAW: u32 = 6139;
const E_NOTHING_TO_REFUND: u32 = 6140;
const E_INSUFFICIENT_ESCROW: u32 = 6157;
const E_CONSTRAINT_SEEDS: u32 = 2006;
const E_CONSTRAINT_TOKEN_MINT: u32 = 2014;
const E_CONSTRAINT_TOKEN_OWNER: u32 = 2015;
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
const SUBMISSION_URI: &str = "ipfs://bafySettleWork";
const SUBMISSION_HASH: [u8; 32] = [15u8; 32];

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

    fn withdraw_ix(
        &self,
        freelancer: Address,
        contract: Address,
        escrow: Address,
        dest: Address,
        mint: Address,
        token_program: Address,
    ) -> Instruction {
        Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::WithdrawFreelancer {
                freelancer,
                contract,
                token_mint: mint,
                contract_escrow: escrow,
                freelancer_token_account: dest,
                token_program,
            }
            .to_account_metas(None),
            data: streampay_program::instruction::WithdrawFreelancer {}.data(),
        }
    }

    fn withdraw(&mut self, contract_id: u64) -> TransactionResult {
        let contract = self.contract_pda(contract_id);
        let ix = self.withdraw_ix(
            self.freelancer_pk,
            contract,
            self.escrow_pda(&contract),
            self.freelancer_token_account,
            self.token_mint,
            TOKEN_ID,
        );
        self.send_freelancer(ix)
    }

    fn refund_ix(
        &self,
        employer: Address,
        contract: Address,
        escrow: Address,
        dest: Address,
        mint: Address,
        token_program: Address,
    ) -> Instruction {
        Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::ClaimEmployerRefund {
                employer,
                contract,
                token_mint: mint,
                contract_escrow: escrow,
                employer_token_account: dest,
                token_program,
            }
            .to_account_metas(None),
            data: streampay_program::instruction::ClaimEmployerRefund {}.data(),
        }
    }

    fn refund(&mut self, contract_id: u64) -> TransactionResult {
        let contract = self.contract_pda(contract_id);
        let ix = self.refund_ix(
            self.employer_pk,
            contract,
            self.escrow_pda(&contract),
            self.employer_token_account,
            self.token_mint,
            TOKEN_ID,
        );
        self.send_employer(ix)
    }

    fn read_contract(&self, contract: &Address) -> Contract {
        let account = self.svm.get_account(contract).expect("contract missing");
        let mut data: &[u8] = &account.data;
        Contract::try_deserialize(&mut data).expect("deserialize contract")
    }

    fn snapshot(&self, contract_id: u64) -> (u64, u64, u64, u64, u64) {
        let c = self.read_contract(&self.contract_pda(contract_id));
        (
            c.withdrawn_amount,
            c.refunded_amount,
            self.escrow_amount(contract_id),
            self.token_balance(&self.freelancer_token_account),
            self.token_balance(&self.employer_token_account),
        )
    }

    fn assert_conservation(&self, contract_id: u64, total: u64) {
        let c = self.read_contract(&self.contract_pda(contract_id));
        assert_eq!(
            self.escrow_amount(contract_id) + c.withdrawn_amount + c.refunded_amount,
            total
        );
        assert!(c.withdrawn_amount <= c.released_amount);
        if c.status == ContractStatus::Cancelled {
            assert!(c.withdrawn_amount <= c.freelancer_settlement_amount);
            assert!(c.refunded_amount <= c.employer_refundable_amount);
        }
    }

    fn corrupt_escrow_amount(&mut self, contract_id: u64, amount: u64) {
        let escrow = self.escrow_pda(&self.contract_pda(contract_id));
        let mut acc = self.svm.get_account(&escrow).expect("escrow missing");
        acc.data[64..72].copy_from_slice(&amount.to_le_bytes());
        self.svm.set_account(escrow, acc).expect("set escrow");
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

fn activate_streaming(env: &mut Env, id: u64, total_amount: u64) -> i64 {
    env.create(&streaming_args(id, total_amount, env.now()))
        .unwrap();
    env.accept(id).unwrap();
    env.approve_activation(id).unwrap();
    env.read_contract(&env.contract_pda(id)).start_time
}

fn activate_fixed(env: &mut Env, id: u64, total_amount: u64, trial: u64) {
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
}

fn activate_milestone(env: &mut Env, id: u64, amounts: &[u64]) {
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
}

fn assert_withdraw_moved(env: &Env, id: u64, amount: u64, withdrawn: u64, escrow: u64, dest: u64) {
    let c = env.read_contract(&env.contract_pda(id));
    assert_eq!(c.withdrawn_amount, withdrawn);
    assert_eq!(env.escrow_amount(id), escrow);
    assert_eq!(env.token_balance(&env.freelancer_token_account), dest);
    assert_eq!(amount, dest);
    env.assert_conservation(id, c.total_amount);
}

#[test]
fn freelancer_withdraws_released_trial() {
    let mut env = setup(TOTAL_AMOUNT);
    activate_fixed(&mut env, 1, TOTAL_AMOUNT, TRIAL_AMOUNT);
    env.withdraw(1).unwrap();
    assert_withdraw_moved(
        &env,
        1,
        TRIAL_AMOUNT,
        TRIAL_AMOUNT,
        MAIN_AMOUNT,
        TRIAL_AMOUNT,
    );
    assert_rejected(
        env.withdraw(1),
        E_NOTHING_TO_WITHDRAW,
        "second trial withdraw",
    );
}

#[test]
fn freelancer_withdraws_approved_fixed_and_milestone() {
    let mut env = setup(TOTAL_AMOUNT * 2);
    activate_fixed(&mut env, 1, TOTAL_AMOUNT, 0);
    env.submit_work(1, 0).unwrap();
    env.approve_work(1, 0).unwrap();
    env.withdraw(1).unwrap();
    assert_eq!(
        env.read_contract(&env.contract_pda(1)).withdrawn_amount,
        TOTAL_AMOUNT
    );

    activate_milestone(&mut env, 2, &[400_000, 600_000]);
    env.submit_work(2, 0).unwrap();
    env.approve_work(2, 0).unwrap();
    let before = env.token_balance(&env.freelancer_token_account);
    env.withdraw(2).unwrap();
    assert_eq!(
        env.token_balance(&env.freelancer_token_account) - before,
        400_000
    );
    assert_eq!(
        env.read_contract(&env.contract_pda(2)).withdrawn_amount,
        400_000
    );
    assert_eq!(env.escrow_amount(2), 600_000);
}

#[test]
fn streaming_release_then_withdraw_delta_only() {
    let mut env = setup(10);
    let start = activate_streaming(&mut env, 1, 10);
    assert_rejected(env.withdraw(1), E_NOTHING_TO_WITHDRAW, "unreleased stream");
    env.warp(start + 20);
    env.release_stream(1).unwrap();
    env.withdraw(1).unwrap();
    assert_withdraw_moved(&env, 1, 3, 3, 7, 3);
    env.warp(start + 40);
    env.release_stream(1).unwrap();
    env.withdraw(1).unwrap();
    assert_eq!(env.read_contract(&env.contract_pda(1)).withdrawn_amount, 6);
    assert_eq!(env.token_balance(&env.freelancer_token_account), 6);
    assert_eq!(env.escrow_amount(1), 4);
    assert_rejected(env.withdraw(1), E_NOTHING_TO_WITHDRAW, "no further stream");
}

#[test]
fn unauthorized_and_bad_destination_withdrawals_rejected() {
    let mut env = setup(TOTAL_AMOUNT * 2);
    activate_fixed(&mut env, 1, TOTAL_AMOUNT, 0);
    env.submit_work(1, 0).unwrap();
    env.approve_work(1, 0).unwrap();
    let contract = env.contract_pda(1);
    let escrow = env.escrow_pda(&contract);
    let before = env.snapshot(1);

    assert_rejected(
        env.send_employer(env.withdraw_ix(
            env.employer_pk,
            contract,
            escrow,
            env.freelancer_token_account,
            env.token_mint,
            TOKEN_ID,
        )),
        E_CONSTRAINT_SEEDS,
        "employer withdraw",
    );
    let outsider = clone_kp(&env.outsider);
    assert_rejected(
        env.send(
            env.withdraw_ix(
                env.outsider_pk,
                contract,
                escrow,
                env.freelancer_token_account,
                env.token_mint,
                TOKEN_ID,
            ),
            &outsider,
        ),
        E_CONSTRAINT_SEEDS,
        "third party withdraw",
    );

    let other_mint = CreateMint::new(&mut env.svm, &env.employer)
        .authority(&env.employer_pk)
        .decimals(MINT_DECIMALS)
        .send()
        .unwrap();
    let wrong_mint_dest = CreateAccount::new(&mut env.svm, &env.employer, &other_mint)
        .owner(&env.freelancer_pk)
        .send()
        .unwrap();
    assert_rejected(
        env.send_freelancer(env.withdraw_ix(
            env.freelancer_pk,
            contract,
            escrow,
            wrong_mint_dest,
            env.token_mint,
            TOKEN_ID,
        )),
        E_CONSTRAINT_TOKEN_MINT,
        "wrong mint dest",
    );

    let outsider_dest = CreateAccount::new(&mut env.svm, &env.employer, &env.token_mint)
        .owner(&env.outsider_pk)
        .send()
        .unwrap();
    assert_rejected(
        env.send_freelancer(env.withdraw_ix(
            env.freelancer_pk,
            contract,
            escrow,
            outsider_dest,
            env.token_mint,
            TOKEN_ID,
        )),
        E_CONSTRAINT_TOKEN_OWNER,
        "third-party dest",
    );
    assert_rejected(
        env.send_freelancer(env.withdraw_ix(
            env.freelancer_pk,
            contract,
            escrow,
            env.employer_token_account,
            env.token_mint,
            TOKEN_ID,
        )),
        E_CONSTRAINT_TOKEN_OWNER,
        "employer dest",
    );
    assert_rejected(
        env.send_freelancer(env.withdraw_ix(
            env.freelancer_pk,
            Keypair::new().pubkey(),
            escrow,
            env.freelancer_token_account,
            env.token_mint,
            TOKEN_ID,
        )),
        E_ACCOUNT_NOT_INITIALIZED,
        "fake contract",
    );

    env.create(&streaming_args(2, TOTAL_AMOUNT, env.now()))
        .unwrap();
    let other_escrow = env.escrow_pda(&env.contract_pda(2));
    assert_rejected(
        env.send_freelancer(env.withdraw_ix(
            env.freelancer_pk,
            contract,
            other_escrow,
            env.freelancer_token_account,
            env.token_mint,
            TOKEN_ID,
        )),
        E_CONSTRAINT_SEEDS,
        "cross-contract escrow",
    );

    let after = env.snapshot(1);
    assert_eq!(after.0, before.0);
    assert_eq!(after.1, before.1);
    assert_eq!(after.2, before.2);
    assert_eq!(after.3, before.3);
}

#[test]
fn cancelled_streaming_withdraw_and_no_post_cancel_accrual() {
    let mut env = setup(10);
    let start = activate_streaming(&mut env, 1, 10);
    env.warp(start + 20);
    env.release_stream(1).unwrap();
    env.withdraw(1).unwrap();
    env.warp(start + 40);
    env.cancel(1).unwrap();
    let c = env.read_contract(&env.contract_pda(1));
    assert_eq!(c.freelancer_settlement_amount, 6);
    assert_eq!(c.withdrawn_amount, 3);
    env.withdraw(1).unwrap();
    assert_eq!(env.read_contract(&env.contract_pda(1)).withdrawn_amount, 6);
    env.warp(start + 10_000);
    assert_rejected(
        env.withdraw(1),
        E_NOTHING_TO_WITHDRAW,
        "post-cancel over-withdraw",
    );
}

#[test]
fn trial_plus_stream_settlement_withdraw_exact() {
    let mut env = setup(TOTAL_AMOUNT);
    let mut args = streaming_args(1, TOTAL_AMOUNT, env.now());
    args.trial_amount = TRIAL_AMOUNT;
    env.create(&args).unwrap();
    env.accept(1).unwrap();
    env.submit_trial(1).unwrap();
    env.approve_trial(1).unwrap();
    let start = env.read_contract(&env.contract_pda(1)).start_time;
    env.withdraw(1).unwrap();
    assert_eq!(
        env.read_contract(&env.contract_pda(1)).withdrawn_amount,
        TRIAL_AMOUNT
    );
    env.warp(start + DURATION / 2);
    env.cancel(1).unwrap();
    let stream = MAIN_AMOUNT / 2;
    env.withdraw(1).unwrap();
    let c = env.read_contract(&env.contract_pda(1));
    assert_eq!(c.withdrawn_amount, TRIAL_AMOUNT + stream);
    assert_eq!(c.freelancer_settlement_amount, TRIAL_AMOUNT + stream);
    assert_eq!(
        env.token_balance(&env.freelancer_token_account),
        TRIAL_AMOUNT + stream
    );
}

#[test]
fn cancelled_fixed_and_milestone_withdraw_released_only() {
    let mut env = setup(TOTAL_AMOUNT * 2);
    activate_fixed(&mut env, 1, TOTAL_AMOUNT, TRIAL_AMOUNT);
    env.cancel(1).unwrap();
    env.withdraw(1).unwrap();
    assert_eq!(
        env.read_contract(&env.contract_pda(1)).withdrawn_amount,
        TRIAL_AMOUNT
    );

    activate_milestone(&mut env, 2, &[400_000, 600_000]);
    env.submit_work(2, 0).unwrap();
    env.approve_work(2, 0).unwrap();
    env.cancel(2).unwrap();
    let before = env.token_balance(&env.freelancer_token_account);
    env.withdraw(2).unwrap();
    assert_eq!(
        env.token_balance(&env.freelancer_token_account) - before,
        400_000
    );
    assert_eq!(
        env.read_contract(&env.contract_pda(2))
            .employer_refundable_amount,
        600_000
    );
}

#[test]
fn employer_refund_exact_and_second_rejected() {
    let mut env = setup(TOTAL_AMOUNT);
    activate_fixed(&mut env, 1, TOTAL_AMOUNT, 0);
    env.cancel(1).unwrap();
    env.refund(1).unwrap();
    let c = env.read_contract(&env.contract_pda(1));
    assert_eq!(c.refunded_amount, TOTAL_AMOUNT);
    assert_eq!(env.escrow_amount(1), 0);
    assert_eq!(env.token_balance(&env.employer_token_account), TOTAL_AMOUNT);
    assert_rejected(env.refund(1), E_NOTHING_TO_REFUND, "second refund");
}

#[test]
fn unauthorized_and_bad_destination_refunds_rejected() {
    let mut env = setup(TOTAL_AMOUNT * 2);
    activate_fixed(&mut env, 1, TOTAL_AMOUNT, 0);
    env.cancel(1).unwrap();
    let contract = env.contract_pda(1);
    let escrow = env.escrow_pda(&contract);
    let before = env.snapshot(1);

    assert_rejected(
        env.send_freelancer(env.refund_ix(
            env.freelancer_pk,
            contract,
            escrow,
            env.employer_token_account,
            env.token_mint,
            TOKEN_ID,
        )),
        E_CONSTRAINT_SEEDS,
        "freelancer refund",
    );
    let outsider = clone_kp(&env.outsider);
    assert_rejected(
        env.send(
            env.refund_ix(
                env.outsider_pk,
                contract,
                escrow,
                env.employer_token_account,
                env.token_mint,
                TOKEN_ID,
            ),
            &outsider,
        ),
        E_CONSTRAINT_SEEDS,
        "third party refund",
    );

    let other_mint = CreateMint::new(&mut env.svm, &env.employer)
        .authority(&env.employer_pk)
        .decimals(MINT_DECIMALS)
        .send()
        .unwrap();
    let wrong_mint_dest = CreateAccount::new(&mut env.svm, &env.employer, &other_mint)
        .owner(&env.employer_pk)
        .send()
        .unwrap();
    assert_rejected(
        env.send_employer(env.refund_ix(
            env.employer_pk,
            contract,
            escrow,
            wrong_mint_dest,
            env.token_mint,
            TOKEN_ID,
        )),
        E_CONSTRAINT_TOKEN_MINT,
        "wrong mint refund dest",
    );
    assert_rejected(
        env.send_employer(env.refund_ix(
            env.employer_pk,
            contract,
            escrow,
            env.freelancer_token_account,
            env.token_mint,
            TOKEN_ID,
        )),
        E_CONSTRAINT_TOKEN_OWNER,
        "freelancer dest refund",
    );
    let outsider_dest = CreateAccount::new(&mut env.svm, &env.employer, &env.token_mint)
        .owner(&env.outsider_pk)
        .send()
        .unwrap();
    assert_rejected(
        env.send_employer(env.refund_ix(
            env.employer_pk,
            contract,
            escrow,
            outsider_dest,
            env.token_mint,
            TOKEN_ID,
        )),
        E_CONSTRAINT_TOKEN_OWNER,
        "third-party dest refund",
    );

    env.create(&streaming_args(2, TOTAL_AMOUNT, env.now()))
        .unwrap();
    let other_escrow = env.escrow_pda(&env.contract_pda(2));
    assert_rejected(
        env.send_employer(env.refund_ix(
            env.employer_pk,
            contract,
            other_escrow,
            env.employer_token_account,
            env.token_mint,
            TOKEN_ID,
        )),
        E_CONSTRAINT_SEEDS,
        "cross escrow refund",
    );
    let after = env.snapshot(1);
    assert_eq!(after.0, before.0);
    assert_eq!(after.1, before.1);
    assert_eq!(after.2, before.2);
    assert_eq!(after.3, before.3);
}

#[test]
fn active_and_disputed_cannot_refund() {
    let mut env = setup(TOTAL_AMOUNT * 2);
    activate_fixed(&mut env, 1, TOTAL_AMOUNT, 0);
    assert_rejected(env.refund(1), E_INVALID_STATE, "active refund");

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
    assert_rejected(env.refund(2), E_CONTRACT_TERMINAL, "disputed refund");
}

#[test]
fn claim_order_independence_and_full_conservation() {
    fn settle(withdraw_first: bool) -> (u64, u64, u64, u64, u64) {
        let mut env = setup(10);
        let start = activate_streaming(&mut env, 1, 10);
        env.warp(start + 20);
        env.release_stream(1).unwrap();
        env.withdraw(1).unwrap();
        env.warp(start + 40);
        env.cancel(1).unwrap();
        if withdraw_first {
            env.withdraw(1).unwrap();
            env.refund(1).unwrap();
        } else {
            env.refund(1).unwrap();
            env.withdraw(1).unwrap();
        }
        let c = env.read_contract(&env.contract_pda(1));
        assert_eq!(c.freelancer_settlement_amount, 6);
        assert_eq!(c.employer_refundable_amount, 4);
        assert_eq!(c.withdrawn_amount, 6);
        assert_eq!(c.refunded_amount, 4);
        assert_eq!(env.escrow_amount(1), 0);
        assert_eq!(env.token_balance(&env.freelancer_token_account), 6);
        assert_eq!(env.token_balance(&env.employer_token_account), 4);
        env.assert_conservation(1, 10);
        (
            c.withdrawn_amount,
            c.refunded_amount,
            env.escrow_amount(1),
            env.token_balance(&env.freelancer_token_account),
            env.token_balance(&env.employer_token_account),
        )
    }

    let a = settle(true);
    let b = settle(false);
    assert_eq!(a, b);
}

#[test]
fn pre_active_and_disputed_withdrawals_rejected() {
    let mut env = setup(TOTAL_AMOUNT * 3);
    env.create(&streaming_args(1, TOTAL_AMOUNT, env.now()))
        .unwrap();
    assert_rejected(env.withdraw(1), E_INVALID_STATE, "pending acceptance");
    env.accept(1).unwrap();
    assert_rejected(
        env.withdraw(1),
        E_INVALID_STATE,
        "pending employer approval",
    );

    let mut args = streaming_args(2, TOTAL_AMOUNT, env.now());
    args.trial_amount = TRIAL_AMOUNT;
    env.create(&args).unwrap();
    env.accept(2).unwrap();
    env.reject(2, true).unwrap();
    assert_eq!(
        env.read_contract(&env.contract_pda(2)).status,
        ContractStatus::ActivationRejected
    );
    assert_rejected(env.withdraw(2), E_CONTRACT_TERMINAL, "activation rejected");

    let mut args = streaming_args(3, TOTAL_AMOUNT, env.now());
    args.trial_amount = TRIAL_AMOUNT;
    env.create(&args).unwrap();
    env.accept(3).unwrap();
    env.submit_trial(3).unwrap();
    env.reject(3, true).unwrap();
    assert_eq!(
        env.read_contract(&env.contract_pda(3)).status,
        ContractStatus::Disputed
    );
    assert_rejected(env.withdraw(3), E_CONTRACT_TERMINAL, "disputed withdraw");
}

#[test]
fn token_program_substitution_and_underfunded_escrow_fail_atomically() {
    let mut env = setup(10);
    activate_fixed(&mut env, 1, 10, 0);
    env.submit_work(1, 0).unwrap();
    env.approve_work(1, 0).unwrap();
    let contract = env.contract_pda(1);
    let escrow = env.escrow_pda(&contract);
    let before = env.snapshot(1);

    let result = env.send_freelancer(env.withdraw_ix(
        env.freelancer_pk,
        contract,
        escrow,
        env.freelancer_token_account,
        env.token_mint,
        anchor_lang::system_program::ID,
    ));
    assert!(result.is_err(), "token program substitution should fail");
    assert_eq!(env.snapshot(1), before);

    env.corrupt_escrow_amount(1, 1);
    assert_rejected(env.withdraw(1), E_INSUFFICIENT_ESCROW, "underfunded escrow");
    let c = env.read_contract(&contract);
    assert_eq!(c.withdrawn_amount, 0);
    assert_eq!(env.token_balance(&env.freelancer_token_account), 0);
}
