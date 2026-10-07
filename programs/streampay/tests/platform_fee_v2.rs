//! Platform fee foundation tests (Fixed / Milestone): funding reserve,
//! proportional fee on release, unearned fee refund, treasury validation.
//!

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
                fee_config: ::streampay::v2::fees::fee_config_pda().0,
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
                hourly_state: None,
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
                fee_config: None,
                treasury_token_account: None,
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
            accounts: streampay_program::accounts::OpenDispute {
                party,
                contract,
                hourly_state: None,
                hourly_session: None,
            }
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


// ===========================================================================
// Platform fee (Fixed / Milestone). Helpers above are copied from
// dispute_resolution_v2.rs; everything below is fee-specific.
// ===========================================================================

use anchor_lang::AccountSerialize;
use ::streampay::{FeeConfig, FeeConfigArgs};

const BPS: u16 = 300;
const E_INVALID_FEE_BPS: u32 = 6180;
const E_FEE_CONFIG_REQUIRED: u32 = 6181;
const E_INVALID_TREASURY: u32 = 6182;
const E_UNAUTHORIZED_FEE_ADMIN: u32 = 6183;
const START: u64 = 10_000_000;

struct Fee {
    admin: Keypair,
    treasury_ata: Address,
}

fn fee_pda() -> Address {
    ::streampay::v2::fees::fee_config_pda().0
}

/// Injects the singleton FeeConfig directly. `initialize_fee_config` is gated
/// by the upgrade authority's ProgramData, which LiteSVM's plain program
/// loader does not provide.
fn install_fee_config(env: &mut Env, bps: u16) -> Fee {
    let admin = Keypair::new();
    env.svm.airdrop(&admin.pubkey(), 1_000_000_000).unwrap();
    let treasury_owner = Keypair::new().pubkey();
    let treasury_ata = CreateAccount::new(&mut env.svm, &env.employer, &env.token_mint)
        .owner(&treasury_owner)
        .send()
        .unwrap();
    let (pda, bump) = ::streampay::v2::fees::fee_config_pda();
    let cfg = FeeConfig {
        admin: admin.pubkey(),
        treasury: treasury_owner,
        fee_bps: bps,
        bump,
        reserved: [0u8; 32],
    };
    let mut data = Vec::new();
    cfg.try_serialize(&mut data).unwrap();
    env.svm.airdrop(&pda, 10_000_000).unwrap();
    let mut acc = env.svm.get_account(&pda).unwrap();
    acc.data = data;
    acc.owner = env.program_id;
    env.svm.set_account(pda, acc).unwrap();
    Fee { admin, treasury_ata }
}

impl Env {
    fn withdraw_with(
        &mut self,
        id: u64,
        fee_config: Option<Address>,
        treasury: Option<Address>,
    ) -> TransactionResult {
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
                fee_config,
                treasury_token_account: treasury,
            }
            .to_account_metas(None),
            data: streampay_program::instruction::WithdrawFreelancer {}.data(),
        };
        self.send_freelancer(ix)
    }

    fn withdraw_fee(&mut self, id: u64, fee: &Fee) -> TransactionResult {
        self.withdraw_with(id, Some(fee_pda()), Some(fee.treasury_ata))
    }

    fn update_fee(&mut self, signer: &Keypair, args: FeeConfigArgs) -> TransactionResult {
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::UpdateFeeConfig {
                admin: signer.pubkey(),
                fee_config: fee_pda(),
            }
            .to_account_metas(None),
            data: streampay_program::instruction::UpdateFeeConfig { args }.data(),
        };
        self.send(ix, signer)
    }

    fn c(&self, id: u64) -> Contract {
        self.read_contract(&self.contract_pda(id))
    }

    fn employer_bal(&self) -> u64 {
        self.token_balance(&self.employer_token_account)
    }

    fn freelancer_bal(&self) -> u64 {
        self.token_balance(&self.freelancer_token_account)
    }
}

#[test]
fn fee_fixed_100_employer_pays_103_freelancer_gets_100() {
    let mut env = setup(START);
    let fee = install_fee_config(&mut env, BPS);
    activate_fixed(&mut env, 1, 100, 0);
    let c = env.c(1);
    assert_eq!((c.fee_bps, c.fee_reserve, c.fee_paid), (300, 3, 0));
    assert_eq!(c.total_amount, 100);
    assert_eq!(env.employer_bal(), START - 103);
    assert_eq!(env.escrow_amount(1), 103);

    env.submit_work(1, 0).unwrap();
    env.approve_work(1, 0).unwrap();
    env.withdraw_fee(1, &fee).unwrap();
    assert_eq!(env.freelancer_bal(), 100);
    assert_eq!(env.token_balance(&fee.treasury_ata), 3);
    assert_eq!(env.escrow_amount(1), 0);
    assert_eq!(env.c(1).fee_paid, 3);
}

