//! StreamPay V2 Phase 11: cross-phase adversarial invariants.
//!
//! Does not re-prove every Phase 1–10 happy path. It attacks substitutions,
//! double execution, races, arithmetic, and terminal conservation.

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
    self as streampay_program, canonical_stream_accrued, Contract, ContractStatus,
    CreateContractArgs, PaymentMode, StartMode, CONTRACT_INIT_SPACE, WORK_UNIT_INIT_SPACE,
};

const E_INVALID_STATE: u32 = 6111;
const E_CONTRACT_TERMINAL: u32 = 6113;
const E_UNAUTHORIZED: u32 = 6118;
const E_CONSTRAINT_SEEDS: u32 = 2006;
const E_CONSTRAINT_TOKEN_MINT: u32 = 2014;
const E_CONSTRAINT_TOKEN_OWNER: u32 = 2015;
const E_ACCOUNT_NOT_INITIALIZED: u32 = 3012;
const E_UNIT_NOT_UNDER_REVIEW: u32 = 6127;
const E_UNIT_ALREADY_RELEASED: u32 = 6128;
const E_REVIEW_WINDOW_OPEN: u32 = 6132;
const E_NOTHING_TO_WITHDRAW: u32 = 6139;
const E_NOTHING_TO_REFUND: u32 = 6140;
const E_ALREADY_DISPUTED: u32 = 6160;
const E_INVALID_AWARD: u32 = 6161;
const E_UNRESOLVED_WORK: u32 = 6163;
const E_NOT_READY: u32 = 6164;
const E_ALREADY_COMPLETED: u32 = 6165;

const MINT_DECIMALS: u8 = 6;
const BASE_TS: i64 = 1_700_000_000;
const TOTAL: u64 = 1_000_000;
const TRIAL: u64 = 50_000;
const DURATION: i64 = 60;
const INTERVAL: i64 = 20;
const REVIEW: i64 = 10;
const OFFSET: i64 = 30;
const URI: &str = "ipfs://bafySecurityWork";
const HASH: [u8; 32] = [18u8; 32];

fn clone_kp(kp: &Keypair) -> Keypair {
    kp.insecure_clone()
}

struct Snapshot {
    status: ContractStatus,
    released: u64,
    withdrawn: u64,
    refunded: u64,
    settlement_f: u64,
    settlement_e: u64,
    open_review: u16,
    escrow: u64,
    freelancer: u64,
    employer: u64,
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
    resolver_b: Keypair,
    resolver_b_pk: Address,
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
    let resolver_b = Keypair::new();
    let outsider = Keypair::new();
    let employer_pk = employer.pubkey();
    let freelancer_pk = freelancer.pubkey();
    let resolver_pk = resolver.pubkey();
    let resolver_b_pk = resolver_b.pubkey();
    let outsider_pk = outsider.pubkey();
    for pk in [
        &employer_pk,
        &freelancer_pk,
        &resolver_pk,
        &resolver_b_pk,
        &outsider_pk,
    ] {
        svm.airdrop(pk, 10_000_000_000).unwrap();
    }

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
        resolver_b,
        resolver_b_pk,
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

    fn read_contract(&self, contract: &Address) -> Contract {
        let account = self.svm.get_account(contract).expect("contract missing");
        let mut data: &[u8] = &account.data;
        Contract::try_deserialize(&mut data).expect("deserialize contract")
    }

    fn snapshot(&self, id: u64) -> Snapshot {
        let c = self.read_contract(&self.contract_pda(id));
        Snapshot {
            status: c.status,
            released: c.released_amount,
            withdrawn: c.withdrawn_amount,
            refunded: c.refunded_amount,
            settlement_f: c.freelancer_settlement_amount,
            settlement_e: c.employer_refundable_amount,
            open_review: c.open_review_count,
            escrow: self.escrow_amount(id),
            freelancer: self.token_balance(&self.freelancer_token_account),
            employer: self.token_balance(&self.employer_token_account),
        }
    }

    fn assert_unchanged(&self, id: u64, before: &Snapshot) {
        let after = self.snapshot(id);
        assert_eq!(after.status, before.status);
        assert_eq!(after.released, before.released);
        assert_eq!(after.withdrawn, before.withdrawn);
        assert_eq!(after.refunded, before.refunded);
        assert_eq!(after.settlement_f, before.settlement_f);
        assert_eq!(after.settlement_e, before.settlement_e);
        assert_eq!(after.open_review, before.open_review);
        assert_eq!(after.escrow, before.escrow);
        assert_eq!(after.freelancer, before.freelancer);
        assert_eq!(after.employer, before.employer);
    }

