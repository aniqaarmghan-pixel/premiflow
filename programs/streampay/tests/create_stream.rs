 

use anchor_lang::prelude::*; 
use anchor_lang::{
    AccountDeserialize,
    InstructionData,
    ToAccountMetas,
};

use litesvm::LiteSVM;
use litesvm_token::{
    get_spl_account,
    spl_token::state::Account as SplTokenAccount,
    CreateAccount,
    CreateMint,
    MintTo,
    TOKEN_ID,
};
use solana_address::Address;
use solana_instruction::Instruction;
use solana_keypair::Keypair;
use solana_message::Message;
use solana_signer::Signer;
use solana_transaction::Transaction;

use ::streampay::{
    self as streampay_program,
    Stream,
};


#[test]
fn test_create_stream() {
    // ---------------------------------------------------------
    // 1. Start a small local Solana blockchain in memory.
    // ---------------------------------------------------------

    let program_id = streampay_program::id();

    let mut svm = LiteSVM::new();


    // ---------------------------------------------------------
    // 2. Load our compiled StreamPay program.
    // ---------------------------------------------------------

    let program_path = format!(
        "{}/../../target/deploy/streampay.so",
        env!("CARGO_MANIFEST_DIR")
    );

    svm.add_program_from_file(program_id, program_path)
        .expect("Could not load StreamPay program");


    // ---------------------------------------------------------
    // 3. Create employer and worker wallets.
    // ---------------------------------------------------------

    let employer = Keypair::new();
    let worker = Keypair::new();

    let employer_pubkey = employer.pubkey();
    let worker_pubkey = worker.pubkey();

    // Employer needs SOL for:
    // - transaction fees
    // - Stream PDA creation
    // - escrow token account creation
    // - test mint/account creation
    svm.airdrop(&employer_pubkey, 5_000_000_000)
        .expect("Airdrop failed");


    // ---------------------------------------------------------
    // 4. Create a REAL SPL token mint.
    //
    // 6 decimals matches USDC-style decimals.
    // This is still a test token, not real USDC.
    // ---------------------------------------------------------

    let token_mint = CreateMint::new(
        &mut svm,
        &employer,
    )
    .authority(&employer_pubkey)
    .decimals(6)
    .send()
    .expect("Could not create test token mint");


    // ---------------------------------------------------------
    // 5. Create employer's SPL token account.
    // ---------------------------------------------------------

    let employer_token_account = CreateAccount::new(
        &mut svm,
        &employer,
        &token_mint,
    )
    .owner(&employer_pubkey)
    .send()
    .expect("Could not create employer token account");


    // ---------------------------------------------------------
    // 6. Mint 4,500 test token units to employer.
    // ---------------------------------------------------------

    let stream_id: u64 = 1;
    let total_amount: u64 = 4_500;

    MintTo::new(
        &mut svm,
        &employer,
        &token_mint,
        &employer_token_account,
        total_amount,
    )
    .owner(&employer)
    .send()
    .expect("Could not mint test tokens");


    // Check employer really received the tokens.
    let employer_tokens_before: SplTokenAccount =
        get_spl_account(
            &svm,
            &employer_token_account,
        )
        .expect("Could not read employer token account");

    assert_eq!(
        employer_tokens_before.amount,
        total_amount
    );


    // ---------------------------------------------------------
    // 7. Stream settings.
    // ---------------------------------------------------------

    let duration_seconds: i64 =
        90 * 24 * 60 * 60;


    // ---------------------------------------------------------
    // 8. Calculate Stream PDA.
    //
    // Must match the seeds in lib.rs exactly.
    // ---------------------------------------------------------

    let stream_id_bytes = stream_id.to_le_bytes();

    let (stream_pda, _stream_bump) =
        Address::find_program_address(
            &[
                b"stream",
                employer_pubkey.as_ref(),
                worker_pubkey.as_ref(),
                &stream_id_bytes,
            ],
            &program_id,
        );


    // ---------------------------------------------------------
    // 9. Calculate escrow token account PDA.
    //
    // Must match:
    //
    // seeds = [
    //     b"escrow",
    //     stream.key().as_ref()
    // ]
    // ---------------------------------------------------------

    let (escrow_token_account, _escrow_bump) =
        Address::find_program_address(
            &[
                b"escrow",
                stream_pda.as_ref(),
            ],
            &program_id,
        );


    // ---------------------------------------------------------
    // 10. Build create_stream instruction.
    // ---------------------------------------------------------

    let instruction = Instruction {
        program_id,

        accounts: streampay_program::accounts::CreateStream {
            stream: stream_pda,

            employer: employer_pubkey,

            worker: worker_pubkey,

            token_mint,

            employer_token_account,

            escrow_token_account,

            token_program: TOKEN_ID,

            system_program:
                anchor_lang::system_program::ID,
        }
        .to_account_metas(None),

        data: streampay_program::instruction::CreateStream {
            stream_id,
            total_amount,
            duration_seconds,
        }
        .data(),
    };


    // ---------------------------------------------------------
    // 11. Build and send transaction.
    // ---------------------------------------------------------

    let message = Message::new(
        &[instruction],
        Some(&employer_pubkey),
    );

    let transaction = Transaction::new(
        &[&employer],
        message,
        svm.latest_blockhash(),
    );

    svm.send_transaction(transaction)
        .expect("create_stream transaction failed");
// ---------------------------------------------------------
// Create worker token account.
// This account will receive withdrawn salary tokens.
// ---------------------------------------------------------
// ---------------------------------------------------------
    // 12. Read Stream account.
    // ---------------------------------------------------------

    let account = svm
        .get_account(&stream_pda)
        .expect("Stream account was not created");

    let mut data: &[u8] = &account.data;

    let stream =
        Stream::try_deserialize(&mut data)
            .expect(
                "Could not deserialize Stream account"
            );


    // ---------------------------------------------------------
    // 13. Verify Stream data.
    // ---------------------------------------------------------

    assert_eq!(
        stream.employer,
        employer_pubkey
    );

    assert_eq!(
        stream.worker,
        worker_pubkey
    );

    assert_eq!(
        stream.token_mint,
        token_mint
    );

    assert_eq!(
        stream.stream_id,
        stream_id
    );

    assert_eq!(
        stream.total_amount,
        total_amount
    );

    assert_eq!(
        stream.withdrawn_amount,
        0
    );

    assert_eq!(
        stream.is_cancelled,
        false
    );

    assert!(
        stream.end_time > stream.start_time
    );


    // ---------------------------------------------------------
    // 14. Read employer's token account AFTER create_stream.
    // ---------------------------------------------------------

    let employer_tokens_after: SplTokenAccount =
        get_spl_account(
            &svm,
            &employer_token_account,
        )
        .expect(
            "Could not read employer token account after stream creation"
        );


    // Employer deposited all 4,500 into escrow.
    assert_eq!(
        employer_tokens_after.amount,
        0
    );


    // ---------------------------------------------------------
    // 15. Read escrow token account.
    // ---------------------------------------------------------

    let escrow_tokens: SplTokenAccount =
        get_spl_account(
            &svm,
            &escrow_token_account,
        )
        .expect(
            "Could not read escrow token account"
        );


    // Escrow should now contain all 4,500 tokens.
    assert_eq!(
        escrow_tokens.amount,
        total_amount
    );


    // The Stream PDA is the authority over the escrow.
    assert_eq!(
        escrow_tokens.owner,
        stream_pda
    );


    println!("=================================");
    println!("✅ Stream created with real SPL escrow!");
    println!("Stream PDA: {}", stream_pda);
    println!(
        "Escrow token account: {}",
        escrow_token_account
    );
    println!(
        "Employer balance after deposit: {}",
        employer_tokens_after.amount
    );
    println!(
        "Escrow balance: {}",
        escrow_tokens.amount
    );
    println!("=================================");
}

