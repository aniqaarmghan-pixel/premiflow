//! StreamPay V2 Phase 9 tests: dispute freeze and resolver settlement.
//!
//! Opening and resolving move zero SPL tokens. Phase 8 claims the frozen split.

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
    self as streampay_program, Contract, ContractStatus, CreateContractArgs, DisputeParty,
    PaymentMode, StartMode,
};

const E_INVALID_STATE: u32 = 6111;
const E_CONTRACT_TERMINAL: u32 = 6113;
const E_UNAUTHORIZED: u32 = 6118;
const E_ACCOUNT_NOT_INITIALIZED: u32 = 3012;
const E_NOTHING_TO_WITHDRAW: u32 = 6139;
const E_NOTHING_TO_REFUND: u32 = 6140;
const E_DISPUTE_NOT_ALLOWED: u32 = 6159;
const E_ALREADY_DISPUTED: u32 = 6160;
const E_INVALID_AWARD: u32 = 6161;

const MINT_DECIMALS: u8 = 6;
const BASE_TS: i64 = 1_700_000_000;
const TOTAL_AMOUNT: u64 = 1_000_000;
const TRIAL_AMOUNT: u64 = 50_000;
const MAIN_AMOUNT: u64 = 950_000;
const DURATION: i64 = 60;
const INTERVAL: i64 = 20;
const REVIEW: i64 = 10;
const OFFSET: i64 = 30;
const SUBMISSION_URI: &str = "ipfs://bafyDisputeWork";
const SUBMISSION_HASH: [u8; 32] = [16u8; 32];

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

    fn open_ix(&self, party: Address, contract: Address) -> Instruction {
        Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::OpenDispute { party, contract }
                .to_account_metas(None),
            data: streampay_program::instruction::OpenDispute {}.data(),
        }
    }

    fn open_as_employer(&mut self, contract_id: u64) -> TransactionResult {
        let ix = self.open_ix(self.employer_pk, self.contract_pda(contract_id));
        self.send_employer(ix)
    }

    fn open_as_freelancer(&mut self, contract_id: u64) -> TransactionResult {
        let ix = self.open_ix(self.freelancer_pk, self.contract_pda(contract_id));
        self.send_freelancer(ix)
    }

    fn resolve_ix(
        &self,
        resolver: Address,
        contract: Address,
        freelancer_contested_award: u64,
    ) -> Instruction {
        Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::ResolveDispute { resolver, contract }
                .to_account_metas(None),
            data: streampay_program::instruction::ResolveDispute {
                freelancer_contested_award,
            }
            .data(),
        }
    }

    fn resolve(&mut self, contract_id: u64, award: u64) -> TransactionResult {
        let ix = self.resolve_ix(self.resolver_pk, self.contract_pda(contract_id), award);
        self.send_resolver(ix)
    }

    fn read_contract(&self, contract: &Address) -> Contract {
        let account = self.svm.get_account(contract).expect("contract missing");
        let mut data: &[u8] = &account.data;
        Contract::try_deserialize(&mut data).expect("deserialize contract")
    }

    fn assert_escrow_unchanged(&self, contract_id: u64, expected: u64) {
        assert_eq!(self.escrow_amount(contract_id), expected);
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

fn activate_milestone(env: &mut Env, id: u64, amounts: &[u64]) {
    let total: u64 = amounts.iter().sum();
    let args = milestone_args(env, id, total, env.now());
    env.create(&args).unwrap();
    let mut offset = OFFSET;
    for amount in amounts {
        env.add_milestone(id, *amount, offset).unwrap();
        offset += OFFSET;
    }
    env.finalize_terms(id).unwrap();
    env.accept(id).unwrap();
    env.approve_activation(id).unwrap();
}

#[test]
fn parties_can_open_outsiders_cannot() {
    let mut env = setup(TOTAL_AMOUNT * 2);
    activate_fixed(&mut env, 1, TOTAL_AMOUNT, 0);
    env.submit_work(1, 0).unwrap();
    env.open_as_employer(1).unwrap();
    let c = env.read_contract(&env.contract_pda(1));
    assert_eq!(c.status, ContractStatus::Disputed);
    assert_eq!(c.dispute_initiator, DisputeParty::Employer);
    assert_eq!(c.contested_amount, TOTAL_AMOUNT);
    assert_eq!(c.resolver, env.resolver_pk);
    env.assert_escrow_unchanged(1, TOTAL_AMOUNT);
    assert_rejected(env.open_as_freelancer(1), E_ALREADY_DISPUTED, "second open");

    activate_fixed(&mut env, 2, TOTAL_AMOUNT, 0);
    env.open_as_freelancer(2).unwrap();
    assert_eq!(
        env.read_contract(&env.contract_pda(2)).dispute_initiator,
        DisputeParty::Freelancer
    );

    let contract = env.contract_pda(2);
    let outsider = clone_kp(&env.outsider);
    assert_rejected(
        env.send(env.open_ix(env.outsider_pk, contract), &outsider),
        E_UNAUTHORIZED,
        "third party open",
    );
    assert_rejected(
        env.send_employer(env.open_ix(env.employer_pk, Keypair::new().pubkey())),
        E_ACCOUNT_NOT_INITIALIZED,
        "fake contract",
    );
}

#[test]
fn only_canonical_resolver_can_resolve() {
    let mut env = setup(TOTAL_AMOUNT);
    activate_fixed(&mut env, 1, TOTAL_AMOUNT, 0);
    env.open_as_employer(1).unwrap();
    let contract = env.contract_pda(1);
    let before = env.read_contract(&contract);

    assert_rejected(
        env.send_employer(env.resolve_ix(env.employer_pk, contract, 0)),
        E_UNAUTHORIZED,
        "employer resolve",
    );
    assert_rejected(
        env.send_freelancer(env.resolve_ix(env.freelancer_pk, contract, 0)),
        E_UNAUTHORIZED,
        "freelancer resolve",
    );
    let outsider = clone_kp(&env.outsider);
    assert_rejected(
        env.send(env.resolve_ix(env.outsider_pk, contract, 0), &outsider),
        E_UNAUTHORIZED,
        "third party resolve",
    );
    assert_eq!(env.read_contract(&contract).status, before.status);
    env.resolve(1, 0).unwrap();
    assert_eq!(
        env.read_contract(&contract).status,
        ContractStatus::Resolved
    );
}

#[test]
fn resolver_is_stored_and_immutable() {
    let mut env = setup(TOTAL_AMOUNT);
    activate_streaming(&mut env, 1, TOTAL_AMOUNT);
    let c = env.read_contract(&env.contract_pda(1));
    assert_eq!(c.resolver, env.resolver_pk);
    assert_ne!(c.resolver, c.employer);
    assert_ne!(c.resolver, c.freelancer);
    assert_ne!(c.resolver, Pubkey::default());
}

#[test]
fn streaming_dispute_freezes_accrual() {
    let mut env = setup(10);
    let start = activate_streaming(&mut env, 1, 10);
    env.warp(start + 20);
    env.open_as_employer(1).unwrap();
    let c = env.read_contract(&env.contract_pda(1));
    assert_eq!(c.stream_released_amount, 3);
    assert_eq!(c.released_amount, 3);
    assert_eq!(c.contested_amount, 7);
    env.assert_escrow_unchanged(1, 10);

    env.warp(start + 10_000);
    assert_rejected(
        env.release_stream(1),
        E_INVALID_STATE,
        "post-dispute stream",
    );
    assert_eq!(
        env.read_contract(&env.contract_pda(1))
            .stream_released_amount,
        3
    );
}

#[test]
fn streaming_partial_release_then_dispute_adds_delta() {
    let mut env = setup(10);
    let start = activate_streaming(&mut env, 1, 10);
    env.warp(start + 20);
    env.release_stream(1).unwrap();
    env.warp(start + 40);
    env.open_as_freelancer(1).unwrap();
    let c = env.read_contract(&env.contract_pda(1));
    assert_eq!(c.stream_released_amount, 6);
    assert_eq!(c.released_amount, 6);
    assert_eq!(c.contested_amount, 4);
}

#[test]
fn trial_plus_stream_dispute_does_not_double_count() {
    let mut env = setup(TOTAL_AMOUNT);
    let mut args = streaming_args(&env, 1, TOTAL_AMOUNT, env.now());
    args.trial_amount = TRIAL_AMOUNT;
    env.create(&args).unwrap();
    env.accept(1).unwrap();
    env.submit_trial(1).unwrap();
    env.approve_trial(1).unwrap();
    let start = env.read_contract(&env.contract_pda(1)).start_time;
    env.warp(start + DURATION / 2);
    env.open_as_employer(1).unwrap();
    let c = env.read_contract(&env.contract_pda(1));
    let stream = MAIN_AMOUNT / 2;
    assert_eq!(c.released_amount, TRIAL_AMOUNT + stream);
    assert_eq!(c.stream_released_amount, stream);
    assert_eq!(c.contested_amount, TOTAL_AMOUNT - TRIAL_AMOUNT - stream);
}

#[test]
fn fixed_and_milestone_dispute_protects_released_and_blocks_review() {
    let mut env = setup(TOTAL_AMOUNT * 2);
    activate_fixed(&mut env, 1, TOTAL_AMOUNT, TRIAL_AMOUNT);
    env.submit_work(1, 0).unwrap();
    let escrow = env.escrow_amount(1);
    env.open_as_employer(1).unwrap();
    let c = env.read_contract(&env.contract_pda(1));
    assert_eq!(c.released_amount, TRIAL_AMOUNT);
    assert_eq!(c.contested_amount, MAIN_AMOUNT);
    assert_rejected(env.approve_work(1, 0), E_INVALID_STATE, "approve bypass");
    assert_rejected(env.timeout(1, 0), E_INVALID_STATE, "timeout bypass");
    assert_rejected(
        env.request_revision(1, 0),
        E_INVALID_STATE,
        "revision bypass",
    );
    assert_rejected(env.submit_work(1, 0), E_INVALID_STATE, "submit bypass");
    env.assert_escrow_unchanged(1, escrow);

    activate_milestone(&mut env, 2, &[400_000, 600_000]);
    env.submit_work(2, 0).unwrap();
    env.approve_work(2, 0).unwrap();
    env.submit_work(2, 1).unwrap();
    env.open_as_freelancer(2).unwrap();
    let m = env.read_contract(&env.contract_pda(2));
    assert_eq!(m.released_amount, 400_000);
    assert_eq!(m.contested_amount, 600_000);
    env.resolve(2, 0).unwrap();
    let resolved = env.read_contract(&env.contract_pda(2));
    assert_eq!(resolved.freelancer_settlement_amount, 400_000);
    assert_eq!(resolved.employer_refundable_amount, 600_000);
}

#[test]
fn unresolved_trial_reject_is_resolvable_dispute() {
    let mut env = setup(TOTAL_AMOUNT);
    let mut args = streaming_args(&env, 1, TOTAL_AMOUNT, env.now());
    args.trial_amount = TRIAL_AMOUNT;
    env.create(&args).unwrap();
    env.accept(1).unwrap();
    env.submit_trial(1).unwrap();
    env.reject_activation(1, true).unwrap();
    let c = env.read_contract(&env.contract_pda(1));
    assert_eq!(c.status, ContractStatus::Disputed);
    assert_eq!(c.contested_amount, TOTAL_AMOUNT);
    assert_eq!(c.released_amount, 0);
    env.resolve(1, TRIAL_AMOUNT).unwrap();
    let r = env.read_contract(&env.contract_pda(1));
    assert_eq!(r.status, ContractStatus::Resolved);
    assert_eq!(r.freelancer_settlement_amount, TRIAL_AMOUNT);
    assert_eq!(r.employer_refundable_amount, MAIN_AMOUNT);
}

#[test]
fn withdrawn_trial_cannot_be_clawed_back() {
    let mut env = setup(TOTAL_AMOUNT);
    activate_fixed(&mut env, 1, TOTAL_AMOUNT, TRIAL_AMOUNT);
    env.withdraw(1).unwrap();
    env.open_as_employer(1).unwrap();
    env.resolve(1, 0).unwrap();
    let c = env.read_contract(&env.contract_pda(1));
    assert_eq!(c.freelancer_settlement_amount, TRIAL_AMOUNT);
    assert_eq!(c.withdrawn_amount, TRIAL_AMOUNT);
    assert!(c.freelancer_settlement_amount >= c.withdrawn_amount);
    assert_eq!(c.employer_refundable_amount, MAIN_AMOUNT);
}

#[test]
fn resolution_extremes_conservation_and_zero_tokens() {
    fn run(award: u64) -> (u64, u64, u64) {
        let mut env = setup(10);
        activate_fixed(&mut env, 1, 10, 0);
        env.open_as_employer(1).unwrap();
        let escrow_before = env.escrow_amount(1);
        env.resolve(1, award).unwrap();
        let c = env.read_contract(&env.contract_pda(1));
        assert_eq!(env.escrow_amount(1), escrow_before);
        assert_eq!(
            c.freelancer_settlement_amount + c.employer_refundable_amount,
            10
        );
        assert_eq!(c.released_amount, c.freelancer_settlement_amount);
        (
            c.freelancer_settlement_amount,
            c.employer_refundable_amount,
            env.escrow_amount(1),
        )
    }
    assert_eq!(run(10), (10, 0, 10));
    assert_eq!(run(0), (0, 10, 10));
    assert_eq!(run(4), (4, 6, 10));
}

#[test]
fn invalid_award_and_second_resolution_rejected() {
    let mut env = setup(10);
    activate_fixed(&mut env, 1, 10, 0);
    env.open_as_employer(1).unwrap();
    let before = env.read_contract(&env.contract_pda(1));
    assert_rejected(
        env.resolve(1, 11),
        E_INVALID_AWARD,
        "award exceeds contested",
    );
    assert_eq!(
        env.read_contract(&env.contract_pda(1)).status,
        before.status
    );
    env.resolve(1, 3).unwrap();
    assert_rejected(env.resolve(1, 3), E_INVALID_STATE, "second resolution");
}

#[test]
fn phase_eight_claims_after_resolution_are_order_independent() {
    fn settle(freelancer_first: bool) -> (u64, u64, u64, u64, u64) {
        let mut env = setup(10);
        let start = activate_streaming(&mut env, 1, 10);
        env.warp(start + 20);
        env.release_stream(1).unwrap();
        env.withdraw(1).unwrap();
        env.open_as_employer(1).unwrap();
        // frozen released=3, contested=7; award 3 more to freelancer → 6 / 4
        env.resolve(1, 3).unwrap();
        if freelancer_first {
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
fn disputed_blocks_cancel_refund_withdraw_and_lifecycle() {
    let mut env = setup(TOTAL_AMOUNT);
    activate_fixed(&mut env, 1, TOTAL_AMOUNT, 0);
    env.submit_work(1, 0).unwrap();
    env.open_as_employer(1).unwrap();
    assert_rejected(env.cancel(1), E_CONTRACT_TERMINAL, "cancel while disputed");
    assert_rejected(env.refund(1), E_CONTRACT_TERMINAL, "refund while disputed");
    assert_rejected(
        env.withdraw(1),
        E_CONTRACT_TERMINAL,
        "withdraw while disputed",
    );
    assert_rejected(env.approve_work(1, 0), E_INVALID_STATE, "approve");
    assert_rejected(env.timeout(1, 0), E_INVALID_STATE, "timeout");
}

#[test]
fn pending_and_cancelled_cannot_open_dispute() {
    let mut env = setup(TOTAL_AMOUNT * 2);
    env.create(&streaming_args(&env, 1, TOTAL_AMOUNT, env.now()))
        .unwrap();
    assert_rejected(
        env.open_as_employer(1),
        E_DISPUTE_NOT_ALLOWED,
        "pending acceptance",
    );
    env.accept(1).unwrap();
    assert_rejected(
        env.open_as_employer(1),
        E_DISPUTE_NOT_ALLOWED,
        "pending approval without open review",
    );

    activate_fixed(&mut env, 2, TOTAL_AMOUNT, 0);
    env.cancel(2).unwrap();
    assert_rejected(
        env.open_as_employer(2),
        E_CONTRACT_TERMINAL,
        "cancelled reopen",
    );
}

#[test]
fn full_claims_after_resolution_reject_doubles() {
    let mut env = setup(10);
    activate_fixed(&mut env, 1, 10, 0);
    env.open_as_employer(1).unwrap();
    env.resolve(1, 4).unwrap();
    env.withdraw(1).unwrap();
    env.refund(1).unwrap();
    assert_eq!(env.escrow_amount(1), 0);
    assert_rejected(env.withdraw(1), E_NOTHING_TO_WITHDRAW, "double withdraw");
    assert_rejected(env.refund(1), E_NOTHING_TO_REFUND, "double refund");
}
