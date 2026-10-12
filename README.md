# PREMIFLOW

**Freelance work, protected on Solana.**

> **Hackathon submission branch: `streampay-v2` (default branch)**
> Please review this branch. All current product, program and test code lives here.

- **Live app:** https://premiflow.vercel.app
- **X:** https://x.com/premiflow

---

## Overview

PREMIFLOW is a Solana-powered freelance marketplace. Clients and freelancers find each
other, agree on terms, and work under contracts whose funds are protected on-chain.
Payment is released according to the agreed contract type, and disagreements go to a
structured Resolution Desk instead of being left to trust.

### Supported contract types

| Type          | How payment works                                              |
|---------------|----------------------------------------------------------------|
| **Fixed**     | One protected amount, released when the work is approved.      |
| **Milestone** | Work split into milestones, each reviewed and released in turn.|
| **Streaming** | Earnings accrue over time while the contract is active.        |
| **Hourly**    | Tracked sessions settled against a protected hourly budget.    |

### Core workflow

**Discover → Proposal → Agree → Fund → Work → Review/Record → Collect → Resolve**

### Key features

- **Marketplace:** browse services and jobs, profiles and proposals
- **Protected funding:** contract funds are held by the on-chain program, not by either party
- **Paid trials:** an optional paid trial before the main engagement starts
- **Messaging:** per-contract conversations between client and freelancer
- **Notifications:** offer, work submission and contract outcome updates
- **Payment tracking:** funded, earned, released and available amounts per contract
- **Work review:** submit, approve or request revisions on delivered work
- **Dispute Resolution Desk:** open a dispute, attach evidence and receive a resolver settlement

## Architecture: on-chain vs off-chain

**On-chain (Solana / Anchor, Devnet).** Critical settlement actions and protected funds are
handled by the Anchor program in `programs/streampay`: contract creation and funding,
acceptance and activation, trials, work-unit review, streaming accrual, hourly sessions,
cancellation, disputes and resolution, platform fees, and SPL token withdrawals and refunds.

- Cluster: Devnet
- Program ID: `EgZvP1pnkQFiCQkrqvEUQQLJa1hGg6UUYUUcVCZMEyhd`
  (set in `Anchor.toml` and `declare_id!` in `programs/streampay/src/lib.rs`)

**Off-chain (app services and database).** Profiles, proposals, messaging, notifications and
other supporting app data are stored off-chain in a Postgres database accessed by the
Next.js server.

## Tech stack

- **Blockchain:** Solana, Rust, Anchor, SPL tokens
- **Client:** `@solana/web3.js`, `@coral-xyz/anchor`, `@solana/spl-token`, Solana wallet adapter (Phantom)
- **App:** Next.js, React, TypeScript, Tailwind CSS
- **Data:** database-backed services (Postgres via Drizzle ORM)
- **Hosting:** Vercel

## Current status

- Working product on **Solana Devnet**.
- The Devnet test token is shown in the app as **Demo USDT**. It has no real value.
- PREMIFLOW does **not** claim a Mainnet launch, revenue or user traction.

## Repository structure

```
.
├── Anchor.toml            # Anchor workspace config (Devnet program ID, test script)
├── Cargo.toml             # Rust workspace (programs/*)
├── rust-toolchain.toml    # Rust 1.89.0
├── programs/
│   └── streampay/
│       ├── src/           # Anchor program (V2 contracts in src/v2)
│       └── tests/         # Rust integration tests (LiteSVM)
└── frontend/              # Next.js app
    ├── app/               # Routes, pages and API routes
    ├── components/        # UI components
    ├── lib/               # Client, server and Solana logic, plus TypeScript tests
    ├── idl/               # Anchor IDL used by the app
    ├── drizzle/           # SQL database migrations
    ├── scripts/           # Manual Devnet scripts (demo seed, fee config, E2E)
    └── public/            # Static assets and media
```

## Local setup

**Prerequisites:** Node.js and npm. For program work: Rust 1.89.0 (pinned in
`rust-toolchain.toml`), the Solana CLI and Anchor CLI.

```bash
cd frontend
npm install
cp .env.example .env.local   # then fill in your own values
npm run dev                  # http://localhost:3000
```

Environment variables (names from `frontend/.env.example`, all server-only):

| Variable                                         | Purpose                                         |
|--------------------------------------------------|-------------------------------------------------|
| `SOLANA_RPC_URL`                                 | Devnet RPC used by server routes                |
| `DATABASE_URL`                                   | Postgres connection string                      |
| `SESSION_SECRET`                                 | 32+ character secret for wallet sessions        |
| `ACCOUNT_AUTH_SECRET`                            | Separate 32+ character secret for account auth  |
| `APP_ORIGIN`                                     | Allowed origin, e.g. `http://localhost:3000`    |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`       | Optional Google sign-in (set both or neither)   |
| `COPILOT_ENABLED`, `COPILOT_PROVIDER`, `COPILOT_MODEL`, `OPENAI_API_KEY`, `GROQ_API_KEY` | Optional assistant settings |

Database schema migrations are in `frontend/drizzle/` and are managed with `drizzle-kit`
using `frontend/drizzle.config.ts`, which reads `DATABASE_URL` from `frontend/.env.local`.

Other scripts from `frontend/package.json`:

```bash
npm run build      # production build
npm run start      # serve the production build
npm run lint       # ESLint
```

## Testing

**Frontend and server (TypeScript)**, from `frontend/`:

```bash
npm run typecheck  # tsc --noEmit
npm test           # tsx --test: lib/streampay-v2, lib/app and lib/server test suites
```

**Anchor program (Rust)**, from the repo root. The tests in `programs/streampay/tests/`
run in LiteSVM against `target/deploy/streampay.so`, so rebuild the program after any
program change:

```bash
cargo build-sbf
cargo test         # also the test script configured in Anchor.toml
```

## Security

- Never commit secrets or private keys: no `.env` / `.env.local` files, wallet keypairs
  (`id.json`, `*-keypair.json`) or `target/deploy` keypairs.
- `.gitignore` already excludes these. Only `frontend/.env.example`, which has no real
  values, is tracked.
- All secrets are server-only. Never expose them with a `NEXT_PUBLIC_` prefix.

## Team

- **Aniqa Armghan:** Founder & Full-Stack Solana Developer
- **Armghan Ashraf:** Business & Financial Strategy Advisor
- **Rabia Noor:** CTO / Developer & DevOps Engineer