#[test]
fn test_earned_amount() {
    let stream = Stream {
        employer: Pubkey::default(),
        worker: Pubkey::default(),
        token_mint: Pubkey::default(),

        stream_id: 1,
        total_amount: 4_500,
        withdrawn_amount: 0,
        is_cancelled:false,
        start_time: 1_000,
        end_time: 1_100,

        bump: 255,
    };

    // Before start
    let earned_before = stream
        .earned_amount(900)
        .expect("earned calculation failed");

    assert_eq!(earned_before, 0);

    // Halfway through
    let earned_halfway = stream
        .earned_amount(1_050)
        .expect("earned calculation failed");

    assert_eq!(earned_halfway, 2_250);

    // After stream end
    let earned_finished = stream
        .earned_amount(1_200)
        .expect("earned calculation failed");

    assert_eq!(earned_finished, 4_500);

    println!("=================================");
    println!("✅ Earnings calculation works!");
    println!("Before start: {}", earned_before);
    println!("Halfway: {}", earned_halfway);
    println!("Finished: {}", earned_finished);
    println!("=================================");
}
#[test]
fn test_withdraw_accounting() {
    let program_id = streampay_program::id();

    let mut svm = LiteSVM::new();

    let program_path = format!(
        "{}/../../target/deploy/streampay.so",
        env!("CARGO_MANIFEST_DIR")
    );

    svm.add_program_from_file(program_id, program_path)
        .expect("Could not load StreamPay program");

    let employer = Keypair::new();
let worker = Keypair::new();

let employer_pubkey = employer.pubkey();
let worker_pubkey = worker.pubkey();

svm.airdrop(&employer_pubkey, 5_000_000_000)
    .expect("Employer airdrop failed");

svm.airdrop(&worker_pubkey, 1_000_000_000)
    .expect("Worker airdrop failed");


// ---------------------------------------------------------
// Create a real SPL test mint.
// ---------------------------------------------------------

let token_mint = CreateMint::new(
    &mut svm,
    &employer,
)
.authority(&employer_pubkey)
.decimals(6)
.send()
.expect("Could not create test mint");


// ---------------------------------------------------------
// Create employer token account.
// ---------------------------------------------------------

let employer_token_account = CreateAccount::new(
    &mut svm,
    &employer,
    &token_mint,
)
.owner(&employer_pubkey)
.send()
.expect("Could not create employer token account");


let stream_id: u64 = 2;
let total_amount: u64 = 4_500;
let duration_seconds: i64 = 100;


// ---------------------------------------------------------
// Mint test tokens to employer.
// ---------------------------------------------------------

MintTo::new(
    &mut svm,
    &employer,
    &token_mint,
    &employer_token_account,
    total_amount,
)
.owner(&employer)
.send()
.expect("Could not mint test tokens");


// ---------------------------------------------------------
// Derive Stream PDA.
// ---------------------------------------------------------

let stream_id_bytes = stream_id.to_le_bytes();

let (stream_pda, _bump) = Address::find_program_address(
    &[
        b"stream",
        employer_pubkey.as_ref(),
        worker_pubkey.as_ref(),
        &stream_id_bytes,
    ],
    &program_id,
);


// ---------------------------------------------------------
// Derive escrow PDA.
// ---------------------------------------------------------

let (escrow_token_account, _escrow_bump) =
    Address::find_program_address(
        &[
            b"escrow",
            stream_pda.as_ref(),
        ],
        &program_id,
    );


// ---------------------------------------------------------
// Create the stream.
// ---------------------------------------------------------

let create_instruction = Instruction {
    program_id,

    accounts: streampay_program::accounts::CreateStream {
        stream: stream_pda,
        employer: employer_pubkey,
        worker: worker_pubkey,
        token_mint,
        employer_token_account,
        escrow_token_account,
        token_program: TOKEN_ID,
        system_program: anchor_lang::system_program::ID,
    }
    .to_account_metas(None),

    data: streampay_program::instruction::CreateStream {
        stream_id,
        total_amount,
        duration_seconds,
    }
    .data(),
};

let create_message = Message::new(
    &[create_instruction],
    Some(&employer_pubkey),
);

let create_transaction = Transaction::new(
    &[&employer],
    create_message,
    svm.latest_blockhash(),
);

svm.send_transaction(create_transaction)
    .expect("create_stream failed");
// ---------------------------------------------------------
// Create worker token account.
// This account will receive withdrawn salary tokens.
// ---------------------------------------------------------

let worker_token_account = CreateAccount::new(
    &mut svm,
    &employer,
    &token_mint,
)
.owner(&worker_pubkey)
.send()
.expect("Could not create worker token account");


    // ---------------------------------------------------------
    // Move blockchain time forward.
    // ---------------------------------------------------------

    let mut clock = svm.get_sysvar::<Clock>();

    clock.unix_timestamp += 50;

    svm.set_sysvar(&clock);

    // ---------------------------------------------------------
    // Worker withdraws.
    // ---------------------------------------------------------

    let withdraw_instruction = Instruction {
        program_id,

        accounts: streampay_program::accounts::Withdraw {
    stream: stream_pda,
    worker: worker_pubkey,
    token_mint,
    worker_token_account,
    escrow_token_account,
    token_program: TOKEN_ID,
}
.to_account_metas(None),

        data: streampay_program::instruction::Withdraw {}.data(),
    };

    let withdraw_message = Message::new(
        &[withdraw_instruction],
        Some(&worker.pubkey()),
    );

    let withdraw_transaction = Transaction::new(
        &[&worker],
        withdraw_message,
        svm.latest_blockhash(),
    );

    svm.send_transaction(withdraw_transaction)
        .expect("withdraw failed");
// ---------------------------------------------------------
// Verify real SPL token balances after withdrawal.
// ---------------------------------------------------------
let worker_tokens: SplTokenAccount =
    get_spl_account(&svm, &worker_token_account)
        .expect("Worker token account missing");

let escrow_tokens: SplTokenAccount =
    get_spl_account(&svm, &escrow_token_account)
        .expect("Escrow token account missing");

println!("Worker token balance: {}", worker_tokens.amount);
println!("Escrow token balance: {}", escrow_tokens.amount);

assert_eq!(worker_tokens.amount, 2_250);
assert_eq!(escrow_tokens.amount, 2_250);

    // ---------------------------------------------------------
    // Read the stream back.
    // ---------------------------------------------------------

    let account = svm
        .get_account(&stream_pda)
        .expect("Stream account missing");

    let mut data: &[u8] = &account.data;

    let stream = Stream::try_deserialize(&mut data)
        .expect("Could not deserialize Stream");

    println!("=================================");
    println!("✅ Withdrawal accounting works!");
    println!("Withdrawn amount: {}", stream.withdrawn_amount);
    println!("=================================");

    assert!(stream.withdrawn_amount > 0);
    assert!(stream.withdrawn_amount <= total_amount);
}

