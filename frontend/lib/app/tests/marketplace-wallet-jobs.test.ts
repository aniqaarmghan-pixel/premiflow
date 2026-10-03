import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  PHANTOM_INSTALL_URL,
  WALLET_CONNECT_COPY,
  walletConnectFailure,
  walletConnectStep,
} from "../wallet-connect";

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
const base = {
  connected: false,
  connecting: false,
  selected: false,
  selectedReady: false,
  installed: [] as string[],
  hasModal: true,
};

test("wallet connect step: connected / busy / selected-but-disconnected / none selected / no modal / none installed", () => {
  assert.equal(walletConnectStep({ ...base, connected: true }), "connected");
  assert.equal(walletConnectStep({ ...base, connecting: true }), "busy");
  assert.equal(walletConnectStep({ ...base, selected: true, selectedReady: true, installed: ["Phantom"] }), "connect");
  assert.equal(walletConnectStep({ ...base, installed: ["Phantom"] }), "open_modal");
  assert.equal(walletConnectStep({ ...base, installed: ["Phantom"], hasModal: false }), "select_installed");
  assert.equal(walletConnectStep({ ...base, hasModal: false }), "not_installed");
  assert.equal(walletConnectStep({ ...base, selected: true, selectedReady: false }), "not_installed");
  assert.equal(walletConnectStep({ ...base }), "open_modal");
});

test("wallet connect failures: user rejection, not installed, generic", () => {
  const rejected = walletConnectFailure({
    name: "WalletConnectionError",
    message: "User rejected the request.",
    error: { code: 4001 },
  });
  assert.equal(rejected.kind, "rejected");
  assert.equal(rejected.message, WALLET_CONNECT_COPY.rejected);
  assert.equal(walletConnectFailure({ name: "WalletNotReadyError" }).kind, "not_installed");
  assert.equal(walletConnectFailure(new Error("boom")).kind, "failed");
  assert.equal(walletConnectFailure(undefined).kind, "failed");
  assert.match(PHANTOM_INSTALL_URL, /^https:\/\/phantom\.app\//);
});

test("connect hook drives the real wallet-adapter flow (useWallet connect/select + modal setVisible)", () => {
  const hook = read("lib/hooks/useWalletConnectRequest.ts");
  assert.match(hook, /useWallet\(\)/);
  assert.match(hook, /WalletModalContext/);
  assert.match(hook, /modal\.setVisible\(true\)/);
  assert.match(hook, /case "connect":\s*connect\(\)/);
  assert.match(hook, /select\(installed\[0\]/);
  // select() alone never connects (no autoConnect) -> effect finishes with connect().
  assert.match(hook, /if \(!requestedRef\.current \|\| !wallet \|\| connected \|\| connecting\) return;[\s\S]*connect\(\)\.catch/);
  assert.match(hook, /setFailure\(walletConnectFailure\(err\)\)/);
  const providers = read("app/providers.tsx");
  assert.match(providers, /<WalletProvider wallets=\{wallets\}>/);
  assert.doesNotMatch(providers, /autoConnect/);
});

test("Apply and Hire share WalletActionPrompt; actions unlock reactively from useWallet", () => {
  const prompt = read("components/site/WalletActionPrompt.tsx");
  assert.match(prompt, /useWalletConnectRequest\(\)/);
  assert.match(prompt, /if \(connected\) return null;/);
  assert.match(prompt, /role="alert"/);
  assert.match(prompt, /href=\{PHANTOM_INSTALL_URL\}/);
  assert.doesNotMatch(prompt, /useWalletModal/);
  const job = read("components/marketplace/MarketplaceJobDetail.tsx");
  const gig = read("components/marketplace/MarketplaceGigDetail.tsx");
  assert.match(job, /disabled=\{busy \|\| !session\.wallet\}/);
  assert.match(job, /<WalletActionPrompt[^>]*action="Connect wallet to apply"/);
  assert.match(gig, /disabled=\{busy \|\| !session\.wallet\}/);
  assert.match(gig, /<WalletActionPrompt[^>]*action="Connect wallet to hire"/);
  const session = read("lib/hooks/useMarketplace.ts");
  assert.match(session, /const \{ publicKey, signMessage \} = useWallet\(\);\s*const wallet = publicKey\?\.toBase58\(\) \?\? null;/);
  const shell = read("components/site/PublicShell.tsx");
  assert.doesNotMatch(shell, /WalletControl|WalletMultiButton/);
});

test("job cards are whole-card links everywhere; inner actions isolated", () => {
  const parts = read("components/marketplace/MarketplaceParts.tsx");
  const card = parts.slice(parts.indexOf("export function JobSummaryCard"), parts.indexOf("export function JobTags"));
  assert.match(card, /wholeCardLink = true,/);
  assert.match(card, /href=\{`\/marketplace\/jobs\/\$\{job\.id\}`\}/);
  assert.match(card, /after:absolute after:inset-0/);
  assert.match(card, /event\.stopPropagation\(\)/);
  assert.match(card, /onClick=\{stopInner\} onKeyDown=\{stopInner\}>\s*\{footer\}/);
  for (const file of [
    "components/marketplace/MarketplaceBrowse.tsx",
    "components/marketplace/MarketplaceSearch.tsx",
    "components/marketplace/MarketplaceSaved.tsx",
    "components/marketplace/MarketplaceProfileView.tsx",
    "components/marketplace/MarketplaceMyJobs.tsx",
  ]) {
    const src = read(file);
    assert.match(src, /<JobSummaryCard/, file);
    assert.doesNotMatch(src, /wholeCardLink=\{false\}/, file);
  }
  assert.match(read("components/marketplace/MarketplaceSaved.tsx"), /<MarketplaceSaveToggle type="job"/);
});

test("public navbar logo is larger responsively without changing artwork", () => {
  const shell = read("components/site/PublicShell.tsx");
  assert.match(shell, /<span className="inline-flex sm:hidden">\s*<BrandMark light size=\{34\} wordmarkFontSize="1\.3rem" \/>/);
  assert.match(shell, /<span className="hidden sm:inline-flex">\s*<BrandMark light size=\{38\} wordmarkFontSize="1\.42rem" \/>/);
  assert.match(shell, /h-16 w-full max-w-7xl/);
  const mark = read("components/brand/BrandMark.tsx");
  assert.match(mark, /wordmarkFontSize\?: string;/);
  assert.doesNotMatch(shell, /zoom|scale\(/);
});