    fn assert_conservation(&self, id: u64, funded: u64) {
        let c = self.read_contract(&self.contract_pda(id));
        let escrow = self.escrow_amount(id);
        assert_eq!(
            escrow.checked_add(c.withdrawn_amount).unwrap() + c.refunded_amount,
            funded
        );
        assert!(c.withdrawn_amount <= c.released_amount);
        if c.status.allows_settlement_claims() {
            assert_eq!(
                c.freelancer_settlement_amount + c.employer_refundable_amount,
                c.total_amount
            );
            assert!(c.withdrawn_amount <= c.freelancer_settlement_amount);
            assert!(c.refunded_amount <= c.employer_refundable_amount);
            assert_eq!(c.released_amount, c.freelancer_settlement_amount);
        }
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

    fn add_milestone(&mut self, id: u64, amount: u64, due: i64) -> TransactionResult {
        let contract = self.contract_pda(id);
        let current = self.read_contract(&contract);
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::AddMilestone {
                employer: self.employer_pk,
                contract,
                work_unit: self.work_unit_pda(&contract, current.work_unit_count),
                system_program: anchor_lang::system_program::ID,
            }
            .to_account_metas(None),
            data: streampay_program::instruction::AddMilestone {
                amount,
                due_offset_seconds: due,
            }
            .data(),
        };
        self.send_employer(ix)
    }