#[test]
fn test_cancel_stream_accounting() {
    let program_id = streampay_program::id();

    let mut svm = LiteSVM::new();

    let program_path = format!(
        "{}/../../target/deploy/streampay.so",
        env!("CARGO_MANIFEST_DIR")
    );

    svm.add_program_from_file(program_id, program_path)
        .expect("Could not load StreamPay program");

    let employer = Keypair::new();
let worker = Keypair::new();

let employer_pubkey = employer.pubkey();
let worker_pubkey = worker.pubkey();

svm.airdrop(&employer_pubkey, 5_000_000_000)
    .expect("Employer airdrop failed");


// ---------------------------------------------------------
// Create a real SPL test mint.
// ---------------------------------------------------------

let token_mint = CreateMint::new(
    &mut svm,
    &employer,
)
.authority(&employer_pubkey)
.decimals(6)
.send()
.expect("Could not create test mint");


// ---------------------------------------------------------
// Create employer token account.
// ---------------------------------------------------------

let employer_token_account = CreateAccount::new(
    &mut svm,
    &employer,
    &token_mint,
)
.owner(&employer_pubkey)
.send()
.expect("Could not create employer token account");


let stream_id: u64 = 3;
let total_amount: u64 = 4_500;
let duration_seconds: i64 = 100;


// ---------------------------------------------------------
// Mint tokens to employer.
// ---------------------------------------------------------

MintTo::new(
    &mut svm,
    &employer,
    &token_mint,
    &employer_token_account,
    total_amount,
)
.owner(&employer)
.send()
.expect("Could not mint test tokens");


// ---------------------------------------------------------
// Derive Stream PDA.
// ---------------------------------------------------------

let stream_id_bytes = stream_id.to_le_bytes();

let (stream_pda, _bump) = Address::find_program_address(
    &[
        b"stream",
        employer_pubkey.as_ref(),
        worker_pubkey.as_ref(),
        &stream_id_bytes,
    ],
    &program_id,
);


// ---------------------------------------------------------
// Derive escrow PDA.
// ---------------------------------------------------------

let (escrow_token_account, _escrow_bump) =
    Address::find_program_address(
        &[
            b"escrow",
            stream_pda.as_ref(),
        ],
        &program_id,
    );


// ---------------------------------------------------------
// Create stream.
// ---------------------------------------------------------

let create_instruction = Instruction {
    program_id,

    accounts: streampay_program::accounts::CreateStream {
        stream: stream_pda,
        employer: employer_pubkey,
        worker: worker_pubkey,
        token_mint,
        employer_token_account,
        escrow_token_account,
        token_program: TOKEN_ID,
        system_program: anchor_lang::system_program::ID,
    }
    .to_account_metas(None),

    data: streampay_program::instruction::CreateStream {
        stream_id,
        total_amount,
        duration_seconds,
    }
    .data(),
};

let create_message = Message::new(
    &[create_instruction],
    Some(&employer_pubkey),
);

let create_transaction = Transaction::new(
    &[&employer],
    create_message,
    svm.latest_blockhash(),
);

svm.send_transaction(create_transaction)
    .expect("create_stream failed");
let worker_token_account = CreateAccount::new(
    &mut svm,
    &employer,
    &token_mint,
)
.owner(&worker_pubkey)
.send()
.expect("Could not create worker token account");


    // Move time forward by 50 seconds
    let mut clock = svm.get_sysvar::<Clock>();
    clock.unix_timestamp += 50;
    svm.set_sysvar(&clock);

    // Cancel stream
    let cancel_instruction = Instruction {
        program_id,

        accounts: streampay_program::accounts::CancelStream {
    stream: stream_pda,
    employer: employer_pubkey,
    worker: worker_pubkey,
    token_mint,
    employer_token_account,
    worker_token_account,
    escrow_token_account,
    token_program: TOKEN_ID,
}
.to_account_metas(None),

        data: streampay_program::instruction::CancelStream {}.data(),
    };

    let cancel_message = Message::new(
        &[cancel_instruction],
        Some(&employer.pubkey()),
    );

    let cancel_transaction = Transaction::new(
        &[&employer],
        cancel_message,
        svm.latest_blockhash(),
    );

    svm.send_transaction(cancel_transaction)
        .expect("cancel_stream failed");

let worker_tokens: SplTokenAccount =
    get_spl_account(&svm, &worker_token_account)
        .expect("Worker token account missing");

let employer_tokens: SplTokenAccount =
    get_spl_account(&svm, &employer_token_account)
        .expect("Employer token account missing");

let escrow_tokens: SplTokenAccount =
    get_spl_account(&svm, &escrow_token_account)
        .expect("Escrow token account missing");

println!("Worker balance after cancel: {}", worker_tokens.amount);
println!("Employer refund balance: {}", employer_tokens.amount);
println!("Escrow balance after cancel: {}", escrow_tokens.amount);

assert_eq!(worker_tokens.amount, 2_250);
assert_eq!(employer_tokens.amount, 2_250);
assert_eq!(escrow_tokens.amount, 0);

    // Read stream
    let account = svm
        .get_account(&stream_pda)
        .expect("Stream account missing");

    let mut data: &[u8] = &account.data;

    let stream = Stream::try_deserialize(&mut data)
        .expect("Could not deserialize Stream");

    println!("=================================");
    println!("✅ Cancel accounting works!");
    println!("Withdrawn / worker earned: {}", stream.withdrawn_amount);
    println!("New end time: {}", stream.end_time);
    println!("=================================");

    assert_eq!(stream.withdrawn_amount, 2_250);
}

