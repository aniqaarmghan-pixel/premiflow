//! Platform fee tests (Fixed / Milestone / Streaming): funding reserve,
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
    let program_path = std::env::var("STREAMPAY_SO").unwrap_or_else(|_| format!(
        "{}/../../target/deploy/streampay.so",
        env!("CARGO_MANIFEST_DIR")
    ));
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
                employer_subscription: ::streampay::v2::fees::subscription_pda(&self.employer_pk).0,
                freelancer_subscription: ::streampay::v2::fees::subscription_pda(&self.freelancer_pk).0,
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

    fn cancel_pending(&mut self, contract_id: u64) -> TransactionResult {
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::CancelPendingOffer {
                employer: self.employer_pk,
                contract: self.contract_pda(contract_id),
            }
            .to_account_metas(None),
            data: streampay_program::instruction::CancelPendingOffer {}.data(),
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
fn install_fee_config_free(env: &mut Env, bps: u16) -> Fee {
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
        subscription_mint: env.token_mint,
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
fn fee_not_applied_without_config() {
    let mut env = setup(START);
    activate_fixed(&mut env, 1, 100, 0);
    assert_eq!(env.c(1).fee_bps, 0);
    assert_eq!(env.escrow_amount(1), 100);
    activate_streaming(&mut env, 2, 1_000);
    assert_eq!((env.c(2).fee_bps, env.c(2).fee_reserve), (0, 0));
    assert_eq!(env.escrow_amount(2), 1_000);
    // Legacy no-fee contract keeps working with no fee accounts.
    env.submit_work(1, 0).unwrap();
    env.approve_work(1, 0).unwrap();
    env.withdraw(1).unwrap();
    assert_eq!(env.freelancer_bal(), 100);
}

// ---------------------------------------------------------------------------
// Streaming: fee follows materialized (released) accrual that is withdrawn.
// ---------------------------------------------------------------------------

fn fee3(x: u64) -> u64 {
    ::streampay::v2::fees::fee_on(x, BPS).unwrap()
}

/// Employer paid exactly principal-to-freelancer + fee-on-that; escrow empty.
fn assert_fee_conserved(env: &Env, id: u64, fee: &Fee) {
    let f = env.freelancer_bal();
    assert_eq!(env.token_balance(&fee.treasury_ata), fee3(f));
    assert_eq!(env.employer_bal(), START - f - fee3(f));
    assert_eq!(env.escrow_amount(id), 0);
    let c = env.c(id);
    assert_eq!(c.fee_paid, fee3(c.withdrawn_amount));
}

#[test]
fn fee_streaming_full_settlement() {
    let mut env = setup(START);
    let fee = install_fee_config(&mut env, BPS);
    let start = activate_streaming(&mut env, 1, 1_000);
    let c = env.c(1);
    assert_eq!((c.fee_bps, c.fee_reserve, c.total_amount), (300, 30, 1_000));
    assert_eq!(env.employer_bal(), START - 1_030);
    assert_eq!(env.escrow_amount(1), 1_030);

    // Time alone pays nothing: no release, nothing withdrawable, no fee.
    env.warp(start + DURATION / 2);
    assert_rejected(env.withdraw_fee(1, &fee), E_NOTHING_TO_WITHDRAW, "unreleased accrual");
    assert_eq!(env.token_balance(&fee.treasury_ata), 0);

    env.warp(start + DURATION);
    env.release_stream(1).unwrap();
    env.withdraw_fee(1, &fee).unwrap();
    assert_eq!(env.freelancer_bal(), 1_000);
    assert_eq!(env.token_balance(&fee.treasury_ata), 30);
    assert_eq!(env.c(1).fee_paid, 30);
    assert_fee_conserved(&env, 1, &fee);
}

#[test]
fn fee_streaming_partial_settlement_then_cancel_refund() {
    let mut env = setup(START);
    let fee = install_fee_config(&mut env, BPS);
    let start = activate_streaming(&mut env, 1, 1_000);
    env.warp(start + DURATION / 2);
    env.release_stream(1).unwrap();
    let released = env.c(1).released_amount;
    assert!(released > 0 && released < 1_000);
    env.withdraw_fee(1, &fee).unwrap();
    assert_eq!(env.freelancer_bal(), released);
    assert_eq!(env.token_balance(&fee.treasury_ata), fee3(released));

    env.cancel(1).unwrap();
    let c = env.c(1);
    if c.freelancer_settlement_amount > c.withdrawn_amount {
        env.withdraw_fee(1, &fee).unwrap();
    }
    env.refund(1).unwrap();
    assert_fee_conserved(&env, 1, &fee);
    assert!(env.token_balance(&fee.treasury_ata) < 30, "unearned fee returned");
}

#[test]
fn fee_streaming_dispute_split() {
    let mut env = setup(START);
    let fee = install_fee_config(&mut env, BPS);
    let start = activate_streaming(&mut env, 1, 1_000);
    env.warp(start + DURATION / 3);
    env.open_as_employer(1).unwrap();
    let contested = env.c(1).contested_amount;
    assert!(contested > 0);
    env.resolve(1, contested / 2).unwrap();
    env.withdraw_fee(1, &fee).unwrap();
    env.refund(1).unwrap();
    assert!(env.freelancer_bal() > 0 && env.freelancer_bal() < 1_000);
    assert_fee_conserved(&env, 1, &fee);
}

#[test]
fn fee_streaming_rounding_tiny_amounts() {
    let mut env = setup(START);
    let fee = install_fee_config(&mut env, BPS);
    // 33 base units: reserve floors to zero, no fee accounts needed.
    let s1 = activate_streaming(&mut env, 1, 33);
    assert_eq!(env.c(1).fee_reserve, 0);
    assert_eq!(env.escrow_amount(1), 33);
    env.warp(s1 + DURATION);
    env.release_stream(1).unwrap();
    env.withdraw(1).unwrap();
    assert_eq!(env.freelancer_bal(), 33);

    // 101 base units: reserve 3, chunked releases sum exactly to it.
    let s2 = activate_streaming(&mut env, 2, 101);
    assert_eq!(env.c(2).fee_reserve, 3);
    let base_f = env.freelancer_bal();
    for step in 1..=6 {
        env.warp(s2 + DURATION * step / 6);
        env.release_stream(2).unwrap();
        let c = env.c(2);
        if c.released_amount > c.withdrawn_amount {
            env.withdraw_fee(2, &fee).unwrap();
        }
        assert_eq!(env.c(2).fee_paid, fee3(env.c(2).withdrawn_amount));
    }
    assert_eq!(env.freelancer_bal() - base_f, 101);
    assert_eq!(env.token_balance(&fee.treasury_ata), 3);
    assert_eq!(env.escrow_amount(2), 0);
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

// ---------------------------------------------------------------------------
// Symmetric plan-based fees and on-chain subscriptions.
//
// The employer-fee mechanics tests above isolate the employer side: their
// `install_fee_config` gives the freelancer an active Premium plan (0%).
// Everything below uses `install_fee_config_free` (no plans = Free/Free).
// ---------------------------------------------------------------------------

use ::streampay::{PurchaseSubscriptionArgs, Subscription, SubscriptionTerm, SubscriptionTier};

const E_CONSTRAINT_SEEDS: u32 = 2006;
const E_INVALID_SUBSCRIPTION_MINT: u32 = 6185;
const E_INVALID_SUBSCRIPTION_PLAN: u32 = 6186;
const E_TIER_CHANGE_WHILE_ACTIVE: u32 = 6188;
const E_PREPAID_LIMIT: u32 = 6189;
const DAY: i64 = 86_400;
const ONE_TOKEN: u64 = 1_000_000;

fn install_fee_config(env: &mut Env, bps: u16) -> Fee {
    let fee = install_fee_config_free(env, bps);
    let freelancer = env.freelancer_pk;
    install_subscription(env, freelancer, SubscriptionTier::Premium, i64::MAX);
    fee
}

fn sub_pda(owner: &Address) -> Address {
    ::streampay::v2::fees::subscription_pda(owner).0
}

/// Test-only injection of a program-owned Subscription (like FeeConfig above;
/// real wallets can only get one through `purchase_subscription`).
fn install_subscription(env: &mut Env, owner: Address, tier: SubscriptionTier, expires_at: i64) {
    let (pda, bump) = ::streampay::v2::fees::subscription_pda(&owner);
    let sub = Subscription {
        version: 1,
        owner,
        tier,
        last_term: SubscriptionTerm::Monthly,
        started_at: env.now(),
        expires_at,
        total_paid: 0,
        bump,
        reserved: [0u8; 32],
    };
    let mut data = Vec::new();
    sub.try_serialize(&mut data).unwrap();
    env.svm.airdrop(&pda, 10_000_000).unwrap();
    let mut acc = env.svm.get_account(&pda).unwrap();
    acc.data = data;
    acc.owner = env.program_id;
    env.svm.set_account(pda, acc).unwrap();
}

fn read_sub(env: &Env, owner: &Address) -> Subscription {
    let acc = env.svm.get_account(&sub_pda(owner)).unwrap();
    Subscription::try_deserialize(&mut acc.data.as_slice()).unwrap()
}

impl Env {
    #[allow(clippy::too_many_arguments)]
    fn purchase_with(
        &mut self,
        payer: &Keypair,
        payer_ata: Address,
        mint: Address,
        treasury: Address,
        tier: SubscriptionTier,
        term: SubscriptionTerm,
    ) -> TransactionResult {
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::PurchaseSubscription {
                subscriber: payer.pubkey(),
                subscription: sub_pda(&payer.pubkey()),
                fee_config: fee_pda(),
                payment_mint: mint,
                subscriber_token_account: payer_ata,
                treasury_token_account: treasury,
                token_program: TOKEN_ID,
                system_program: anchor_lang::system_program::ID,
            }
            .to_account_metas(None),
            data: streampay_program::instruction::PurchaseSubscription {
                args: PurchaseSubscriptionArgs { tier, term },
            }
            .data(),
        };
        self.send(ix, payer)
    }

    fn purchase(&mut self, fee: &Fee, tier: SubscriptionTier, term: SubscriptionTerm) -> TransactionResult {
        let employer = clone_kp(&self.employer);
        let (ata, mint) = (self.employer_token_account, self.token_mint);
        self.purchase_with(&employer, ata, mint, fee.treasury_ata, tier, term)
    }

    fn mint_to_employer(&mut self, amount: u64) {
        MintTo::new(&mut self.svm, &self.employer, &self.token_mint, &self.employer_token_account, amount)
            .owner(&self.employer)
            .send()
            .unwrap();
    }

    fn create_with_subs(&mut self, args: &CreateContractArgs, esub: Address, fsub: Address) -> TransactionResult {
        let contract = self.contract_pda(args.contract_id);
        let ix = Instruction {
            program_id: self.program_id,
            accounts: streampay_program::accounts::CreateContract {
                fee_config: fee_pda(),
                employer: self.employer_pk,
                freelancer: self.freelancer_pk,
                employer_subscription: esub,
                freelancer_subscription: fsub,
                token_mint: self.token_mint,
                employer_token_account: self.employer_token_account,
                contract,
                contract_escrow: self.escrow_pda(&contract),
                trial_work_unit: None,
                fixed_work_unit: Some(self.work_unit_pda(&contract, 0)),
                token_program: TOKEN_ID,
                system_program: anchor_lang::system_program::ID,
            }
            .to_account_metas(None),
            data: streampay_program::instruction::CreateContract { args: args.clone() }.data(),
        };
        self.send_employer(ix)
    }

    fn release_fixed(&mut self, id: u64) {
        self.submit_work(id, 0).unwrap();
        self.approve_work(id, 0).unwrap();
    }
}

#[test]
fn sym_free_free_fixed_100_employer_103_freelancer_97() {
    let mut env = setup(START);
    let fee = install_fee_config_free(&mut env, BPS);
    activate_fixed(&mut env, 1, 100, 0);
    let c = env.c(1);
    assert_eq!((c.fee_bps, c.freelancer_fee_rate, c.freelancer_fee_bps()), (300, 30, 300));
    assert_eq!(env.employer_bal(), START - 103);
    env.release_fixed(1);
    env.withdraw_fee(1, &fee).unwrap();
    assert_eq!(env.freelancer_bal(), 97);
    assert_eq!(env.token_balance(&fee.treasury_ata), 6, "total possible fee 6");
    assert_eq!(env.escrow_amount(1), 0);
    assert_eq!(env.c(1).withdrawn_amount, 100, "gross principal accounting");
}

#[test]
fn sym_pro_pro_101_99_and_premium_premium_100_100() {
    let mut env = setup(START);
    let fee = install_fee_config_free(&mut env, BPS);
    let (e, f) = (env.employer_pk, env.freelancer_pk);
    install_subscription(&mut env, e, SubscriptionTier::Pro, BASE_TS + 400 * DAY);
    install_subscription(&mut env, f, SubscriptionTier::Pro, BASE_TS + 400 * DAY);
    activate_fixed(&mut env, 1, 100, 0);
    assert_eq!((env.c(1).fee_bps, env.c(1).freelancer_fee_bps()), (100, 100));
    assert_eq!(env.employer_bal(), START - 101);
    env.release_fixed(1);
    env.withdraw_fee(1, &fee).unwrap();
    assert_eq!(env.freelancer_bal(), 99);
    assert_eq!(env.token_balance(&fee.treasury_ata), 2);

    install_subscription(&mut env, e, SubscriptionTier::Premium, BASE_TS + 400 * DAY);
    install_subscription(&mut env, f, SubscriptionTier::Premium, BASE_TS + 400 * DAY);
    activate_fixed(&mut env, 2, 100, 0);
    assert_eq!((env.c(2).fee_bps, env.c(2).freelancer_fee_bps()), (0, 0));
    assert_eq!(env.employer_bal(), START - 101 - 100);
    env.release_fixed(2);
    env.withdraw(2).unwrap();
    assert_eq!(env.freelancer_bal(), 99 + 100);
    assert_eq!(env.token_balance(&fee.treasury_ata), 2);
}

#[test]
fn sym_each_participants_own_plan_controls_only_their_fee() {
    use SubscriptionTier::*;
    let mut env = setup(START);
    let fee = install_fee_config_free(&mut env, BPS);
    let (e, f) = (env.employer_pk, env.freelancer_pk);
    let cases = [
        (Pro, Free, 100u16, 300u16, 101u64, 97u64),
        (Premium, Pro, 0, 100, 100, 99),
        (Free, Premium, 300, 0, 103, 100),
    ];
    for (i, (et, ft, ebps, fbps, funding, net)) in cases.into_iter().enumerate() {
        let id = i as u64 + 1;
        install_subscription(&mut env, e, et, BASE_TS + 400 * DAY);
        install_subscription(&mut env, f, ft, BASE_TS + 400 * DAY);
        let employer_before = env.employer_bal();
        activate_fixed(&mut env, id, 100, 0);
        assert_eq!((env.c(id).fee_bps, env.c(id).freelancer_fee_bps()), (ebps, fbps), "case {id}");
        assert_eq!(employer_before - env.employer_bal(), funding, "case {id}");
        let (fb, tb) = (env.freelancer_bal(), env.token_balance(&fee.treasury_ata));
        env.release_fixed(id);
        env.withdraw_fee(id, &fee).unwrap();
        assert_eq!(env.freelancer_bal() - fb, net, "case {id}");
        assert_eq!(env.token_balance(&fee.treasury_ata) - tb, (funding - 100) + (100 - net));
    }
}

#[test]
fn sym_rates_frozen_at_creation_expiry_never_changes_existing_contract() {
    let mut env = setup(START);
    let fee = install_fee_config_free(&mut env, BPS);
    let (e, f) = (env.employer_pk, env.freelancer_pk);
    install_subscription(&mut env, e, SubscriptionTier::Premium, BASE_TS + 30 * DAY);
    install_subscription(&mut env, f, SubscriptionTier::Premium, BASE_TS + 30 * DAY);
    activate_fixed(&mut env, 1, 1_000, 0);
    assert_eq!((env.c(1).fee_bps, env.c(1).freelancer_fee_bps()), (0, 0));
    env.warp(BASE_TS + 31 * DAY);
    activate_fixed(&mut env, 2, 1_000, 0);
    assert_eq!((env.c(2).fee_bps, env.c(2).freelancer_fee_bps()), (300, 300));
    assert_eq!((env.c(1).fee_bps, env.c(1).freelancer_fee_rate), (0, 0), "no retroactive change");
    env.release_fixed(1);
    env.withdraw(1).unwrap();
    assert_eq!(env.freelancer_bal(), 1_000);
    assert_eq!(env.token_balance(&fee.treasury_ata), 0);
}

#[test]
fn sym_milestone_partial_release_then_cancel_charges_only_released() {
    let mut env = setup(START);
    let fee = install_fee_config_free(&mut env, BPS);
    activate_milestone(&mut env, 1, &[500, 500]);
    assert_eq!(env.employer_bal(), START - 1_030);
    env.submit_work(1, 0).unwrap();
    env.approve_work(1, 0).unwrap();
    env.withdraw_fee(1, &fee).unwrap();
    assert_eq!(env.freelancer_bal(), 485);
    assert_eq!(env.token_balance(&fee.treasury_ata), 30);
    env.cancel(1).unwrap();
    env.refund(1).unwrap();
    assert_eq!(env.freelancer_bal(), 485);
    // Unreleased 500 + its 15 unearned employer fee reserve go back.
    assert_eq!(env.employer_bal(), START - 500 - 15);
    assert_eq!(env.token_balance(&fee.treasury_ata), 30);
    assert_eq!(env.escrow_amount(1), 0);
}

#[test]
fn sym_cancel_before_release_retains_no_fee() {
    let mut env = setup(START);
    let fee = install_fee_config_free(&mut env, BPS);
    activate_fixed(&mut env, 1, 1_000, 0);
    env.cancel(1).unwrap();
    env.refund(1).unwrap();
    assert_eq!(env.employer_bal(), START);
    assert_eq!(env.freelancer_bal(), 0);
    assert_eq!(env.token_balance(&fee.treasury_ata), 0);
    assert_eq!(env.escrow_amount(1), 0);
}

#[test]
fn sym_dispute_60_40_principal_allocation() {
    let mut env = setup(START);
    let fee = install_fee_config_free(&mut env, BPS);
    activate_fixed(&mut env, 1, 1_000, 0);
    env.open_as_employer(1).unwrap();
    env.resolve(1, 600).unwrap();
    env.withdraw_fee(1, &fee).unwrap();
    env.refund(1).unwrap();
    // Freelancer fee only on the 600 awarded; employer fee on 600 earned.
    assert_eq!(env.freelancer_bal(), 600 - 18);
    assert_eq!(env.token_balance(&fee.treasury_ata), 18 + 18);
    // 400 principal + (30 - 18) unearned employer fee reserve.
    assert_eq!(env.employer_bal(), START - 1_030 + 412);
    assert_eq!(env.escrow_amount(1), 0);
}

#[test]
fn sym_streaming_fee_follows_withdrawn_principal() {
    let mut env = setup(START);
    let fee = install_fee_config_free(&mut env, BPS);
    let start = activate_streaming(&mut env, 1, 1_000);
    env.warp(start + DURATION / 2);
    assert_rejected(env.withdraw_fee(1, &fee), E_NOTHING_TO_WITHDRAW, "time alone pays no fee");
    env.release_stream(1).unwrap();
    let released = env.c(1).released_amount;
    env.withdraw_fee(1, &fee).unwrap();
    assert_eq!(env.freelancer_bal(), released - fee3(released));
    assert_eq!(env.token_balance(&fee.treasury_ata), 2 * fee3(released));
    env.cancel(1).unwrap();
    let c = env.c(1);
    if c.freelancer_settlement_amount > c.withdrawn_amount {
        env.withdraw_fee(1, &fee).unwrap();
    }
    env.refund(1).unwrap();
    let w = env.c(1).withdrawn_amount;
    assert_eq!(env.freelancer_bal(), w - fee3(w));
    assert_eq!(env.token_balance(&fee.treasury_ata), 2 * fee3(w));
    assert_eq!(env.employer_bal(), START - w - fee3(w));
    assert_eq!(env.escrow_amount(1), 0);
}

#[test]
fn sym_many_small_withdrawals_match_single_cumulative_fee() {
    // Freelancer fee is cumulative: after every withdrawal the total charged is
    // floor(total_withdrawn * bps / 10_000); fee_due_now = that minus what the
    // earlier withdrawals already paid. Never floored per withdrawal.
    let mut env = setup(START);
    let fee = install_fee_config_free(&mut env, BPS);
    let start = activate_streaming(&mut env, 1, 1_000);
    let mut prev_w = 0u64;
    let mut naive_per_withdrawal_floor = 0u64;
    let mut steps = 0u32;
    for t in (4..=DURATION).step_by(4) {
        env.warp(start + t);
        env.release_stream(1).unwrap();
        env.withdraw_fee(1, &fee).unwrap();
        let w = env.c(1).withdrawn_amount;
        assert!(w > prev_w, "step {steps} withdrew something");
        naive_per_withdrawal_floor += fee3(w - prev_w);
        prev_w = w;
        steps += 1;
        assert_eq!(env.freelancer_bal(), w - fee3(w), "cumulative after step {steps}");
        assert_eq!(env.token_balance(&fee.treasury_ata), 2 * fee3(w));
    }
    assert_eq!(prev_w, 1_000);
    assert!(steps >= 10, "many small partial withdrawals ({steps})");
    assert_eq!(env.freelancer_bal(), 970);
    assert!(
        naive_per_withdrawal_floor < fee3(1_000),
        "per-withdrawal flooring would drift ({naive_per_withdrawal_floor} < 30)"
    );

    // The same principal withdrawn once pays exactly the same fee.
    let mut once = setup(START);
    let fee_once = install_fee_config_free(&mut once, BPS);
    let start_once = activate_streaming(&mut once, 1, 1_000);
    once.warp(start_once + DURATION);
    once.release_stream(1).unwrap();
    once.withdraw_fee(1, &fee_once).unwrap();
    assert_eq!(once.c(1).withdrawn_amount, 1_000);
    assert_eq!(once.freelancer_bal(), env.freelancer_bal());
    assert_eq!(
        once.token_balance(&fee_once.treasury_ata),
        env.token_balance(&fee.treasury_ata)
    );
}

#[test]
fn legacy_contract_layout_never_charges_freelancer() {
    let mut env = setup(START);
    let fee = install_fee_config_free(&mut env, BPS);
    activate_fixed(&mut env, 1, 100, 0);
    // Simulate a pre-subscription contract: its former reserved byte is 0.
    let pda = env.contract_pda(1);
    let mut c = env.c(1);
    assert_eq!(c.freelancer_fee_rate, 30);
    c.freelancer_fee_rate = 0;
    let mut data = Vec::new();
    c.try_serialize(&mut data).unwrap();
    let mut acc = env.svm.get_account(&pda).unwrap();
    acc.data[..data.len()].copy_from_slice(&data);
    env.svm.set_account(pda, acc).unwrap();
    env.release_fixed(1);
    env.withdraw_fee(1, &fee).unwrap();
    assert_eq!(env.freelancer_bal(), 100, "historical employer-only behaviour");
    assert_eq!(env.token_balance(&fee.treasury_ata), 3);
    assert_eq!(env.escrow_amount(1), 0);
}

#[test]
fn subscription_purchase_renewal_expiry_and_annual() {
    use SubscriptionTerm::*;
    use SubscriptionTier::*;
    let mut env = setup(START);
    let fee = install_fee_config_free(&mut env, BPS);
    env.mint_to_employer(2_000 * ONE_TOKEN);
    let e = env.employer_pk;
    let before = env.employer_bal();
    env.purchase(&fee, Pro, Monthly).unwrap();
    let s = read_sub(&env, &e);
    assert_eq!((s.owner, s.tier, s.started_at, s.expires_at), (e, Pro, BASE_TS, BASE_TS + 30 * DAY));
    assert_eq!(env.token_balance(&fee.treasury_ata), 25 * ONE_TOKEN);
    assert_eq!(before - env.employer_bal(), 25 * ONE_TOKEN);

    env.warp(BASE_TS + 10 * DAY);
    env.purchase(&fee, Pro, Monthly).unwrap();
    let s = read_sub(&env, &e);
    assert_eq!((s.started_at, s.expires_at, s.total_paid), (BASE_TS, BASE_TS + 60 * DAY, 50 * ONE_TOKEN));
    assert_rejected(env.purchase(&fee, Premium, Monthly), E_TIER_CHANGE_WHILE_ACTIVE, "plan change while active");

    activate_fixed(&mut env, 1, 1_000, 0);
    assert_eq!(env.c(1).fee_bps, 100);

    env.warp(BASE_TS + 60 * DAY);
    activate_fixed(&mut env, 2, 1_000, 0);
    assert_eq!(env.c(2).fee_bps, 300, "expired plan reads as Free");

    env.purchase(&fee, Premium, Annual).unwrap();
    let s = read_sub(&env, &e);
    assert_eq!(
        (s.tier, s.last_term, s.started_at, s.expires_at),
        (Premium, Annual, BASE_TS + 60 * DAY, BASE_TS + 60 * DAY + 365 * DAY)
    );
    assert_eq!(env.token_balance(&fee.treasury_ata), 650 * ONE_TOKEN);
    activate_fixed(&mut env, 3, 1_000, 0);
    assert_eq!(env.c(3).fee_bps, 0);
    assert_eq!((env.c(1).fee_bps, env.c(2).fee_bps), (100, 300), "frozen");
}

#[test]
fn subscription_prepay_is_bounded() {
    use SubscriptionTerm::*;
    let mut env = setup(START);
    let fee = install_fee_config_free(&mut env, BPS);
    env.mint_to_employer(1_000 * ONE_TOKEN);
    for _ in 0..3 {
        env.purchase(&fee, SubscriptionTier::Pro, Annual).unwrap();
    }
    assert_eq!(read_sub(&env, &env.employer_pk).expires_at, BASE_TS + 3 * 365 * DAY);
    assert_rejected(env.purchase(&fee, SubscriptionTier::Pro, Monthly), E_PREPAID_LIMIT, "beyond 3 years");
}

#[test]
fn subscription_spoofing_is_rejected() {
    use SubscriptionTerm::*;
    use SubscriptionTier::*;
    let mut env = setup(START);
    let fee = install_fee_config_free(&mut env, BPS);
    env.mint_to_employer(1_000 * ONE_TOKEN);
    let employer = clone_kp(&env.employer);
    let e = env.employer_pk;

    assert_rejected(env.purchase(&fee, Free, Monthly), E_INVALID_SUBSCRIPTION_PLAN, "free is not purchasable");

    let treasury_owner = {
        let t: SplTokenAccount = get_spl_account(&env.svm, &fee.treasury_ata).unwrap();
        t.owner
    };
    let other_mint = CreateMint::new(&mut env.svm, &employer).authority(&e).decimals(6).send().unwrap();
    let other_ata = CreateAccount::new(&mut env.svm, &employer, &other_mint).owner(&e).send().unwrap();
    MintTo::new(&mut env.svm, &employer, &other_mint, &other_ata, 1_000 * ONE_TOKEN)
        .owner(&employer)
        .send()
        .unwrap();
    let other_treasury = CreateAccount::new(&mut env.svm, &employer, &other_mint)
        .owner(&treasury_owner)
        .send()
        .unwrap();
    assert_rejected(
        env.purchase_with(&employer, other_ata, other_mint, other_treasury, Premium, Monthly),
        E_INVALID_SUBSCRIPTION_MINT,
        "worthless mint",
    );
    let rogue = CreateAccount::new(&mut env.svm, &employer, &env.token_mint)
        .owner(&env.outsider_pk)
        .send()
        .unwrap();
    let (ata, mint) = (env.employer_token_account, env.token_mint);
    assert_rejected(
        env.purchase_with(&employer, ata, mint, rogue, Premium, Monthly),
        E_INVALID_TREASURY,
        "rogue treasury",
    );
    assert!(env.purchase_with(&employer, ata, mint, ata, Premium, Monthly).is_err(), "self as treasury");
    assert!(
        env.svm.get_account(&sub_pda(&e)).map_or(true, |a| a.data.is_empty()),
        "no entitlement without payment"
    );

    // Borrowing another wallet's Premium account is rejected by PDA seeds.
    let outsider = env.outsider_pk;
    install_subscription(&mut env, outsider, Premium, i64::MAX);
    let args = fixed_args(&env, 7, 1_000, env.now());
    let fsub = sub_pda(&env.freelancer_pk);
    assert_rejected(env.create_with_subs(&args, sub_pda(&outsider), fsub), E_CONSTRAINT_SEEDS, "borrowed employer plan");
    assert_rejected(env.create_with_subs(&args, sub_pda(&e), sub_pda(&e)), E_CONSTRAINT_SEEDS, "wrong freelancer plan");

    // A Premium-looking account at the PDA that the program does not own is Free.
    install_subscription(&mut env, e, Premium, i64::MAX);
    let pda = sub_pda(&e);
    let mut acc = env.svm.get_account(&pda).unwrap();
    acc.owner = anchor_lang::system_program::ID;
    env.svm.set_account(pda, acc).unwrap();
    activate_fixed(&mut env, 1, 1_000, 0);
    assert_eq!(env.c(1).fee_bps, 300);
}

#[test]
fn cancel_pending_offer_free_100_recovers_103() {
    // Free plan 3% on 100 principal ? fund 103. Cancel before accept: platform
    // earns 0; claim returns full principal + unearned fee reserve at frozen rate.
    let mut env = setup(START);
    let fee = install_fee_config_free(&mut env, BPS);
    let now = env.now();
    env.create(&fixed_args(&env, 1, 100, now)).unwrap();
    let c = env.c(1);
    assert_eq!(c.status, ContractStatus::PendingAcceptance);
    assert_eq!((c.fee_bps, c.fee_reserve, c.fee_paid), (300, 3, 0));
    assert_eq!(c.total_amount, 100);
    assert_eq!(env.employer_bal(), START - 103);
    assert_eq!(env.escrow_amount(1), 103);

    env.cancel_pending(1).unwrap();
    let c = env.c(1);
    assert_eq!(c.status, ContractStatus::Cancelled);
    assert_eq!(c.employer_refundable_amount, 100);
    assert_eq!(c.freelancer_settlement_amount, 0);
    assert_eq!((c.fee_bps, c.fee_reserve), (300, 3), "frozen employer rate");

    let before = env.employer_bal();
    env.refund(1).expect("claim principal + unearned fee");
    assert_eq!(env.employer_bal(), before + 103);
    assert_eq!(env.escrow_amount(1), 0);
    assert_eq!(env.token_balance(&fee.treasury_ata), 0, "platform earns 0");
    assert_eq!(env.c(1).fee_paid, 0);
    assert_eq!(env.c(1).refunded_amount, 100);
}
