//! StreamPay V2: employer `void_stale_revision` for stale Revising units.
//!
//! Option B: `submit_work_unit` is not gated on the Revising deadline. The
//! freelancer may still resubmit until the employer lands this instruction.
//! Voiding does not move SPL tokens and does not credit a refund.

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
    StartMode, WorkUnit, WorkUnitKind, WorkUnitStatus,
};

#[allow(dead_code)]
const E_INVALID_PAYMENT_MODE: u32 = 6110;
const E_INVALID_STATE: u32 = 6111;
const E_UNIT_NOT_SUBMITTABLE: u32 = 6126;
const E_UNIT_NOT_UNDER_REVIEW: u32 = 6127;
const E_UNIT_VOIDED: u32 = 6129;
const E_UNIT_NOT_STALE: u32 = 6130;
const E_OPEN_REVIEW_BLOCKS_CANCEL: u32 = 6142;
const E_CONSTRAINT_SEEDS: u32 = 2006;
const E_ACCOUNT_NOT_INITIALIZED: u32 = 3012;
const E_UNRESOLVED_WORK: u32 = 6163;

const MINT_DECIMALS: u8 = 6;
const BASE_TS: i64 = 1_700_000_000;
const TOTAL_AMOUNT: u64 = 1_000_000;
const TRIAL_AMOUNT: u64 = 50_000;
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

    fn request_trial_revision(&mut self, contract_id: u64) -> TransactionResult {
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

    fn resubmit(&mut self, contract_id: u64, index: u32) -> TransactionResult {
        let contract = self.contract_pda(contract_id);
        let ix = self.submit_ix(
            self.freelancer_pk,
            contract,
            self.work_unit_pda(&contract, index),
            RESUBMIT_URI,
            RESUBMIT_HASH,
        );
        self.send_freelancer(ix)
    }

    fn approve_unit(&mut self, contract_id: u64, index: u32) -> TransactionResult {
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

    fn void_ix(&self, employer: Address, contract: Address, work_unit: Address) -> Instruction {
        Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::VoidStaleRevision {
                employer,
                contract,
                work_unit,
            }
            .to_account_metas(None),
            data: streampay_program::instruction::VoidStaleRevision {}.data(),
        }
    }

    fn void_stale(&mut self, contract_id: u64, index: u32) -> TransactionResult {
        let contract = self.contract_pda(contract_id);
        let ix = self.void_ix(
            self.employer_pk,
            contract,
            self.work_unit_pda(&contract, index),
        );
        self.send_employer(ix)
    }

    fn timeout_as(&mut self, signer: &Keypair, contract_id: u64, index: u32) -> TransactionResult {
        let contract = self.contract_pda(contract_id);
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::FinalizeReviewTimeout {
                caller: signer.pubkey(),
                contract,
                work_unit: self.work_unit_pda(&contract, index),
            }
            .to_account_metas(None),
            data: streampay_program::instruction::FinalizeReviewTimeout {}.data(),
        };
        self.send(ix, signer)
    }

    fn cancel(&mut self, contract_id: u64) -> TransactionResult {
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::CancelActiveContract {
                employer: self.employer_pk,
                contract: self.contract_pda(contract_id),
                hourly_state: None,
            }
            .to_account_metas(None),
            data: streampay_program::instruction::CancelActiveContract {}.data(),
        };
        self.send_employer(ix)
    }

    fn complete(&mut self, contract_id: u64) -> TransactionResult {
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::CompleteContract {
                caller: self.employer_pk,
                contract: self.contract_pda(contract_id),
            }
            .to_account_metas(None),
            data: streampay_program::instruction::CompleteContract {}.data(),
        };
        self.send_employer(ix)
    }

    fn open_dispute(&mut self, contract_id: u64) -> TransactionResult {
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::OpenDispute {
                party: self.employer_pk,
                contract: self.contract_pda(contract_id),
                hourly_state: None,
                hourly_session: None,
            }
            .to_account_metas(None),
            data: streampay_program::instruction::OpenDispute {}.data(),
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
        resolver: Pubkey::new_from_array([0x11; 32]),
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

fn revising_fixed(env: &mut Env) -> u64 {
    let id = activate_fixed(env);
    env.submit(id, 0).unwrap();
    env.request_revision(id, 0).unwrap();
    id
}

fn accounting_snapshot(c: &Contract) -> (u64, u64, u64, u64, u32, u32, u16, u64) {
    (
        c.allocated_amount,
        c.released_amount,
        c.withdrawn_amount,
        c.refunded_amount,
        c.released_unit_count,
        c.voided_unit_count,
        c.open_review_count,
        c.employer_refundable_amount,
    )
}

#[test]
fn void_before_deadline_fails() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = revising_fixed(&mut env);
    let deadline = env
        .read_work_unit(&env.work_unit_pda(&env.contract_pda(id), 0))
        .action_deadline;
    env.warp(deadline - 1);
    assert_rejected(
        env.void_stale(id, 0),
        E_UNIT_NOT_STALE,
        "void before revision deadline",
    );
}

