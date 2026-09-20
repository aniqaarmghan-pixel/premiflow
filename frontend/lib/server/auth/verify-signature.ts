import { ed25519 } from "@noble/curves/ed25519.js";
import { PublicKey } from "@solana/web3.js";

export function decodeSignature(raw: string): Uint8Array | null {
  try {
    const bytes = Buffer.from(raw, "base64");
    if (bytes.length !== 64) return null;
    return new Uint8Array(bytes);
  } catch {
    return null;
  }
}

export function verifyWalletMessageSignature(input: {
  wallet: string;
  message: string;
  signature: string;
}): boolean {
  const signature = decodeSignature(input.signature);
  if (!signature) return false;
  let pubkey: PublicKey;
  try {
    pubkey = new PublicKey(input.wallet);
  } catch {
    return false;
  }
  const message = new TextEncoder().encode(input.message);
  try {
    return ed25519.verify(signature, message, pubkey.toBytes());
  } catch {
    return false;
  }
}