#[test]
fn fee_withdraw_requires_valid_treasury() {
    let mut env = setup(START);
    let fee = install_fee_config(&mut env, BPS);
    activate_fixed(&mut env, 1, 1_000, 0);
    env.submit_work(1, 0).unwrap();
    env.approve_work(1, 0).unwrap();

    assert_rejected(env.withdraw(1), E_FEE_CONFIG_REQUIRED, "no fee accounts");
    assert_rejected(
        env.withdraw_with(1, Some(fee_pda()), None),
        E_FEE_CONFIG_REQUIRED,
        "no treasury",
    );
    let outsider_ata = CreateAccount::new(&mut env.svm, &env.employer, &env.token_mint)
        .owner(&env.outsider_pk)
        .send()
        .unwrap();
    assert_rejected(
        env.withdraw_with(1, Some(fee_pda()), Some(outsider_ata)),
        E_INVALID_TREASURY,
        "treasury not owned by configured authority",
    );
    let employer_ata = env.employer_token_account;
    assert_rejected(
        env.withdraw_with(1, Some(fee_pda()), Some(employer_ata)),
        E_INVALID_TREASURY,
        "employer account as treasury",
    );
    assert_eq!(env.c(1).withdrawn_amount, 0);
    assert_eq!(env.escrow_amount(1), 1_030);

    env.withdraw_fee(1, &fee).unwrap();
    assert_eq!(env.freelancer_bal(), 1_000);
    assert_eq!(env.token_balance(&fee.treasury_ata), 30);
}

#[test]
fn fee_milestone_partial_release_then_full_completion_with_rounding() {
    let mut env = setup(START);
    let fee = install_fee_config(&mut env, BPS);
    activate_milestone(&mut env, 1, &[33, 67]);
    assert_eq!(env.c(1).fee_reserve, 3);
    assert_eq!(env.employer_bal(), START - 103);

    env.submit_work(1, 0).unwrap();
    env.approve_work(1, 0).unwrap();
    env.withdraw_fee(1, &fee).unwrap();
    // floor(33 * 3%) = 0: nothing earned yet.
    assert_eq!(env.freelancer_bal(), 33);
    assert_eq!(env.token_balance(&fee.treasury_ata), 0);
    assert_eq!(env.escrow_amount(1), 70);

    env.submit_work(1, 1).unwrap();
    env.approve_work(1, 1).unwrap();
    env.withdraw_fee(1, &fee).unwrap();
    assert_eq!(env.freelancer_bal(), 100);
    assert_eq!(env.token_balance(&fee.treasury_ata), 3);
    assert_eq!(env.escrow_amount(1), 0);
    assert_eq!(env.c(1).fee_paid, env.c(1).fee_reserve);
}

#[test]
fn fee_milestone_partial_release_then_cancel_returns_unearned() {
    let mut env = setup(START);
    let fee = install_fee_config(&mut env, BPS);
    activate_milestone(&mut env, 1, &[500, 500]);
    assert_eq!(env.employer_bal(), START - 1_030);
    env.submit_work(1, 0).unwrap();
    env.approve_work(1, 0).unwrap();
    env.withdraw_fee(1, &fee).unwrap();
    assert_eq!(env.token_balance(&fee.treasury_ata), 15);

    env.cancel(1).unwrap();
    env.refund(1).unwrap();
    assert_eq!(env.freelancer_bal(), 500);
    assert_eq!(env.employer_bal(), START - 500 - 15);
    assert_eq!(env.token_balance(&fee.treasury_ata), 15);
    assert_eq!(env.escrow_amount(1), 0);
}

#[test]
fn fee_cancel_before_release_refunds_principal_and_full_reserve() {
    let mut env = setup(START);
    let fee = install_fee_config(&mut env, BPS);
    activate_fixed(&mut env, 1, 1_000, 0);
    env.cancel(1).unwrap();
    env.refund(1).unwrap();
    assert_eq!(env.employer_bal(), START);
    assert_eq!(env.token_balance(&fee.treasury_ata), 0);
    assert_eq!(env.escrow_amount(1), 0);
}

#[test]
fn fee_reject_activation_refunds_principal_and_full_reserve() {
    let mut env = setup(START);
    let fee = install_fee_config(&mut env, BPS);
    let args = fixed_args(&env, 1, 1_000, env.now());
    env.create(&args).unwrap();
    env.accept(1).unwrap();
    env.reject_activation(1, false).unwrap();
    env.refund(1).unwrap();
    assert_eq!(env.employer_bal(), START);
    assert_eq!(env.token_balance(&fee.treasury_ata), 0);
    assert_eq!(env.escrow_amount(1), 0);
}