    fn finalize_terms(&mut self, id: u64) -> TransactionResult {
        self.send_employer(Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::FinalizeTerms {
                employer: self.employer_pk,
                contract: self.contract_pda(id),
            }
            .to_account_metas(None),
            data: streampay_program::instruction::FinalizeTerms {}.data(),
        })
    }

    fn accept(&mut self, id: u64) -> TransactionResult {
        self.send_freelancer(Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::AcceptContract {
                freelancer: self.freelancer_pk,
                contract: self.contract_pda(id),
            }
            .to_account_metas(None),
            data: streampay_program::instruction::AcceptContract {}.data(),
        })
    }

    fn approve_activation(&mut self, id: u64) -> TransactionResult {
        self.send_employer(Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::ApproveActivation {
                employer: self.employer_pk,
                contract: self.contract_pda(id),
            }
            .to_account_metas(None),
            data: streampay_program::instruction::ApproveActivation {}.data(),
        })
    }

    fn submit_trial(&mut self, id: u64) -> TransactionResult {
        let contract = self.contract_pda(id);
        self.send_freelancer(Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::SubmitTrialWork {
                freelancer: self.freelancer_pk,
                contract,
                trial_work_unit: self.trial_pda(&contract),
            }
            .to_account_metas(None),
            data: streampay_program::instruction::SubmitTrialWork {
                submission_uri: URI.to_string(),
                submission_hash: HASH,
            }
            .data(),
        })
    }

    fn approve_trial(&mut self, id: u64) -> TransactionResult {
        let contract = self.contract_pda(id);
        self.send_employer(Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::ApproveTrialAndActivate {
                employer: self.employer_pk,
                contract,
                trial_work_unit: self.trial_pda(&contract),
            }
            .to_account_metas(None),
            data: streampay_program::instruction::ApproveTrialAndActivate {}.data(),
        })
    }

    fn submit_work(&mut self, id: u64, index: u32) -> TransactionResult {
        let contract = self.contract_pda(id);
        self.send_freelancer(Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::SubmitWorkUnit {
                freelancer: self.freelancer_pk,
                contract,
                work_unit: self.work_unit_pda(&contract, index),
            }
            .to_account_metas(None),
            data: streampay_program::instruction::SubmitWorkUnit {
                submission_uri: URI.to_string(),
                submission_hash: HASH,
            }
            .data(),
        })
    }

    fn approve_work(&mut self, id: u64, index: u32) -> TransactionResult {
        let contract = self.contract_pda(id);
        self.send_employer(Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::ApproveWorkUnit {
                employer: self.employer_pk,
                contract,
                work_unit: self.work_unit_pda(&contract, index),
            }
            .to_account_metas(None),
            data: streampay_program::instruction::ApproveWorkUnit {}.data(),
        })
    }

    fn request_revision(&mut self, id: u64, index: u32) -> TransactionResult {
        let contract = self.contract_pda(id);
        self.send_employer(Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::RequestRevision {
                employer: self.employer_pk,
                contract,
                work_unit: self.work_unit_pda(&contract, index),
            }
            .to_account_metas(None),
            data: streampay_program::instruction::RequestRevision {}.data(),
        })
    }

    fn timeout(&mut self, id: u64, index: u32) -> TransactionResult {
        let contract = self.contract_pda(id);
        self.send_outsider(Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::FinalizeReviewTimeout {
                caller: self.outsider_pk,
                contract,
                work_unit: self.work_unit_pda(&contract, index),
            }
            .to_account_metas(None),
            data: streampay_program::instruction::FinalizeReviewTimeout {}.data(),
        })
    }

    fn timeout_accounts(&mut self, work_unit: Address, contract: Address) -> TransactionResult {
        self.send_outsider(Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::FinalizeReviewTimeout {
                caller: self.outsider_pk,
                contract,
                work_unit,
            }
            .to_account_metas(None),
            data: streampay_program::instruction::FinalizeReviewTimeout {}.data(),
        })
    }

    fn release_stream(&mut self, id: u64) -> TransactionResult {
        self.send_freelancer(Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::ReleaseStreamAccrual {
                caller: self.freelancer_pk,
                contract: self.contract_pda(id),
            }
            .to_account_metas(None),
            data: streampay_program::instruction::ReleaseStreamAccrual {}.data(),
        })
    }

    fn cancel(&mut self, id: u64) -> TransactionResult {
        self.send_employer(Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::CancelActiveContract {
                employer: self.employer_pk,
                contract: self.contract_pda(id),
                hourly_state: None,
            }
            .to_account_metas(None),
            data: streampay_program::instruction::CancelActiveContract {}.data(),
        })
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

    fn withdraw(&mut self, id: u64) -> TransactionResult {
        let contract = self.contract_pda(id);
        self.send_freelancer(self.withdraw_ix(
            self.freelancer_pk,
            contract,
            self.escrow_pda(&contract),
            self.freelancer_token_account,
            self.token_mint,
            TOKEN_ID,
        ))
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

    fn refund(&mut self, id: u64) -> TransactionResult {
        let contract = self.contract_pda(id);
        self.send_employer(self.refund_ix(
            self.employer_pk,
            contract,
            self.escrow_pda(&contract),
            self.employer_token_account,
            self.token_mint,
            TOKEN_ID,
        ))
    }

    fn open_dispute(&mut self, id: u64) -> TransactionResult {
        self.send_employer(Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::OpenDispute {
                party: self.employer_pk,
                contract: self.contract_pda(id),
                hourly_state: None,
                hourly_session: None,
            }
            .to_account_metas(None),
            data: streampay_program::instruction::OpenDispute {}.data(),
        })
    }

    fn resolve_ix(&self, resolver: Address, contract: Address, award: u64) -> Instruction {
        Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::ResolveDispute { resolver, contract }
                .to_account_metas(None),
            data: streampay_program::instruction::ResolveDispute {
                freelancer_contested_award: award,
            }
            .data(),
        }
    }

    fn resolve(&mut self, id: u64, award: u64) -> TransactionResult {
        self.send_resolver(self.resolve_ix(self.resolver_pk, self.contract_pda(id), award))
    }

    fn complete(&mut self, id: u64) -> TransactionResult {
        self.send_outsider(Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::CompleteContract {
                caller: self.outsider_pk,
                contract: self.contract_pda(id),
            }
            .to_account_metas(None),
            data: streampay_program::instruction::CompleteContract {}.data(),
        })
    }
}

fn streaming_args(env: &Env, id: u64, total: u64, resolver: Address) -> CreateContractArgs {
    CreateContractArgs {
        contract_id: id,
        payment_mode: PaymentMode::Streaming,
        start_mode: StartMode::OnActivation,
        total_amount: total,
        acceptance_deadline: env.now() + 3_600,
        scheduled_start_time: 0,
        duration_seconds: DURATION,
        checkpoint_interval: INTERVAL,
        review_duration: REVIEW,
        activation_review_duration: 3_600,
        max_revisions: 2,
        trial_amount: 0,
        resolver,
        metadata_uri: "ipfs://bafyContractMetadata".to_string(),
        metadata_hash: [7u8; 32],
    }
}