#[test]
fn test_reject_zero_amount_stream() {
    let program_id = streampay_program::id();
    let mut svm = LiteSVM::new();

    // Load the compiled StreamPay program.
    let program_path = format!(
        "{}/../../target/deploy/streampay.so",
        env!("CARGO_MANIFEST_DIR")
    );

    svm.add_program_from_file(program_id, program_path)
        .expect("Could not load StreamPay program");

    // Create employer and worker wallets.
    let employer = Keypair::new();
    let worker = Keypair::new();

    let employer_pubkey = employer.pubkey();
    let worker_pubkey = worker.pubkey();

    svm.airdrop(&employer_pubkey, 5_000_000_000)
        .expect("Employer airdrop failed");

    // Create SPL test-token mint.
    let token_mint = CreateMint::new(
        &mut svm,
        &employer,
    )
    .authority(&employer_pubkey)
    .decimals(6)
    .send()
    .expect("Could not create test mint");

    // Create employer token account.
    let employer_token_account = CreateAccount::new(
        &mut svm,
        &employer,
        &token_mint,
    )
    .owner(&employer_pubkey)
    .send()
    .expect("Could not create employer token account");

    // Intentionally invalid stream:
    // amount is ZERO.
    let stream_id: u64 = 100;
    let total_amount: u64 = 0;
    let duration_seconds: i64 = 100;

    // Derive Stream PDA.
    let stream_id_bytes = stream_id.to_le_bytes();

    let (stream_pda, _stream_bump) =
        Address::find_program_address(
            &[
                b"stream",
                employer_pubkey.as_ref(),
                worker_pubkey.as_ref(),
                &stream_id_bytes,
            ],
            &program_id,
        );

    // Derive escrow PDA.
    let (escrow_token_account, _escrow_bump) =
        Address::find_program_address(
            &[
                b"escrow",
                stream_pda.as_ref(),
            ],
            &program_id,
        );

    // Build the invalid create_stream instruction.
    let instruction = Instruction {
        program_id,

        accounts: streampay_program::accounts::CreateStream {
            stream: stream_pda,
            employer: employer_pubkey,
            worker: worker_pubkey,
            token_mint,
            employer_token_account,
            escrow_token_account,
            token_program: TOKEN_ID,
            system_program:
                anchor_lang::system_program::ID,
        }
        .to_account_metas(None),

        data: streampay_program::instruction::CreateStream {
            stream_id,
            total_amount,
            duration_seconds,
        }
        .data(),
    };

    let message = Message::new(
        &[instruction],
        Some(&employer_pubkey),
    );

    let transaction = Transaction::new(
        &[&employer],
        message,
        svm.latest_blockhash(),
    );

    // The transaction MUST fail because total_amount = 0.
    let result = svm.send_transaction(transaction);

    assert!(
        result.is_err(),
        "Zero-amount stream should have been rejected"
    );

    println!("=================================");
    println!("✅ SECURITY TEST PASSED");
    println!("Zero-amount salary stream was rejected.");
    println!("=================================");
}

