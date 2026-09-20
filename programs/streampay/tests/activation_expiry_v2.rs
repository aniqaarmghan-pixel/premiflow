//! StreamPay V2 T4: permissionless activation-window expiry.
//!
//! After accept, if the activation window closes before the main engagement
//! starts, any signer may freeze a full employer refund. Submitted/Revising
//! trials are excluded. No SPL transfer. Not a dispute. Rebuild
//! `target/deploy/streampay.so` after program changes.

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
    CreateContractArgs, CreateHourlyContractArgs, DisputeParty, HourlyState, PaymentMode,
    ReleaseTrigger, StartMode, WorkUnit, WorkUnitKind, WorkUnitStatus,
};

const E_INVALID_STATE: u32 = 6111;
const E_APPROVAL_WINDOW_EXPIRED: u32 = 6149;
const E_INVALID_TRIAL_STATE: u32 = 6154;
const E_NOTHING_TO_WITHDRAW: u32 = 6139;
const E_NOTHING_TO_REFUND: u32 = 6140;
const E_APPROVAL_WINDOW_NOT_EXPIRED: u32 = 6179;

const MINT_DECIMALS: u8 = 6;
const BASE_TS: i64 = 1_700_000_000;
const ACTIVATION_REVIEW: i64 = 3_600;
const TOTAL_AMOUNT: u64 = 1_000_000;
const TRIAL_AMOUNT: u64 = 50_000;
const MAIN_AMOUNT: u64 = 950_000;
const OFFSET: i64 = 600;
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
    stranger: Keypair,
    stranger_pk: Address,
    resolver: Keypair,
    resolver_pk: Address,
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
    let stranger = Keypair::new();
    let resolver = Keypair::new();
    let employer_pk = employer.pubkey();
    let freelancer_pk = freelancer.pubkey();
    let stranger_pk = stranger.pubkey();
    let resolver_pk = resolver.pubkey();
    svm.airdrop(&employer_pk, 10_000_000_000).unwrap();
    svm.airdrop(&freelancer_pk, 1_000_000_000).unwrap();
    svm.airdrop(&stranger_pk, 1_000_000_000).unwrap();
    svm.airdrop(&resolver_pk, 1_000_000_000).unwrap();

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
        stranger,
        stranger_pk,
        resolver,
        resolver_pk,
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

    fn expire_acceptance(&mut self, contract_id: u64) -> TransactionResult {
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::ExpireAcceptance {
                caller: self.stranger_pk,
                contract: self.contract_pda(contract_id),
            }
            .to_account_metas(None),
            data: streampay_program::instruction::ExpireAcceptance {}.data(),
        };
        self.send(ix, &clone_kp(&self.stranger))
    }

    fn expire_activation(&mut self, contract_id: u64) -> TransactionResult {
        self.expire_activation_as(&clone_kp(&self.stranger), contract_id)
    }

    fn expire_activation_as(&mut self, signer: &Keypair, contract_id: u64) -> TransactionResult {
        let contract = self.contract_pda(contract_id);
        let trial = if self.read_contract(&contract).trial_amount > 0 {
            Some(self.trial_pda(&contract))
        } else {
            None
        };
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::ExpireActivation {
                caller: signer.pubkey(),
                contract,
                trial_work_unit: trial,
            }
            .to_account_metas(None),
            data: streampay_program::instruction::ExpireActivation {}.data(),
        };
        self.send(ix, signer)
    }

    fn approve(&mut self, contract_id: u64) -> TransactionResult {
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

    fn reject(&mut self, contract_id: u64) -> TransactionResult {
        let contract = self.contract_pda(contract_id);
        let trial = if self.read_contract(&contract).trial_amount > 0 {
            Some(self.trial_pda(&contract))
        } else {
            None
        };
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::RejectActivation {
                employer: self.employer_pk,
                contract,
                trial_work_unit: trial,
            }
            .to_account_metas(None),
            data: streampay_program::instruction::RejectActivation {}.data(),
        };
        self.send_employer(ix)
    }

    fn settle_trial(&mut self, contract_id: u64) -> TransactionResult {
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
                submission_uri: "ipfs://bafyT4".to_string(),
                submission_hash: [9u8; 32],
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
                submission_uri: "ipfs://bafyT4Work".to_string(),
                submission_hash: [8u8; 32],
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

    fn complete(&mut self, contract_id: u64) -> TransactionResult {
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::CompleteContract {
                caller: self.stranger_pk,
                contract: self.contract_pda(contract_id),
            }
            .to_account_metas(None),
            data: streampay_program::instruction::CompleteContract {}.data(),
        };
        self.send(ix, &clone_kp(&self.stranger))
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

    fn start_hourly(&mut self, contract_id: u64) -> TransactionResult {
        let contract = self.contract_pda(contract_id);
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::StartHourlySession {
                freelancer: self.freelancer_pk,
                contract,
                hourly_state: self.hourly_state_pda(&contract),
                hourly_session: self.hourly_session_pda(&contract, 0),
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

fn streaming_args(env: &Env, contract_id: u64) -> CreateContractArgs {
    CreateContractArgs {
        contract_id,
        payment_mode: PaymentMode::Streaming,
        start_mode: StartMode::OnActivation,
        total_amount: TOTAL_AMOUNT,
        acceptance_deadline: env.now() + 3_600,
        scheduled_start_time: 0,
        duration_seconds: 3_600,
        checkpoint_interval: 900,
        review_duration: 300,
        activation_review_duration: ACTIVATION_REVIEW,
        max_revisions: 2,
        trial_amount: TRIAL_AMOUNT,
        resolver: env.resolver_pk,
        metadata_uri: "ipfs://bafyT4Offer".to_string(),
        metadata_hash: [7u8; 32],
    }
}

fn fixed_args(env: &Env, contract_id: u64) -> CreateContractArgs {
    CreateContractArgs {
        payment_mode: PaymentMode::Fixed,
        checkpoint_interval: 0,
        duration_seconds: 3_600,
        review_duration: 300,
        ..streaming_args(env, contract_id)
    }
}

fn fixed_no_trial_args(env: &Env, contract_id: u64) -> CreateContractArgs {
    CreateContractArgs {
        trial_amount: 0,
        ..fixed_args(env, contract_id)
    }
}

fn milestone_args(env: &Env, contract_id: u64) -> CreateContractArgs {
    CreateContractArgs {
        payment_mode: PaymentMode::Milestone,
        checkpoint_interval: 0,
        duration_seconds: 3_600,
        review_duration: 300,
        ..streaming_args(env, contract_id)
    }
}

fn hourly_args(env: &Env, contract_id: u64) -> CreateHourlyContractArgs {
    CreateHourlyContractArgs {
        contract_id,
        hourly_rate: HOURLY_RATE,
        authorized_seconds: HOURLY_AUTHORIZED,
        acceptance_deadline: env.now() + 3_600,
        duration_seconds: 86_400,
        review_duration: 300,
        activation_review_duration: ACTIVATION_REVIEW,
        max_revisions: 2,
        trial_amount: TRIAL_AMOUNT,
        resolver: env.resolver_pk,
        metadata_uri: "ipfs://bafyT4Hourly".to_string(),
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

fn assert_t4_freeze(env: &Env, id: u64, expected_total: u64) {
    let contract = env.contract_pda(id);
    let c = env.read_contract(&contract);
    assert_eq!(c.status, ContractStatus::ActivationRejected);
    assert!(c.status.allows_settlement_claims());
    assert_eq!(c.terminated_at, env.now());
    assert_eq!(c.start_time, 0);
    assert_eq!(c.end_time, 0);
    assert!(c.accepted_at > 0);
    assert_eq!(c.released_amount, 0);
    assert_eq!(c.withdrawn_amount, 0);
    assert_eq!(c.refunded_amount, 0);
    assert_eq!(c.stream_released_amount, 0);
    assert_eq!(c.contested_amount, 0);
    assert_eq!(c.released_unit_count, 0);
    assert_eq!(c.open_review_count, 0);
    assert_eq!(c.freelancer_settlement_amount, 0);
    assert_eq!(c.employer_refundable_amount, expected_total);
    assert_eq!(
        c.freelancer_settlement_amount + c.employer_refundable_amount,
        expected_total
    );
    assert_eq!(c.dispute_initiator, DisputeParty::None);
    assert_eq!(c.disputed_at, 0);
    assert_eq!(env.escrow_amount(id), expected_total);
    if c.trial_amount > 0 {
        let trial = env.read_work_unit(&env.trial_pda(&contract));
        assert_eq!(trial.kind, WorkUnitKind::Trial);
        assert_eq!(trial.status, WorkUnitStatus::Defined);
        assert_eq!(trial.release_trigger, ReleaseTrigger::NotReleased);
    }
}

fn claim_full_refund(env: &mut Env, id: u64, expected_total: u64) {
    assert_rejected(env.withdraw(id), E_NOTHING_TO_WITHDRAW, "collect pay");
    let employer_before = env.token_balance(&env.employer_token_account);
    env.refund(id).expect("claim refund");
    let c = env.read_contract(&env.contract_pda(id));
    assert_eq!(c.refunded_amount, expected_total);
    assert_eq!(env.escrow_amount(id), 0);
    assert_eq!(
        env.token_balance(&env.employer_token_account),
        employer_before + expected_total
    );
    assert_eq!(
        c.withdrawn_amount + c.refunded_amount + env.escrow_amount(id),
        expected_total
    );
    env.svm.expire_blockhash();
    assert_rejected(env.refund(id), E_NOTHING_TO_REFUND, "second refund");
    assert_rejected(env.withdraw(id), E_NOTHING_TO_WITHDRAW, "collect pay after refund");
}

fn accept_and_deadline(env: &mut Env, id: u64) -> i64 {
    env.accept(id).unwrap();
    let c = env.read_contract(&env.contract_pda(id));
    c.accepted_at + c.activation_review_duration
}

#[test]
fn cannot_expire_before_activation_deadline() {
    let mut env = setup(TOTAL_AMOUNT);
    env.create(&fixed_no_trial_args(&env, 1)).unwrap();
    env.accept(1).unwrap();
    assert_rejected(
        env.expire_activation(1),
        E_APPROVAL_WINDOW_NOT_EXPIRED,
        "expire before deadline",
    );
}

#[test]
fn expire_allowed_exactly_at_deadline_and_rejected_for_approve() {
    let mut env = setup(TOTAL_AMOUNT * 2);
    env.create(&fixed_no_trial_args(&env, 1)).unwrap();
    let deadline = accept_and_deadline(&mut env, 1);
    env.warp(deadline);
    assert_rejected(
        env.approve(1),
        E_APPROVAL_WINDOW_EXPIRED,
        "approve at deadline",
    );
    env.svm.expire_blockhash();
    env.expire_activation(1).expect("expire at deadline");
    assert_t4_freeze(&env, 1, TOTAL_AMOUNT);
}

#[test]
fn expire_allowed_after_deadline() {
    let mut env = setup(TOTAL_AMOUNT);
    env.create(&fixed_no_trial_args(&env, 1)).unwrap();
    let deadline = accept_and_deadline(&mut env, 1);
    env.warp(deadline + 1);
    env.expire_activation(1).expect("expire after deadline");
    assert_t4_freeze(&env, 1, TOTAL_AMOUNT);
}

#[test]
fn activation_immediately_before_deadline_still_valid() {
    let mut env = setup(TOTAL_AMOUNT);
    env.create(&fixed_no_trial_args(&env, 1)).unwrap();
    let deadline = accept_and_deadline(&mut env, 1);
    env.warp(deadline - 1);
    assert_rejected(
        env.expire_activation(1),
        E_APPROVAL_WINDOW_NOT_EXPIRED,
        "expire one second early",
    );
    env.svm.expire_blockhash();
    env.approve(1).expect("approve immediately before expiry");
    let c = env.read_contract(&env.contract_pda(1));
    assert_eq!(c.status, ContractStatus::Active);
    env.warp(deadline);
    env.svm.expire_blockhash();
    assert_rejected(env.expire_activation(1), E_INVALID_STATE, "active");
}

#[test]
fn expire_is_permissionless() {
    let mut env = setup(TOTAL_AMOUNT * 3);
    env.create(&fixed_no_trial_args(&env, 1)).unwrap();
    let deadline_1 = accept_and_deadline(&mut env, 1);
    env.warp(deadline_1);
    env.expire_activation_as(&clone_kp(&env.employer), 1)
        .expect("employer caller");
    assert_t4_freeze(&env, 1, TOTAL_AMOUNT);

    env.create(&fixed_no_trial_args(&env, 2)).unwrap();
    let deadline_2 = accept_and_deadline(&mut env, 2);
    env.warp(deadline_2);
    env.expire_activation_as(&clone_kp(&env.freelancer), 2)
        .expect("freelancer caller");
    assert_t4_freeze(&env, 2, TOTAL_AMOUNT);

    env.create(&fixed_no_trial_args(&env, 3)).unwrap();
    let deadline_3 = accept_and_deadline(&mut env, 3);
    env.warp(deadline_3);
    env.expire_activation_as(&clone_kp(&env.stranger), 3)
        .expect("third-party caller");
    assert_t4_freeze(&env, 3, TOTAL_AMOUNT);
}

#[test]
fn no_trial_full_employer_refund_freeze() {
    let mut env = setup(TOTAL_AMOUNT);
    env.create(&fixed_no_trial_args(&env, 1)).unwrap();
    let deadline = accept_and_deadline(&mut env, 1);
    env.warp(deadline);
    env.expire_activation(1).unwrap();
    assert_t4_freeze(&env, 1, TOTAL_AMOUNT);
    claim_full_refund(&mut env, 1, TOTAL_AMOUNT);
}

#[test]
fn defined_trial_full_employer_refund_freeze() {
    let mut env = setup(TOTAL_AMOUNT);
    env.create(&fixed_args(&env, 1)).unwrap();
    let deadline = accept_and_deadline(&mut env, 1);
    env.warp(deadline);
    env.expire_activation(1).unwrap();
    assert_t4_freeze(&env, 1, TOTAL_AMOUNT);
    claim_full_refund(&mut env, 1, TOTAL_AMOUNT);
}

#[test]
fn submitted_trial_is_excluded_from_t4() {
    let mut env = setup(TOTAL_AMOUNT);
    env.create(&streaming_args(&env, 1)).unwrap();
    let deadline = accept_and_deadline(&mut env, 1);
    env.submit_trial(1).unwrap();
    env.warp(deadline);
    assert_rejected(
        env.expire_activation(1),
        E_INVALID_TRIAL_STATE,
        "submitted trial",
    );
    env.svm.expire_blockhash();
    env.settle_trial(1).expect("T1 remains after window");
    let c = env.read_contract(&env.contract_pda(1));
    assert_eq!(c.status, ContractStatus::Cancelled);
    assert_eq!(c.freelancer_settlement_amount, TRIAL_AMOUNT);
    assert_eq!(c.employer_refundable_amount, MAIN_AMOUNT);
}

#[test]
fn revising_trial_is_excluded_from_t4() {
    let mut env = setup(TOTAL_AMOUNT);
    env.create(&streaming_args(&env, 1)).unwrap();
    let deadline = accept_and_deadline(&mut env, 1);
    env.submit_trial(1).unwrap();
    env.request_trial_revision(1).unwrap();
    let trial = env.read_work_unit(&env.trial_pda(&env.contract_pda(1)));
    assert_eq!(trial.status, WorkUnitStatus::Revising);
    env.warp(deadline);
    assert_rejected(
        env.expire_activation(1),
        E_INVALID_TRIAL_STATE,
        "revising trial",
    );
    env.svm.expire_blockhash();
    env.reject(1).expect("reject remains after window");
    let c = env.read_contract(&env.contract_pda(1));
    assert_eq!(c.status, ContractStatus::Disputed);
    assert!(c.contested_amount > 0);
}

#[test]
fn cannot_expire_started_or_terminal_statuses() {
    let mut env = setup(TOTAL_AMOUNT * 8 + hourly_main());
    env.create(&fixed_no_trial_args(&env, 1)).unwrap();
    env.accept(1).unwrap();
    env.approve(1).unwrap();
    env.warp(env.now() + ACTIVATION_REVIEW);
    assert_rejected(env.expire_activation(1), E_INVALID_STATE, "active");
    env.submit_work(1, 0).unwrap();
    env.approve_work(1, 0).unwrap();
    env.complete(1).unwrap();
    assert_eq!(
        env.read_contract(&env.contract_pda(1)).status,
        ContractStatus::Completed
    );
    env.svm.expire_blockhash();
    assert_rejected(env.expire_activation(1), E_INVALID_STATE, "completed");

    env.create(&streaming_args(&env, 2)).unwrap();
    env.accept(2).unwrap();
    env.submit_trial(2).unwrap();
    env.reject(2).unwrap();
    env.warp(env.now() + ACTIVATION_REVIEW);
    assert_rejected(env.expire_activation(2), E_INVALID_STATE, "disputed");
    env.resolve(2, 0).unwrap();
    assert_eq!(
        env.read_contract(&env.contract_pda(2)).status,
        ContractStatus::Resolved
    );
    env.svm.expire_blockhash();
    assert_rejected(env.expire_activation(2), E_INVALID_STATE, "resolved");

    env.create(&streaming_args(&env, 3)).unwrap();
    env.accept(3).unwrap();
    env.submit_trial(3).unwrap();
    env.settle_trial(3).unwrap();
    env.warp(env.now() + ACTIVATION_REVIEW);
    assert_rejected(env.expire_activation(3), E_INVALID_STATE, "cancelled T1");

    env.create(&streaming_args(&env, 4)).unwrap();
    env.accept(4).unwrap();
    env.reject(4).unwrap();
    env.warp(env.now() + ACTIVATION_REVIEW);
    assert_rejected(
        env.expire_activation(4),
        E_INVALID_STATE,
        "activation rejected T2",
    );

    env.create(&fixed_args(&env, 5)).unwrap();
    env.decline(5).unwrap();
    env.warp(env.now() + ACTIVATION_REVIEW);
    assert_rejected(env.expire_activation(5), E_INVALID_STATE, "declined");

    env.create(&fixed_args(&env, 6)).unwrap();
    env.warp(env.now() + 3_600);
    env.expire_acceptance(6).unwrap();
    env.svm.expire_blockhash();
    assert_rejected(env.expire_activation(6), E_INVALID_STATE, "expired T3");
}

#[test]
fn duplicate_expire_rejected() {
    let mut env = setup(TOTAL_AMOUNT);
    env.create(&fixed_no_trial_args(&env, 1)).unwrap();
    let deadline = accept_and_deadline(&mut env, 1);
    env.warp(deadline);
    env.expire_activation(1).unwrap();
    env.svm.expire_blockhash();
    assert_rejected(env.expire_activation(1), E_INVALID_STATE, "duplicate expire");
}

#[test]
fn fixed_cannot_proceed_after_t4() {
    let mut env = setup(TOTAL_AMOUNT);
    env.create(&fixed_no_trial_args(&env, 1)).unwrap();
    let deadline = accept_and_deadline(&mut env, 1);
    env.warp(deadline);
    env.expire_activation(1).unwrap();
    assert_rejected(env.submit_work(1, 0), E_INVALID_STATE, "fixed work after T4");
    assert_rejected(env.approve(1), E_INVALID_STATE, "approve after T4");
}

#[test]
fn milestone_cannot_proceed_after_t4() {
    let mut env = setup(TOTAL_AMOUNT);
    env.create(&milestone_args(&env, 1)).unwrap();
    env.add_milestone(1, MAIN_AMOUNT, OFFSET).unwrap();
    env.finalize_terms(1).unwrap();
    let deadline = accept_and_deadline(&mut env, 1);
    env.warp(deadline);
    env.expire_activation(1).unwrap();
    assert_t4_freeze(&env, 1, TOTAL_AMOUNT);
    assert_rejected(
        env.submit_work(1, 0),
        E_INVALID_STATE,
        "milestone work after T4",
    );
}

#[test]
fn streaming_never_accrues_after_t4() {
    let mut env = setup(TOTAL_AMOUNT);
    env.create(&streaming_args(&env, 1)).unwrap();
    let deadline = accept_and_deadline(&mut env, 1);
    env.warp(deadline);
    env.expire_activation(1).unwrap();
    assert_t4_freeze(&env, 1, TOTAL_AMOUNT);
    env.warp(env.now() + 10_000);
    assert_rejected(
        env.release_stream(1),
        E_INVALID_STATE,
        "stream after T4",
    );
    let c = env.read_contract(&env.contract_pda(1));
    assert_eq!(c.start_time, 0);
    assert_eq!(c.end_time, 0);
    assert_eq!(c.stream_released_amount, 0);
}

#[test]
fn hourly_never_starts_after_t4() {
    let mut env = setup(hourly_main() + TRIAL_AMOUNT);
    env.create_hourly(&hourly_args(&env, 1)).unwrap();
    let deadline = accept_and_deadline(&mut env, 1);
    env.warp(deadline);
    env.expire_activation(1).unwrap();
    assert_t4_freeze(&env, 1, hourly_main() + TRIAL_AMOUNT);
    let state = env.read_hourly_state(&env.contract_pda(1));
    assert_eq!(state.session_count, 0);
    assert_rejected(env.start_hourly(1), E_INVALID_STATE, "hourly after T4");
}