fn fixed_args(env: &Env, id: u64, total: u64, resolver: Address) -> CreateContractArgs {
    CreateContractArgs {
        payment_mode: PaymentMode::Fixed,
        checkpoint_interval: 12_345,
        duration_seconds: 3_600,
        review_duration: 300,
        ..streaming_args(env, id, total, resolver)
    }
}

fn milestone_args(env: &Env, id: u64, total: u64, resolver: Address) -> CreateContractArgs {
    CreateContractArgs {
        payment_mode: PaymentMode::Milestone,
        checkpoint_interval: 12_345,
        duration_seconds: 3_600,
        review_duration: 300,
        ..streaming_args(env, id, total, resolver)
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
    env.create(&streaming_args(env, id, total, env.resolver_pk))
        .unwrap();
    env.accept(id).unwrap();
    env.approve_activation(id).unwrap();
    env.read_contract(&env.contract_pda(id)).start_time
}

fn activate_fixed(env: &mut Env, id: u64, total: u64, trial: u64) {
    let mut args = fixed_args(env, id, total, env.resolver_pk);
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
    let mut args = milestone_args(env, id, main + trial, env.resolver_pk);
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

fn drain_completed_or_cancelled(env: &mut Env, id: u64) {
    let _ = env.withdraw(id);
    let _ = env.refund(id);
}

#[test]
fn layout_space_constants_match_program() {
    assert_eq!(CONTRACT_INIT_SPACE, 621);
    assert_eq!(WORK_UNIT_INIT_SPACE, 406);
}

#[test]
fn cross_contract_pda_and_resolver_substitution_is_atomic() {
    let mut env = setup(TOTAL * 2);
    activate_fixed(&mut env, 1, TOTAL, 0);
    env.submit_work(1, 0).unwrap();
    let mut args = fixed_args(&env, 2, TOTAL, env.resolver_b_pk);
    args.trial_amount = TRIAL;
    env.create(&args).unwrap();
    env.accept(2).unwrap();
    env.submit_trial(2).unwrap();
    env.approve_trial(2).unwrap();
    env.submit_work(2, 0).unwrap();

    let a = env.contract_pda(1);
    let b = env.contract_pda(2);
    let before_a = env.snapshot(1);
    let before_b = env.snapshot(2);

    assert_rejected(
        env.timeout_accounts(env.work_unit_pda(&b, 0), a),
        E_CONSTRAINT_SEEDS,
        "work unit B on contract A",
    );
    assert_rejected(
        env.timeout_accounts(env.work_unit_pda(&a, 0), b),
        E_CONSTRAINT_SEEDS,
        "work unit A on contract B",
    );
    assert_rejected(
        env.send_freelancer(Instruction {
            program_id: env.program_id,
            accounts: streampay_program::accounts::SubmitTrialWork {
                freelancer: env.freelancer_pk,
                contract: a,
                trial_work_unit: env.trial_pda(&b),
            }
            .to_account_metas(None),
            data: streampay_program::instruction::SubmitTrialWork {
                submission_uri: URI.to_string(),
                submission_hash: HASH,
            }
            .data(),
        }),
        E_CONSTRAINT_SEEDS,
        "trial B on contract A",
    );

    env.open_dispute(1).unwrap();
    assert_rejected(
        env.send(
            env.resolve_ix(env.resolver_b_pk, a, 0),
            &clone_kp(&env.resolver_b),
        ),
        E_UNAUTHORIZED,
        "resolver B on contract A",
    );
    env.assert_unchanged(2, &before_b);
    let after_a = env.snapshot(1);
    assert_eq!(after_a.escrow, before_a.escrow);
    assert_eq!(after_a.freelancer, before_a.freelancer);
}

#[test]
fn escrow_and_destination_substitution_is_atomic() {
    let mut env = setup(TOTAL * 2);
    activate_fixed(&mut env, 1, TOTAL, 0);
    env.submit_work(1, 0).unwrap();
    env.approve_work(1, 0).unwrap();
    env.complete(1).unwrap();
    activate_fixed(&mut env, 2, TOTAL, 0);
    env.cancel(2).unwrap();

    let a = env.contract_pda(1);
    let b = env.contract_pda(2);
    let before_a = env.snapshot(1);
    let before_b = env.snapshot(2);
    let outsider_dest = CreateAccount::new(&mut env.svm, &env.employer, &env.token_mint)
        .owner(&env.outsider_pk)
        .send()
        .unwrap();
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
            a,
            env.escrow_pda(&b),
            env.freelancer_token_account,
            env.token_mint,
            TOKEN_ID,
        )),
        E_CONSTRAINT_SEEDS,
        "escrow B on contract A",
    );
    assert_rejected(
        env.send_freelancer(env.withdraw_ix(
            env.freelancer_pk,
            a,
            env.escrow_pda(&a),
            outsider_dest,
            env.token_mint,
            TOKEN_ID,
        )),
        E_CONSTRAINT_TOKEN_OWNER,
        "attacker destination",
    );
    assert_rejected(
        env.send_freelancer(env.withdraw_ix(
            env.freelancer_pk,
            a,
            env.escrow_pda(&a),
            wrong_mint_dest,
            env.token_mint,
            TOKEN_ID,
        )),
        E_CONSTRAINT_TOKEN_MINT,
        "wrong mint dest",
    );
    assert_rejected(
        env.send_employer(env.refund_ix(
            env.employer_pk,
            b,
            env.escrow_pda(&a),
            env.employer_token_account,
            env.token_mint,
            TOKEN_ID,
        )),
        E_CONSTRAINT_SEEDS,
        "escrow A on refund B",
    );
    env.assert_unchanged(1, &before_a);
    env.assert_unchanged(2, &before_b);
}