#[test]
fn test_reject_unauthorized_withdrawal() {
    let program_id = streampay_program::id();
    let mut svm = LiteSVM::new();

    // Load StreamPay program.
    let program_path = format!(
        "{}/../../target/deploy/streampay.so",
        env!("CARGO_MANIFEST_DIR")
    );

    svm.add_program_from_file(program_id, program_path)
        .expect("Could not load StreamPay program");

    // ---------------------------------------------------------
    // Create three wallets:
    // Employer
    // Real worker
    // Unauthorized attacker
    // ---------------------------------------------------------
    let employer = Keypair::new();
    let worker = Keypair::new();
    let attacker = Keypair::new();

    let employer_pubkey = employer.pubkey();
    let worker_pubkey = worker.pubkey();
    let attacker_pubkey = attacker.pubkey();

    svm.airdrop(&employer_pubkey, 5_000_000_000)
        .expect("Employer airdrop failed");

    svm.airdrop(&attacker_pubkey, 1_000_000_000)
        .expect("Attacker airdrop failed");

    // ---------------------------------------------------------
    // Create SPL test token.
    // ---------------------------------------------------------
    let token_mint = CreateMint::new(
        &mut svm,
        &employer,
    )
    .authority(&employer_pubkey)
    .decimals(6)
    .send()
    .expect("Could not create test mint");

    let employer_token_account = CreateAccount::new(
        &mut svm,
        &employer,
        &token_mint,
    )
    .owner(&employer_pubkey)
    .send()
    .expect("Could not create employer token account");

    let worker_token_account = CreateAccount::new(
        &mut svm,
        &employer,
        &token_mint,
    )
    .owner(&worker_pubkey)
    .send()
    .expect("Could not create worker token account");

    // Attacker has their own token account.
    let attacker_token_account = CreateAccount::new(
        &mut svm,
        &employer,
        &token_mint,
    )
    .owner(&attacker_pubkey)
    .send()
    .expect("Could not create attacker token account");

    let stream_id: u64 = 101;
    let total_amount: u64 = 4_500;
    let duration_seconds: i64 = 100;

    MintTo::new(
        &mut svm,
        &employer,
        &token_mint,
        &employer_token_account,
        total_amount,
    )
    .owner(&employer)
    .send()
    .expect("Could not mint test tokens");

    // ---------------------------------------------------------
    // Derive the REAL worker's Stream PDA.
    // ---------------------------------------------------------
    let stream_id_bytes = stream_id.to_le_bytes();

    let (stream_pda, _stream_bump) =
        Address::find_program_address(
            &[
                b"stream",
                employer_pubkey.as_ref(),
                worker_pubkey.as_ref(),
                &stream_id_bytes,
            ],
            &program_id,
        );

    let (escrow_token_account, _escrow_bump) =
        Address::find_program_address(
            &[
                b"escrow",
                stream_pda.as_ref(),
            ],
            &program_id,
        );

    // ---------------------------------------------------------
    // Employer creates a valid stream for Worker A.
    // ---------------------------------------------------------
    let create_instruction = Instruction {
        program_id,

        accounts: streampay_program::accounts::CreateStream {
            stream: stream_pda,
            employer: employer_pubkey,
            worker: worker_pubkey,
            token_mint,
            employer_token_account,
            escrow_token_account,
            token_program: TOKEN_ID,
            system_program:
                anchor_lang::system_program::ID,
        }
        .to_account_metas(None),

        data: streampay_program::instruction::CreateStream {
            stream_id,
            total_amount,
            duration_seconds,
        }
        .data(),
    };

    let create_message = Message::new(
        &[create_instruction],
        Some(&employer_pubkey),
    );

    let create_transaction = Transaction::new(
        &[&employer],
        create_message,
        svm.latest_blockhash(),
    );

    svm.send_transaction(create_transaction)
        .expect("Valid stream creation failed");

    // ---------------------------------------------------------
    // Move blockchain time halfway through the stream.
    // Worker has now earned some salary.
    // ---------------------------------------------------------
    let mut clock = svm.get_sysvar::<Clock>();

    clock.unix_timestamp += 50;

    svm.set_sysvar(&clock);

    // ---------------------------------------------------------
    // ATTACK:
    // Attacker tries to withdraw Worker A's stream.
    //
    // We deliberately pass attacker as the "worker".
    // Anchor's has_one = worker constraint should reject this.
    // ---------------------------------------------------------
    let unauthorized_withdraw_instruction = Instruction {
        program_id,

        accounts: streampay_program::accounts::Withdraw {
            stream: stream_pda,
            worker: attacker_pubkey,
            token_mint,
            worker_token_account:
                attacker_token_account,
            escrow_token_account,
            token_program: TOKEN_ID,
        }
        .to_account_metas(None),

        data:
            streampay_program::instruction::Withdraw {}
                .data(),
    };

    let unauthorized_message = Message::new(
        &[unauthorized_withdraw_instruction],
        Some(&attacker_pubkey),
    );

    let unauthorized_transaction = Transaction::new(
        &[&attacker],
        unauthorized_message,
        svm.latest_blockhash(),
    );

    let result =
        svm.send_transaction(unauthorized_transaction);

    // The attack MUST fail.
    assert!(
        result.is_err(),
        "Unauthorized wallet should not be able to withdraw salary"
    );

    // ---------------------------------------------------------
    // Verify no tokens were stolen.
    // ---------------------------------------------------------
    let attacker_tokens: SplTokenAccount =
        get_spl_account(
            &svm,
            &attacker_token_account,
        )
        .expect("Could not read attacker token account");

    let worker_tokens: SplTokenAccount =
        get_spl_account(
            &svm,
            &worker_token_account,
        )
        .expect("Could not read worker token account");

    let escrow_tokens: SplTokenAccount =
        get_spl_account(
            &svm,
            &escrow_token_account,
        )
        .expect("Could not read escrow token account");

    assert_eq!(
        attacker_tokens.amount,
        0,
        "Attacker received tokens"
    );

    assert_eq!(
        worker_tokens.amount,
        0,
        "Worker balance should remain unchanged"
    );

    assert_eq!(
        escrow_tokens.amount,
        total_amount,
        "Escrow balance changed after unauthorized attempt"
    );

    println!("=================================");
    println!("✅ SECURITY TEST PASSED");
    println!(
        "Unauthorized wallet could not withdraw worker salary."
    );
    println!("Attacker received: {}", attacker_tokens.amount);
    println!("Escrow protected: {}", escrow_tokens.amount);
    println!("=================================");
}