#[test]
fn employer_voids_exactly_at_deadline_without_moving_money() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = revising_fixed(&mut env);
    let contract = env.contract_pda(id);
    let unit_before = env.read_work_unit(&env.work_unit_pda(&contract, 0));
    assert_eq!(unit_before.status, WorkUnitStatus::Revising);
    let c_before = env.read_contract(&contract);
    let (
        allocated,
        released,
        withdrawn,
        refunded,
        released_units,
        voided_units,
        open_review,
        refundable,
    ) = accounting_snapshot(&c_before);
    assert_eq!(open_review, 1);
    assert_eq!(voided_units, 0);
    let escrow_before = env.escrow_amount(id);

    env.warp(unit_before.action_deadline);
    env.void_stale(id, 0).unwrap();

    let unit = env.read_work_unit(&env.work_unit_pda(&contract, 0));
    assert_eq!(unit.status, WorkUnitStatus::Void);
    assert_eq!(unit.kind, WorkUnitKind::Fixed);
    assert_eq!(unit.submission_uri, unit_before.submission_uri);
    assert_eq!(unit.submission_hash, unit_before.submission_hash);
    assert_eq!(unit.submitted_at, unit_before.submitted_at);
    assert_eq!(unit.revision_count, unit_before.revision_count);
    assert_eq!(unit.action_deadline, unit_before.action_deadline);
    assert_eq!(unit.amount, unit_before.amount);

    let c = env.read_contract(&contract);
    assert_eq!(c.status, ContractStatus::Active);
    assert_eq!(c.open_review_count, 0);
    assert_eq!(c.voided_unit_count, 1);
    assert_eq!(c.allocated_amount, allocated);
    assert_eq!(c.released_amount, released);
    assert_eq!(c.withdrawn_amount, withdrawn);
    assert_eq!(c.refunded_amount, refunded);
    assert_eq!(c.released_unit_count, released_units);
    assert_eq!(c.employer_refundable_amount, refundable);
    assert_eq!(c.freelancer_settlement_amount, 0);
    assert_eq!(env.escrow_amount(id), escrow_before);
    assert_eq!(escrow_before, TOTAL_AMOUNT);
}

#[test]
fn employer_voids_after_deadline() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = revising_fixed(&mut env);
    let deadline = env
        .read_work_unit(&env.work_unit_pda(&env.contract_pda(id), 0))
        .action_deadline;
    env.warp(deadline + 1);
    env.void_stale(id, 0).unwrap();
    let unit = env.read_work_unit(&env.work_unit_pda(&env.contract_pda(id), 0));
    assert_eq!(unit.status, WorkUnitStatus::Void);
}

#[test]
fn freelancer_cannot_void() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = revising_fixed(&mut env);
    let contract = env.contract_pda(id);
    env.warp(
        env.read_work_unit(&env.work_unit_pda(&contract, 0))
            .action_deadline,
    );
    let ix = env.void_ix(env.freelancer_pk, contract, env.work_unit_pda(&contract, 0));
    assert_rejected(
        env.send_freelancer(ix),
        E_CONSTRAINT_SEEDS,
        "freelancer voiding stale revision",
    );
}

#[test]
fn third_party_cannot_void() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = revising_fixed(&mut env);
    let contract = env.contract_pda(id);
    env.warp(
        env.read_work_unit(&env.work_unit_pda(&contract, 0))
            .action_deadline,
    );
    let outsider = clone_kp(&env.outsider);
    let ix = env.void_ix(env.outsider_pk, contract, env.work_unit_pda(&contract, 0));
    assert_rejected(
        env.send(ix, &outsider),
        E_CONSTRAINT_SEEDS,
        "third party voiding stale revision",
    );
}

#[test]
fn resubmit_after_void_fails() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = revising_fixed(&mut env);
    env.warp(
        env.read_work_unit(&env.work_unit_pda(&env.contract_pda(id), 0))
            .action_deadline,
    );
    env.void_stale(id, 0).unwrap();
    assert_rejected(
        env.resubmit(id, 0),
        E_UNIT_NOT_SUBMITTABLE,
        "resubmit after void",
    );
}