#[test]
fn signer_substitution_is_rejected() {
    let mut env = setup(TOTAL);
    activate_fixed(&mut env, 1, TOTAL, 0);
    env.submit_work(1, 0).unwrap();
    let before = env.snapshot(1);
    let contract = env.contract_pda(1);

    assert_rejected(
        env.send_freelancer(Instruction {
            program_id: env.program_id,
            accounts: streampay_program::accounts::ApproveWorkUnit {
                employer: env.freelancer_pk,
                contract,
                work_unit: env.work_unit_pda(&contract, 0),
            }
            .to_account_metas(None),
            data: streampay_program::instruction::ApproveWorkUnit {}.data(),
        }),
        E_CONSTRAINT_SEEDS,
        "freelancer as employer",
    );
    assert_rejected(
        env.send_outsider(Instruction {
            program_id: env.program_id,
            accounts: streampay_program::accounts::ApproveWorkUnit {
                employer: env.outsider_pk,
                contract,
                work_unit: env.work_unit_pda(&contract, 0),
            }
            .to_account_metas(None),
            data: streampay_program::instruction::ApproveWorkUnit {}.data(),
        }),
        E_CONSTRAINT_SEEDS,
        "third party approve",
    );
    assert_rejected(
        env.send_employer(Instruction {
            program_id: env.program_id,
            accounts: streampay_program::accounts::SubmitWorkUnit {
                freelancer: env.employer_pk,
                contract,
                work_unit: env.work_unit_pda(&contract, 0),
            }
            .to_account_metas(None),
            data: streampay_program::instruction::SubmitWorkUnit {
                submission_uri: URI.to_string(),
                submission_hash: HASH,
            }
            .data(),
        }),
        E_CONSTRAINT_SEEDS,
        "employer as freelancer",
    );
    env.assert_unchanged(1, &before);
}

