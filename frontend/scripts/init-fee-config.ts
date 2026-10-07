/**
 * PREMIFLOW - initialize_fee_config (Devnet). MANUAL ONLY.
 *
 * Never imported, never run by tests, CI, build, or package scripts. Run it
 * yourself, once, after the program upgrade. Placeholders only:
 *
 *   PREMIFLOW_CONFIRM_INIT_FEE_CONFIG=yes \
 *   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
 *   ANCHOR_WALLET=<PATH_TO_PROGRAM_UPGRADE_AUTHORITY_KEYPAIR_JSON> \
 *   PREMIFLOW_TREASURY_OWNER=<TREASURY_WALLET_PUBKEY> \
 *   PREMIFLOW_FEE_ADMIN=<FEE_ADMIN_PUBKEY> \
 *   PREMIFLOW_FEE_BPS=300 \
 *   npx tsx scripts/init-fee-config.ts
 *
 * - The signer must be the program's upgrade authority (enforced on-chain).
 * - PREMIFLOW_TREASURY_OWNER is the token AUTHORITY of the fee token accounts
 *   (the program checks fee recipients are owned by it), not a token account.
 * - Key material is loaded only by Anchor's provider from ANCHOR_WALLET; this
 *   script never prints, copies or inspects it. Program ID comes from the IDL.
 */
import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

import idl from "../lib/streampay-v2/idl/streampay.json";

const BPF_UPGRADEABLE_LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
const FEE_CONFIG_SEED = new TextEncoder().encode("fee_config");

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function main() {
  if (process.env.PREMIFLOW_CONFIRM_INIT_FEE_CONFIG !== "yes") {
    fail("Refusing to run: set PREMIFLOW_CONFIRM_INIT_FEE_CONFIG=yes to confirm this manual Devnet step.");
  }
  if (!/devnet/i.test(process.env.ANCHOR_PROVIDER_URL ?? "")) {
    fail("Refusing to run: ANCHOR_PROVIDER_URL must point at Devnet.");
  }
  const feeBps = Number(process.env.PREMIFLOW_FEE_BPS ?? "300");
  if (feeBps !== 300) fail("Refusing to run: PREMIFLOW_FEE_BPS must be 300 (3% employer-paid).");
  const treasuryRaw = process.env.PREMIFLOW_TREASURY_OWNER;
  if (!treasuryRaw) fail("Set PREMIFLOW_TREASURY_OWNER to the treasury wallet public key.");
  const treasury = new PublicKey(treasuryRaw);

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new anchor.Program(idl as anchor.Idl, provider);
  const programId = program.programId;
  const admin = new PublicKey(process.env.PREMIFLOW_FEE_ADMIN || provider.wallet.publicKey.toBase58());
  const [feeConfig] = PublicKey.findProgramAddressSync([FEE_CONFIG_SEED], programId);
  const [programData] = PublicKey.findProgramAddressSync([programId.toBuffer()], BPF_UPGRADEABLE_LOADER);

  const existing = await provider.connection.getAccountInfo(feeConfig);
  if (existing) fail(`fee_config already exists at ${feeConfig.toBase58()}; use update_fee_config instead.`);

  console.log(`Program: ${programId.toBase58()}`);
  console.log(`Upgrade authority (signer): ${provider.wallet.publicKey.toBase58()}`);
  console.log(`Fee admin: ${admin.toBase58()}`);
  console.log(`Treasury owner: ${treasury.toBase58()}`);
  console.log(`fee_config PDA: ${feeConfig.toBase58()}`);
  console.log(`Fee: ${feeBps} bps`);

  type Builder = {
    accountsPartial: (accounts: Record<string, PublicKey>) => { rpc: () => Promise<string> };
  };
  const methods = program.methods as unknown as Record<
    string,
    (args: { admin: PublicKey; treasury: PublicKey; feeBps: number }) => Builder
  >;
  const signature = await methods
    .initializeFeeConfig({ admin, treasury, feeBps })
    .accountsPartial({
      authority: provider.wallet.publicKey,
      feeConfig,
      programData,
    })
    .rpc();
  console.log(`initialize_fee_config signature: ${signature}`);
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