#[test]
fn late_resubmit_before_void_then_void_fails() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = revising_fixed(&mut env);
    let deadline = env
        .read_work_unit(&env.work_unit_pda(&env.contract_pda(id), 0))
        .action_deadline;
    env.warp(deadline);
    env.resubmit(id, 0).unwrap();

    let unit = env.read_work_unit(&env.work_unit_pda(&env.contract_pda(id), 0));
    assert_eq!(unit.status, WorkUnitStatus::Submitted);
    assert_eq!(unit.submission_uri, RESUBMIT_URI);
    assert_eq!(unit.submission_hash, RESUBMIT_HASH);
    assert_eq!(
        env.read_contract(&env.contract_pda(id)).open_review_count,
        1
    );

    assert_rejected(
        env.void_stale(id, 0),
        E_UNIT_NOT_UNDER_REVIEW,
        "void after late resubmit",
    );
}

#[test]
fn finalize_review_timeout_cannot_operate_on_revising() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = revising_fixed(&mut env);
    let deadline = env
        .read_work_unit(&env.work_unit_pda(&env.contract_pda(id), 0))
        .action_deadline;
    env.warp(deadline);
    let outsider = clone_kp(&env.outsider);
    assert_rejected(
        env.timeout_as(&outsider, id, 0),
        E_UNIT_NOT_UNDER_REVIEW,
        "timeout while revising after deadline",
    );
}

#[test]
fn cancel_blocked_before_void_then_allowed_after() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = revising_fixed(&mut env);
    assert_rejected(
        env.cancel(id),
        E_OPEN_REVIEW_BLOCKS_CANCEL,
        "cancel while revising",
    );

    env.warp(
        env.read_work_unit(&env.work_unit_pda(&env.contract_pda(id), 0))
            .action_deadline,
    );
    env.void_stale(id, 0).unwrap();
    env.cancel(id).unwrap();

    let c = env.read_contract(&env.contract_pda(id));
    assert_eq!(c.status, ContractStatus::Cancelled);
    assert_eq!(c.open_review_count, 0);
    assert_eq!(c.voided_unit_count, 1);
    assert_eq!(c.released_amount, 0);
    assert_eq!(c.freelancer_settlement_amount, 0);
    assert_eq!(c.employer_refundable_amount, TOTAL_AMOUNT);
    assert_eq!(env.escrow_amount(id), TOTAL_AMOUNT);
}

#[test]
fn complete_contract_fails_when_required_fixed_unit_is_void() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = revising_fixed(&mut env);
    env.warp(
        env.read_work_unit(&env.work_unit_pda(&env.contract_pda(id), 0))
            .action_deadline,
    );
    env.void_stale(id, 0).unwrap();
    assert_rejected(
        env.complete(id),
        E_UNRESOLVED_WORK,
        "complete with voided required unit",
    );
}

#[test]
fn milestone_void_one_unit_leaves_the_other_untouched() {
    let mut env = setup(TOTAL_AMOUNT);
    let first = 400_000u64;
    let second = 600_000u64;
    let id = activate_milestone(&mut env, &[first, second]);
    env.submit(id, 0).unwrap();
    env.submit(id, 1).unwrap();
    env.request_revision(id, 0).unwrap();

    let contract = env.contract_pda(id);
    let unit1_before = env.read_work_unit(&env.work_unit_pda(&contract, 1));
    assert_eq!(unit1_before.status, WorkUnitStatus::Submitted);
    let c_before = env.read_contract(&contract);
    assert_eq!(c_before.open_review_count, 2);
    assert_eq!(c_before.allocated_amount, TOTAL_AMOUNT);

    env.warp(
        env.read_work_unit(&env.work_unit_pda(&contract, 0))
            .action_deadline,
    );
    env.void_stale(id, 0).unwrap();

    let unit0 = env.read_work_unit(&env.work_unit_pda(&contract, 0));
    let unit1 = env.read_work_unit(&env.work_unit_pda(&contract, 1));
    assert_eq!(unit0.status, WorkUnitStatus::Void);
    assert_eq!(unit0.amount, first);
    assert_eq!(unit1.status, unit1_before.status);
    assert_eq!(unit1.submission_uri, unit1_before.submission_uri);
    assert_eq!(unit1.submission_hash, unit1_before.submission_hash);
    assert_eq!(unit1.amount, second);
    assert_eq!(unit1.revision_count, unit1_before.revision_count);

    let c = env.read_contract(&contract);
    assert_eq!(c.open_review_count, 1);
    assert_eq!(c.voided_unit_count, 1);
    assert_eq!(c.released_amount, 0);
    assert_eq!(c.released_unit_count, 0);
    assert_eq!(c.allocated_amount, TOTAL_AMOUNT);
    assert_eq!(env.escrow_amount(id), TOTAL_AMOUNT);

    env.approve_unit(id, 1).unwrap();
    let unit1 = env.read_work_unit(&env.work_unit_pda(&contract, 1));
    assert_eq!(unit1.status, WorkUnitStatus::Released);
    let c = env.read_contract(&contract);
    assert_eq!(c.released_amount, second);
    assert_eq!(c.released_unit_count, 1);
    assert_eq!(c.open_review_count, 0);
    assert_eq!(c.voided_unit_count, 1);
    assert_eq!(
        env.read_work_unit(&env.work_unit_pda(&contract, 0)).status,
        WorkUnitStatus::Void
    );

    assert_rejected(
        env.complete(id),
        E_UNRESOLVED_WORK,
        "complete with a required voided milestone",
    );
}