#[test]
fn double_execution_does_not_duplicate_value() {
    let mut env = setup(TOTAL * 2 + 10);
    activate_fixed(&mut env, 1, TOTAL, 0);
    assert_rejected(env.accept(1), E_INVALID_STATE, "second accept");
    assert_rejected(
        env.approve_activation(1),
        E_INVALID_STATE,
        "second activation",
    );
    env.submit_work(1, 0).unwrap();
    assert_rejected(env.submit_work(1, 0), 6126, "second submit");
    env.approve_work(1, 0).unwrap();
    let released = env.read_contract(&env.contract_pda(1)).released_amount;
    assert_rejected(
        env.approve_work(1, 0),
        E_UNIT_ALREADY_RELEASED,
        "second approve",
    );
    assert_eq!(
        env.read_contract(&env.contract_pda(1)).released_amount,
        released
    );
    env.complete(1).unwrap();
    assert_rejected(env.complete(1), E_ALREADY_COMPLETED, "second complete");
    env.withdraw(1).unwrap();
    assert_rejected(env.withdraw(1), E_NOTHING_TO_WITHDRAW, "second withdraw");

    let start = activate_streaming(&mut env, 2, 10);
    env.warp(start + DURATION);
    env.release_stream(2).unwrap();
    let stream = env
        .read_contract(&env.contract_pda(2))
        .stream_released_amount;
    env.release_stream(2).unwrap();
    assert_eq!(
        env.read_contract(&env.contract_pda(2))
            .stream_released_amount,
        stream
    );
    env.cancel(2).unwrap();
    assert_rejected(env.cancel(2), E_CONTRACT_TERMINAL, "second cancel");
    env.withdraw(2).unwrap();
    assert_rejected(env.refund(2), E_NOTHING_TO_REFUND, "zero refund");

    activate_fixed(&mut env, 3, TOTAL, 0);
    env.open_dispute(3).unwrap();
    assert_rejected(env.open_dispute(3), E_ALREADY_DISPUTED, "second dispute");
    env.resolve(3, 1).unwrap();
    assert_rejected(env.resolve(3, 1), E_INVALID_STATE, "second resolve");
}

#[test]
fn race_paths_are_deterministic() {
    let mut env = setup(TOTAL * 4);
    activate_fixed(&mut env, 1, TOTAL, 0);
    env.submit_work(1, 0).unwrap();
    env.warp(env.now() + 300);
    env.timeout(1, 0).unwrap();
    assert_rejected(
        env.approve_work(1, 0),
        E_UNIT_ALREADY_RELEASED,
        "approve after timeout",
    );

    activate_fixed(&mut env, 2, TOTAL, 0);
    env.submit_work(2, 0).unwrap();
    env.approve_work(2, 0).unwrap();
    env.warp(env.now() + 300);
    assert_rejected(
        env.timeout(2, 0),
        E_UNIT_ALREADY_RELEASED,
        "timeout after approve",
    );

    activate_fixed(&mut env, 3, TOTAL, 0);
    env.submit_work(3, 0).unwrap();
    env.open_dispute(3).unwrap();
    env.warp(env.now() + 300);
    assert_rejected(env.timeout(3, 0), E_INVALID_STATE, "timeout after dispute");
    assert_rejected(
        env.approve_work(3, 0),
        E_INVALID_STATE,
        "approve after dispute",
    );

    let start = activate_streaming(&mut env, 4, 10);
    env.warp(start + 20);
    env.release_stream(4).unwrap();
    env.cancel(4).unwrap();
    assert_rejected(
        env.release_stream(4),
        E_INVALID_STATE,
        "stream after cancel",
    );
    assert_rejected(
        env.complete(4),
        E_CONTRACT_TERMINAL,
        "complete after cancel",
    );
}

#[test]
fn streaming_on_chain_rounding_matches_formula_through_terminal_paths() {
    let mut env = setup(30);
    let start = activate_streaming(&mut env, 1, 7);
    let end = start + DURATION;
    for elapsed in [0i64, 1, 30, 59] {
        env.warp(start + elapsed);
        env.release_stream(1).unwrap();
        let expected = canonical_stream_accrued(7, start, end, start + elapsed).unwrap();
        assert_eq!(
            env.read_contract(&env.contract_pda(1))
                .stream_released_amount,
            expected
        );
    }
    env.warp(end + 1);
    env.complete(1).unwrap();
    let c = env.read_contract(&env.contract_pda(1));
    assert_eq!(c.stream_released_amount, 7);
    assert_eq!(c.freelancer_settlement_amount, 7);
    env.assert_conservation(1, 7);

    let start2 = activate_streaming(&mut env, 2, 7);
    env.warp(start2 + 5);
    env.open_dispute(2).unwrap();
    let d = env.read_contract(&env.contract_pda(2));
    assert_eq!(
        d.stream_released_amount,
        canonical_stream_accrued(7, start2, start2 + DURATION, start2 + 5).unwrap()
    );
    env.warp(start2 + DURATION + 100);
    assert_rejected(
        env.release_stream(2),
        E_INVALID_STATE,
        "no post-dispute accrual",
    );
    assert_eq!(
        env.read_contract(&env.contract_pda(2))
            .stream_released_amount,
        d.stream_released_amount
    );
}