#[test]
fn fee_dispute_partial_award_splits_fee_proportionally() {
    let mut env = setup(START);
    let fee = install_fee_config(&mut env, BPS);
    activate_fixed(&mut env, 1, 1_000, 0);
    env.open_as_employer(1).unwrap();
    env.resolve(1, 600).unwrap();
    env.withdraw_fee(1, &fee).unwrap();
    env.refund(1).unwrap();
    assert_eq!(env.freelancer_bal(), 600);
    assert_eq!(env.token_balance(&fee.treasury_ata), 18);
    // 400 principal + (30 - 18) unearned fee.
    assert_eq!(env.employer_bal(), START - 1_030 + 412);
    assert_eq!(env.escrow_amount(1), 0);
}

#[test]
fn fee_dispute_refund_first_then_withdraw_conserves_reserve() {
    let mut env = setup(START);
    let fee = install_fee_config(&mut env, BPS);
    activate_fixed(&mut env, 1, 1_000, 0);
    env.open_as_freelancer(1).unwrap();
    env.resolve(1, 333).unwrap();
    env.refund(1).unwrap();
    // 667 principal + (30 - floor(333 * 3%) = 9) = 21 unearned.
    assert_eq!(env.employer_bal(), START - 1_030 + 688);
    assert_eq!(env.escrow_amount(1), 342);
    env.withdraw_fee(1, &fee).unwrap();
    assert_eq!(env.freelancer_bal(), 333);
    assert_eq!(env.token_balance(&fee.treasury_ata), 9);
    assert_eq!(env.escrow_amount(1), 0);
}

#[test]
fn fee_rounding_one_base_unit_and_odd_amount() {
    let mut env = setup(START);
    let _fee = install_fee_config(&mut env, BPS);
    activate_fixed(&mut env, 1, 1, 0);
    assert_eq!(env.c(1).fee_reserve, 0);
    assert_eq!(env.employer_bal(), START - 1);
    env.submit_work(1, 0).unwrap();
    env.approve_work(1, 0).unwrap();
    // No fee due, so no fee accounts are required.
    env.withdraw(1).unwrap();
    assert_eq!(env.freelancer_bal(), 1);

    activate_fixed(&mut env, 2, 333, 0);
    assert_eq!(env.c(2).fee_reserve, 9);
    assert_eq!(env.escrow_amount(2), 342);
}

#[test]
fn fee_not_applied_to_streaming_or_without_config() {
    let mut env = setup(START);
    activate_fixed(&mut env, 1, 100, 0);
    assert_eq!(env.c(1).fee_bps, 0);
    assert_eq!(env.escrow_amount(1), 100);

    let _fee = install_fee_config(&mut env, BPS);
    activate_streaming(&mut env, 2, 1_000);
    assert_eq!(env.c(2).fee_bps, 0);
    assert_eq!(env.c(2).fee_reserve, 0);
    assert_eq!(env.escrow_amount(2), 1_000);
    // Legacy no-fee contract keeps working with no fee accounts.
    env.submit_work(1, 0).unwrap();
    env.approve_work(1, 0).unwrap();
    env.withdraw(1).unwrap();
    assert_eq!(env.freelancer_bal(), 100);
}

#[test]
fn fee_config_admin_gating_cap_and_snapshot() {
    let mut env = setup(START);
    let fee = install_fee_config(&mut env, BPS);
    activate_fixed(&mut env, 1, 1_000, 0);
    let treasury = Keypair::new().pubkey();
    let outsider = clone_kp(&env.outsider);
    let admin = clone_kp(&fee.admin);
    let args = |bps: u16| FeeConfigArgs {
        admin: admin.pubkey(),
        treasury,
        fee_bps: bps,
    };
    assert_rejected(env.update_fee(&outsider, args(500)), E_UNAUTHORIZED_FEE_ADMIN, "outsider update");
    assert_rejected(env.update_fee(&admin, args(1_001)), E_INVALID_FEE_BPS, "bps above cap");
    env.update_fee(&admin, args(1_000)).unwrap();
    env.update_fee(&admin, args(500)).unwrap();
    activate_fixed(&mut env, 2, 1_000, 0);
    assert_eq!(env.c(1).fee_bps, 300);
    assert_eq!(env.c(2).fee_bps, 500);
    assert_eq!(env.c(2).fee_reserve, 50);
}

#[test]
fn fee_initialize_requires_upgrade_authority() {
    let mut env = setup(START);
    let ix = Instruction {
        program_id: env.program_id,
        accounts: streampay_program::accounts::InitializeFeeConfig {
            authority: env.employer_pk,
            fee_config: fee_pda(),
            program: env.program_id,
            program_data: env.outsider_pk,
            system_program: anchor_lang::system_program::ID,
        }
        .to_account_metas(None),
        data: streampay_program::instruction::InitializeFeeConfig {
            args: FeeConfigArgs {
                admin: env.employer_pk,
                treasury: env.employer_pk,
                fee_bps: BPS,
            },
        }
        .data(),
    };
    assert!(env.send_employer(ix).is_err());
    assert!(env.svm.get_account(&fee_pda()).map_or(true, |a| a.data.is_empty()));
}