#[test]
fn dispute_first_blocks_void() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = revising_fixed(&mut env);
    env.open_dispute(id).unwrap();
    assert_eq!(
        env.read_contract(&env.contract_pda(id)).status,
        ContractStatus::Disputed
    );
    env.warp(
        env.read_work_unit(&env.work_unit_pda(&env.contract_pda(id), 0))
            .action_deadline,
    );
    assert_rejected(env.void_stale(id, 0), E_INVALID_STATE, "void after dispute");
}

#[test]
fn void_first_leaves_dispute_to_existing_contested_remainder_rules() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = revising_fixed(&mut env);
    env.warp(
        env.read_work_unit(&env.work_unit_pda(&env.contract_pda(id), 0))
            .action_deadline,
    );
    env.void_stale(id, 0).unwrap();

    let before = env.read_contract(&env.contract_pda(id));
    assert_eq!(before.status, ContractStatus::Active);
    assert_eq!(before.released_amount, 0);
    assert_eq!(before.refunded_amount, 0);

    env.open_dispute(id).unwrap();
    let after = env.read_contract(&env.contract_pda(id));
    assert_eq!(after.status, ContractStatus::Disputed);
    assert_eq!(after.contested_amount, TOTAL_AMOUNT);
    assert_eq!(after.voided_unit_count, 1);
    assert_eq!(after.open_review_count, 0);
    assert_eq!(after.released_amount, 0);
    assert_eq!(env.escrow_amount(id), TOTAL_AMOUNT);
}

#[test]
fn trial_cannot_use_void_stale_revision() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    let mut args = fixed_args(1, now);
    args.trial_amount = TRIAL_AMOUNT;
    env.create(&args).unwrap();
    env.accept(1).unwrap();
    env.submit_trial(1).unwrap();
    env.request_trial_revision(1).unwrap();

    let contract = env.contract_pda(1);
    let trial = env.read_work_unit(&env.trial_pda(&contract));
    assert_eq!(trial.kind, WorkUnitKind::Trial);
    assert_eq!(trial.status, WorkUnitStatus::Revising);
    env.warp(trial.action_deadline);

    let ix = env.void_ix(env.employer_pk, contract, env.trial_pda(&contract));
    assert_rejected(
        env.send_employer(ix),
        E_CONSTRAINT_SEEDS,
        "void_stale_revision against trial PDA",
    );
}

#[test]
fn streaming_cannot_use_void_stale_revision() {
    let mut env = setup(TOTAL_AMOUNT);
    let now = env.now();
    env.create(&streaming_args(1, now)).unwrap();
    env.accept(1).unwrap();
    env.approve_activation(1).unwrap();
    let contract = env.contract_pda(1);
    let c = env.read_contract(&contract);
    assert_eq!(c.payment_mode, PaymentMode::Streaming);
    assert_eq!(c.work_unit_count, 0);

    let missing = env.work_unit_pda(&contract, 0);
    let ix = env.void_ix(env.employer_pk, contract, missing);
    assert_rejected(
        env.send_employer(ix),
        E_ACCOUNT_NOT_INITIALIZED,
        "streaming void_stale_revision",
    );
}

#[test]
fn double_void_does_not_mutate_counters_twice() {
    let mut env = setup(TOTAL_AMOUNT);
    let id = revising_fixed(&mut env);
    env.warp(
        env.read_work_unit(&env.work_unit_pda(&env.contract_pda(id), 0))
            .action_deadline,
    );
    env.void_stale(id, 0).unwrap();
    let after_first = env.read_contract(&env.contract_pda(id));
    assert_eq!(after_first.voided_unit_count, 1);
    assert_eq!(after_first.open_review_count, 0);

    env.svm.expire_blockhash();
    assert_rejected(env.void_stale(id, 0), E_UNIT_VOIDED, "double void");

    let after_second = env.read_contract(&env.contract_pda(id));
    assert_eq!(after_second.voided_unit_count, 1);
    assert_eq!(after_second.open_review_count, 0);
    assert_eq!(after_second.released_amount, 0);
    assert_eq!(after_second.released_unit_count, 0);
    assert_eq!(env.escrow_amount(id), TOTAL_AMOUNT);
    assert_eq!(
        env.read_work_unit(&env.work_unit_pda(&env.contract_pda(id), 0))
            .status,
        WorkUnitStatus::Void
    );
}