#[test]
fn review_time_boundaries_and_stale_timeout() {
    let mut env = setup(TOTAL);
    activate_fixed(&mut env, 1, TOTAL, 0);
    env.submit_work(1, 0).unwrap();
    let submitted = env.now();
    env.warp(submitted + REVIEW - 1);
    assert_rejected(env.timeout(1, 0), E_REVIEW_WINDOW_OPEN, "deadline - 1");
    env.request_revision(1, 0).unwrap();
    env.warp(submitted + REVIEW + 1);
    assert_rejected(
        env.timeout(1, 0),
        E_UNIT_NOT_UNDER_REVIEW,
        "stale timeout after revision",
    );
    env.submit_work(1, 0).unwrap();
    let resubmit = env.now();
    env.warp(resubmit + 300);
    env.timeout(1, 0).unwrap();
    assert_eq!(
        env.read_contract(&env.contract_pda(1)).released_amount,
        TOTAL
    );
}

#[test]
fn full_lifecycle_conservation_across_modes_and_terminals() {
    let mut env = setup(TOTAL * 8 + 20);
    // Fixed complete
    activate_fixed(&mut env, 1, TOTAL, 0);
    env.submit_work(1, 0).unwrap();
    env.approve_work(1, 0).unwrap();
    env.complete(1).unwrap();
    drain_completed_or_cancelled(&mut env, 1);
    env.assert_conservation(1, TOTAL);
    assert_eq!(env.escrow_amount(1), 0);

    // Milestone complete with trial
    activate_milestone(&mut env, 2, &[400_000, 550_000], TRIAL);
    env.submit_work(2, 0).unwrap();
    env.approve_work(2, 0).unwrap();
    env.submit_work(2, 1).unwrap();
    env.approve_work(2, 1).unwrap();
    env.complete(2).unwrap();
    drain_completed_or_cancelled(&mut env, 2);
    env.assert_conservation(2, TOTAL);
    assert_eq!(env.escrow_amount(2), 0);

    // Streaming complete with trial
    let mut args = streaming_args(&env, 3, TOTAL, env.resolver_pk);
    args.trial_amount = TRIAL;
    env.create(&args).unwrap();
    env.accept(3).unwrap();
    env.submit_trial(3).unwrap();
    env.approve_trial(3).unwrap();
    let start = env.read_contract(&env.contract_pda(3)).start_time;
    env.warp(start + DURATION);
    env.complete(3).unwrap();
    drain_completed_or_cancelled(&mut env, 3);
    env.assert_conservation(3, TOTAL);
    assert_eq!(env.escrow_amount(3), 0);

    // Cancellation
    activate_fixed(&mut env, 4, TOTAL, TRIAL);
    env.cancel(4).unwrap();
    drain_completed_or_cancelled(&mut env, 4);
    env.assert_conservation(4, TOTAL);
    assert_eq!(env.escrow_amount(4), 0);

    // Dispute split
    activate_milestone(&mut env, 5, &[400_000, 600_000], 0);
    env.submit_work(5, 0).unwrap();
    env.approve_work(5, 0).unwrap();
    env.submit_work(5, 1).unwrap();
    env.open_dispute(5).unwrap();
    env.resolve(5, 100_000).unwrap();
    drain_completed_or_cancelled(&mut env, 5);
    env.assert_conservation(5, 1_000_000);
    assert_eq!(env.escrow_amount(5), 0);
    let r = env.read_contract(&env.contract_pda(5));
    assert_eq!(r.freelancer_settlement_amount, 500_000);
    assert_eq!(r.employer_refundable_amount, 500_000);
}