#[test]
fn test_reject_unauthorized_cancellation() {
    let program_id = streampay_program::id();
    let mut svm = LiteSVM::new();

    // Load StreamPay program.
    let program_path = format!(
        "{}/../../target/deploy/streampay.so",
        env!("CARGO_MANIFEST_DIR")
    );

    svm.add_program_from_file(program_id, program_path)
        .expect("Could not load StreamPay program");

    // ---------------------------------------------------------
    // Create three wallets:
    // Real employer
    // Worker
    // Unauthorized attacker
    // ---------------------------------------------------------
    let employer = Keypair::new();
    let worker = Keypair::new();
    let attacker = Keypair::new();

    let employer_pubkey = employer.pubkey();
    let worker_pubkey = worker.pubkey();
    let attacker_pubkey = attacker.pubkey();

    svm.airdrop(&employer_pubkey, 5_000_000_000)
        .expect("Employer airdrop failed");

    svm.airdrop(&attacker_pubkey, 1_000_000_000)
        .expect("Attacker airdrop failed");

    // ---------------------------------------------------------
    // Create SPL test token.
    // ---------------------------------------------------------
    let token_mint = CreateMint::new(
        &mut svm,
        &employer,
    )
    .authority(&employer_pubkey)
    .decimals(6)
    .send()
    .expect("Could not create test mint");

    // Real employer token account.
    let employer_token_account = CreateAccount::new(
        &mut svm,
        &employer,
        &token_mint,
    )
    .owner(&employer_pubkey)
    .send()
    .expect("Could not create employer token account");

    // Worker token account.
    let worker_token_account = CreateAccount::new(
        &mut svm,
        &employer,
        &token_mint,
    )
    .owner(&worker_pubkey)
    .send()
    .expect("Could not create worker token account");

    // Attacker token account.
    let attacker_token_account = CreateAccount::new(
        &mut svm,
        &employer,
        &token_mint,
    )
    .owner(&attacker_pubkey)
    .send()
    .expect("Could not create attacker token account");

    let stream_id: u64 = 102;
    let total_amount: u64 = 4_500;
    let duration_seconds: i64 = 100;

    // Give the real employer tokens.
    MintTo::new(
        &mut svm,
        &employer,
        &token_mint,
        &employer_token_account,
        total_amount,
    )
    .owner(&employer)
    .send()
    .expect("Could not mint test tokens");

    // ---------------------------------------------------------
    // Derive Stream PDA using REAL employer + worker.
    // ---------------------------------------------------------
    let stream_id_bytes = stream_id.to_le_bytes();

    let (stream_pda, _stream_bump) =
        Address::find_program_address(
            &[
                b"stream",
                employer_pubkey.as_ref(),
                worker_pubkey.as_ref(),
                &stream_id_bytes,
            ],
            &program_id,
        );

    let (escrow_token_account, _escrow_bump) =
        Address::find_program_address(
            &[
                b"escrow",
                stream_pda.as_ref(),
            ],
            &program_id,
        );

    // ---------------------------------------------------------
    // Real employer creates a valid stream.
    // ---------------------------------------------------------
    let create_instruction = Instruction {
        program_id,

        accounts: streampay_program::accounts::CreateStream {
            stream: stream_pda,
            employer: employer_pubkey,
            worker: worker_pubkey,
            token_mint,
            employer_token_account,
            escrow_token_account,
            token_program: TOKEN_ID,
            system_program:
                anchor_lang::system_program::ID,
        }
        .to_account_metas(None),

        data: streampay_program::instruction::CreateStream {
            stream_id,
            total_amount,
            duration_seconds,
        }
        .data(),
    };

    let create_message = Message::new(
        &[create_instruction],
        Some(&employer_pubkey),
    );

    let create_transaction = Transaction::new(
        &[&employer],
        create_message,
        svm.latest_blockhash(),
    );

    svm.send_transaction(create_transaction)
        .expect("Valid stream creation failed");

    // ---------------------------------------------------------
    // Move blockchain time halfway through the stream.
    // ---------------------------------------------------------
    let mut clock = svm.get_sysvar::<Clock>();

    clock.unix_timestamp += 50;

    svm.set_sysvar(&clock);

    // ---------------------------------------------------------
    // ATTACK:
    // Attacker pretends to be the employer and tries
    // to cancel the REAL employer's stream.
    //
    // Anchor's has_one = employer constraint should reject it.
    // ---------------------------------------------------------
    let unauthorized_cancel_instruction = Instruction {
        program_id,

        accounts: streampay_program::accounts::CancelStream {
            stream: stream_pda,

            // Deliberately wrong employer.
            employer: attacker_pubkey,

            worker: worker_pubkey,
            token_mint,

            // Must belong to the supplied employer, so we use
            // the attacker's token account here.
            employer_token_account:
                attacker_token_account,

            worker_token_account,
            escrow_token_account,
            token_program: TOKEN_ID,
        }
        .to_account_metas(None),

        data:
            streampay_program::instruction::CancelStream {}
                .data(),
    };

    let unauthorized_message = Message::new(
        &[unauthorized_cancel_instruction],
        Some(&attacker_pubkey),
    );

    let unauthorized_transaction = Transaction::new(
        &[&attacker],
        unauthorized_message,
        svm.latest_blockhash(),
    );

    let result =
        svm.send_transaction(unauthorized_transaction);

    // Unauthorized cancellation MUST fail.
    assert!(
        result.is_err(),
        "Unauthorized wallet should not be able to cancel stream"
    );

    // ---------------------------------------------------------
    // Verify the failed attack moved NO tokens.
    // ---------------------------------------------------------
    let attacker_tokens: SplTokenAccount =
        get_spl_account(
            &svm,
            &attacker_token_account,
        )
        .expect("Could not read attacker token account");

    let worker_tokens: SplTokenAccount =
        get_spl_account(
            &svm,
            &worker_token_account,
        )
        .expect("Could not read worker token account");

    let escrow_tokens: SplTokenAccount =
        get_spl_account(
            &svm,
            &escrow_token_account,
        )
        .expect("Could not read escrow token account");

    assert_eq!(
        attacker_tokens.amount,
        0,
        "Attacker received escrow tokens"
    );

    assert_eq!(
        worker_tokens.amount,
        0,
        "Worker balance changed during failed attack"
    );

    assert_eq!(
        escrow_tokens.amount,
        total_amount,
        "Escrow changed after unauthorized cancellation"
    );

    // ---------------------------------------------------------
    // Verify Stream itself was NOT marked cancelled.
    // ---------------------------------------------------------
    let account = svm
        .get_account(&stream_pda)
        .expect("Stream account missing");

    let mut data: &[u8] = &account.data;

    let stream =
        Stream::try_deserialize(&mut data)
            .expect("Could not deserialize Stream");

    assert!(
        !stream.is_cancelled,
        "Unauthorized attempt incorrectly cancelled the stream"
    );

    println!("=================================");
    println!("✅ SECURITY TEST PASSED");
    println!(
        "Unauthorized wallet could not cancel employer stream."
    );
    println!("Attacker received: {}", attacker_tokens.amount);
    println!("Worker received: {}", worker_tokens.amount);
    println!("Escrow protected: {}", escrow_tokens.amount);
    println!("Stream cancelled: {}", stream.is_cancelled);
    println!("=================================");
}