#[test]
fn terminal_freeze_matrix() {
    let mut env = setup(TOTAL * 3);
    activate_fixed(&mut env, 1, TOTAL, 0);
    env.submit_work(1, 0).unwrap();
    env.approve_work(1, 0).unwrap();
    env.complete(1).unwrap();
    for (label, result) in [
        ("submit", env.submit_work(1, 0)),
        ("revision", env.request_revision(1, 0)),
        ("approve", env.approve_work(1, 0)),
        ("timeout", env.timeout(1, 0)),
        ("cancel", env.cancel(1)),
        ("dispute", env.open_dispute(1)),
        ("stream", env.release_stream(1)),
    ] {
        assert!(result.is_err(), "{label} should fail on Completed");
    }
    assert_rejected(env.complete(1), E_ALREADY_COMPLETED, "complete twice");

    activate_fixed(&mut env, 2, TOTAL, 0);
    env.cancel(2).unwrap();
    assert_rejected(env.complete(2), E_CONTRACT_TERMINAL, "cancelled complete");
    assert_rejected(
        env.open_dispute(2),
        E_CONTRACT_TERMINAL,
        "cancelled dispute",
    );
    assert_rejected(env.submit_work(2, 0), E_INVALID_STATE, "cancelled submit");

    activate_fixed(&mut env, 3, TOTAL, 0);
    env.submit_work(3, 0).unwrap();
    env.open_dispute(3).unwrap();
    assert_rejected(env.approve_work(3, 0), E_INVALID_STATE, "disputed approve");
    assert_rejected(env.cancel(3), E_CONTRACT_TERMINAL, "disputed cancel");
    assert_rejected(env.complete(3), E_CONTRACT_TERMINAL, "disputed complete");
    assert_rejected(env.withdraw(3), E_CONTRACT_TERMINAL, "disputed withdraw");
    env.resolve(3, 0).unwrap();
    assert_rejected(env.complete(3), E_CONTRACT_TERMINAL, "resolved complete");
    assert_rejected(env.open_dispute(3), E_CONTRACT_TERMINAL, "resolved dispute");
}

#[test]
fn invalid_award_early_complete_and_fake_pda_leave_state_untouched() {
    let mut env = setup(TOTAL + 10);
    activate_fixed(&mut env, 1, TOTAL, 0);
    env.open_dispute(1).unwrap();
    let before = env.snapshot(1);
    assert_rejected(
        env.resolve(1, TOTAL + 1),
        E_INVALID_AWARD,
        "award too large",
    );
    env.assert_unchanged(1, &before);
    assert_rejected(
        env.send_employer(env.resolve_ix(env.employer_pk, env.contract_pda(1), 0)),
        E_UNAUTHORIZED,
        "employer resolve",
    );
    env.assert_unchanged(1, &before);

    let start = activate_streaming(&mut env, 2, 10);
    env.warp(start + DURATION - 1);
    let before_s = env.snapshot(2);
    assert_rejected(env.complete(2), E_NOT_READY, "early complete");
    env.assert_unchanged(2, &before_s);
    assert_rejected(
        env.send_employer(Instruction {
            program_id: env.program_id,
            accounts: streampay_program::accounts::CompleteContract {
                caller: env.employer_pk,
                contract: Keypair::new().pubkey(),
            }
            .to_account_metas(None),
            data: streampay_program::instruction::CompleteContract {}.data(),
        }),
        E_ACCOUNT_NOT_INITIALIZED,
        "fake contract",
    );
    env.assert_unchanged(2, &before_s);
}

#[test]
fn permissionless_complete_cannot_skip_unresolved_fixed() {
    let mut env = setup(TOTAL);
    activate_fixed(&mut env, 1, TOTAL, 0);
    env.submit_work(1, 0).unwrap();
    let before = env.snapshot(1);
    assert_rejected(env.complete(1), E_UNRESOLVED_WORK, "outsider skip review");
    env.assert_unchanged(1, &before);
    assert_eq!(before.open_review, 1);
}

#[test]
fn claim_order_after_dispute_and_completion_conserves() {
    fn dispute_order(freelancer_first: bool) -> (u64, u64, u64) {
        let mut env = setup(10);
        let start = activate_streaming(&mut env, 1, 10);
        env.warp(start + 20);
        env.release_stream(1).unwrap();
        env.withdraw(1).unwrap();
        env.open_dispute(1).unwrap();
        env.resolve(1, 3).unwrap();
        if freelancer_first {
            env.withdraw(1).unwrap();
            env.refund(1).unwrap();
        } else {
            env.refund(1).unwrap();
            env.withdraw(1).unwrap();
        }
        let c = env.read_contract(&env.contract_pda(1));
        assert_eq!(c.withdrawn_amount + c.refunded_amount, 10);
        assert_eq!(env.escrow_amount(1), 0);
        (c.withdrawn_amount, c.refunded_amount, env.escrow_amount(1))
    }
    assert_eq!(dispute_order(true), dispute_order(false));
}
