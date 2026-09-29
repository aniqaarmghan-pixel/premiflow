# PREMIFLOW Master Backlog

Branch `streampay-v2`, base HEAD `7d279a9`. All work below is uncommitted in the working tree.
States: DONE / MANUAL E2E REQUIRED / IN PROGRESS / BLOCKED / DEFERRED / FUTURE.
Scaffolding is never DONE. "DONE" = implemented + automated tests pass; UI flows still need the manual E2E listed below.

AI principle (binding): "PREMIFLOW AI may explain, organize and summarize. It must not decide who wins a dispute, determine financial allocation, replace the designated resolver, sign resolve_dispute, claim funds, refund funds, or move escrow."

## DONE

- DONE - Resumable milestone create (milestone-create-plan, resume after partial failure). Tests pass.
- DONE - Create resilience P1-P3 (idempotent retries, confirmed-signature tracking, recovery copy). Tests pass.
- DONE - Lifecycle notifications route (`/api/contracts/[address]/lifecycle-notifications`): session + origin check, on-chain re-read, idempotent key kind:contract:recipient.
- DONE - Contract outcome notifications (`/api/contracts/[address]/outcome-notification`): `contract_ended` (Completed/Cancelled incl. Hourly end; caller must be a party; notifies counterparty) and `settlement_recorded` (status Resolved; caller party or resolver; notifies BOTH parties with collect/refund-aware copy; deep link `#resolution`). Server re-reads chain; deterministic dedupe key; reuses existing kinds `contract_cancelled` / `dispute_resolved` (no migration). Triggered from ContractDetail on load (settlement) and on an observed in-page terminal transition (ended). Tests: `contract-outcome-notification.test.ts`.
- DONE - One-click collect (freelancer).
- DONE - Unread badges (messages + notifications).
- DONE - Desktop density pass 1 (no zoom/root-font hacks).
- DONE - Resolver discovery (fetchContractsForResolver / useResolverCases) and resolver UX in Resolution Center (read-only statements, controls only for on-chain resolver + Disputed, fresh on-chain precheck before tx, BigInt settlement validation, All to freelancer/employer, Review settlement summary).
- DONE - Resolver Workspace: `/resolver`, `/resolver/assigned`, `/resolver/resolved`, `/resolver/activity`; nav Resolver Dashboard / Assigned Disputes / Resolved Cases / Resolver Activity / Help & Support; "Switch workspace" toggle persisted in localStorage when the wallet also has party contracts; party nav untouched. Metrics (Open disputes, Awaiting statements, Ready for decision, Resolved cases) from real data; readiness from case statements readable by the resolver, honest "unknown" otherwise. Resolved Cases show freelancer_settlement_amount / employer refundable; no tx link (no stored signature). Activity from on-chain dispute timestamps only. Tests: `resolver-workspace.test.ts`.
- DONE - Post-resolution party guidance: "Settlement recorded"; freelancer uses Collect pay / Claim, employer uses Claim refund; resolving moves no tokens.
- DONE - Authorization matrix tests: employer, freelancer, unrelated wallet, wrong resolver all blocked from resolver controls / precheck.
- DONE - Hourly: employer sees info state while a freelancer session runs: "Freelancer work session in progress. The contract can be ended after the freelancer stops the current session. Need to end it now? Open a dispute." (replaces disabled End button; hourly-ux test updated to assert the approved UX).
- DONE - Contract tabs: All | As employer | As freelancer | Resolving (counts are totals, not "Active").
- DONE - Terminology: no user-facing "On-chain reference" remains (verified by grep); "View transaction" only rendered for real signatures.
- DONE - Rust disputed earned-pay fix (withdraw during Disputed pays released - withdrawn). Rust suite 402/402 at time of change. MANUAL E2E REQUIRED on Devnet redeploy.
- DONE - Backward-clock handling: `canonical_stream_accrued` returns 0 when now <= start_time; `saturating_sub(stream_released_amount)` in accrual (contract.rs ~640, release_stream_accrual.rs:53). Present in working tree.
- DONE - Accounting before transfer: `withdraw_freelancer.rs` updates `withdrawn_amount` before `transfer_checked` CPI (failed CPI aborts tx). Present in working tree.

## MANUAL E2E REQUIRED

- MANUAL E2E REQUIRED - `frontend/scripts/n51-runtime-e2e.ts` browser TODO: automated browser run not wired; execute manually.
- MANUAL E2E REQUIRED - Full per-mode matrix: Fixed / Milestone / Streaming / Hourly x (create, accept, fund, work/submit, approve/revise, collect, end/cancel, dispute, statements, resolve, collect settlement, claim refund).
- DONE - Known Devnet results: Hourly normal lifecycle PASSED (escrow drained to 0). Streaming dispute lifecycle PASSED on contract 92za...LyTW with resolver BiSD...nKaF: dispute opened, resolver settlement recorded on-chain, freelancer collected the remaining settlement, and employer claimed the remaining refund.
- DONE - Resolver Workspace manually tested with the real resolver wallet. Resolver discovery/filtering bug found and fixed: merely being designated resolver no longer creates a resolver case; only contracts that actually entered dispute are shown. Real UI count corrected from 15 false cases to 1 genuine resolved case.
- MANUAL E2E REQUIRED - Outcome notifications (ended / settlement recorded) visible in bell for correct recipients.
- MANUAL E2E REQUIRED - Rust earned-pay fix after a sanctioned redeploy.

## IN PROGRESS

- DONE - Live Streaming dispute on 92za...LyTW completed on Devnet: ResolveDispute succeeded, freelancer settlement was collected, employer refund was claimed, and the case appears as Resolved in the resolver workspace.

## P0 SECURITY / PROTOCOL

- DEFERRED (P0, program change) - Resolver timeout / dispute fallback / liveness guarantee. Today a silent resolver locks the disputed amount forever. Design considerations:
  - Timeout start: `disputed_at` (already on-chain) vs. last statement time; must be immutable once set.
  - Trigger: permissionless crank vs. party-only instruction after `disputed_at + T`; T configurable per contract at creation (needs layout) or global constant.
  - Settlement semantics per mode: Fixed/Milestone (refund unreleased to employer? split?), Streaming (accrued-to-dispute to freelancer, rest refund), Hourly (logged-but-unapproved time?). Must be a pre-agreed default, not a judgement.
  - Fairness: default must not reward the party who caused the dispute; consider 50/50 of contested amount or "status quo ante" rules; disclose at contract creation.
  - Released/withdrawn: never claw back released/withdrawn funds; invariant released + award >= withdrawn.
  - Contested amount only; uncontested portions follow normal rules.
  - Griefing: opening disputes to freeze funds; timeouts too short to let resolver act; resolver colluding by waiting.
  - Layout: reuse `disputed_at`, use part of the 19 reserved bytes for timeout seconds / fallback policy; backward compat for existing accounts (zero = legacy/no timeout), IDL version bump, migration of live contracts not possible without realloc.
- DEFERRED (P0) - Sock-puppet resolver hardening / F5: resolver must not equal employer/freelancer (and ideally not controlled by them); enforce at create in program; UI warns today only.
- DEFERRED (P0) - Resolver key custody: hardware wallet / multisig for resolver keys; rotation policy.
- DEFERRED (P0, program change) - Mutual settlement and resolver rotation (both parties agree to replace an unresponsive resolver or settle without one).
- DEFERRED (P1, program change) - close_contract / rent recovery for terminal accounts.
- DEFERRED (program change) - Employer end during an active Hourly session (today: must dispute or wait for stop).

## P1 PRODUCT

- DEFERRED - Evidence snapshots: party selects a contract message -> immutable snapshot on case (source message id, sender, timestamp, submitted-by, text, contract/case); server checks message belongs to contract and submitter is party; resolver read-only. Reason: needs new table + route + migration + UI; not cheaply safe this pass. No file uploads.
- DEFERRED - Negotiation "Request changes" before acceptance: off-chain request (message/notification) with copy "on-chain terms are unchanged; revision requires a new offer"; employer sees it. Reason: needs new notification kind (DB CHECK constraint) or message type; scheduled next.
- DEFERRED - Notifications for work submitted / approved / revision requested (and dedicated kinds `contract_ended` / `settlement_recorded`): requires extending the NOTIFICATION_KINDS DB CHECK via migration.
- DEFERRED - P4 duration-based acceptance deadline (instead of absolute) + create-draft persistence.
- DEFERRED - Resolver Activity from real tx history (needs indexer / signature store); today uses on-chain dispute timestamps only.
- DEFERRED - Store resolve_dispute signature to show "View transaction" on Resolved Cases.

## P2 UX / POLISH

- DEFERRED - Desktop density pass 2 (ContractDetail, ResolutionCenter, Streaming/Hourly cards, metric cards, side panel, actions, messages, lifecycle). New Resolver Workspace already uses compact spacing.
- DEFERRED - Messaging extras: date separators, jump-to-latest, no repeat sound for read events (audit pending). `?chat=1` deep link already exists.
- DEFERRED - Tailwind container-query verification across breakpoints.

## BLOCKED / DEPENDENCY

- BLOCKED - Any program change above: requires Rust change + audit + redeploy approval (not allowed this session).
- BLOCKED - Realtime/push/email notifications: need infra (websocket/push provider/email service).

## FUTURE MARKETPLACE

- FUTURE - Job posts, proposals, talent profiles, search, reputation/ratings, resolver marketplace with bonded/staked resolvers, fees.

## FUTURE ADMIN / OPERATIONS

- FUTURE - Admin console. Boundary: admin is NOT a resolver and cannot move escrow or decide disputes; admin may view metrics, moderate off-chain content, manage resolver registry (off-chain), and audit logs. Nothing built this session by design.

## FUTURE AI

- FUTURE - AI summaries of disputes/statements for the resolver (explain/organize only), contract drafting help. Must follow the AI principle above verbatim.

## PRODUCTION READINESS

- FUTURE - Mainnet program audit; upgrade authority to multisig; resolver timeout shipped first.
- FUTURE - RPC redundancy + rate limits; monitoring/alerting; error tracking.
- FUTURE - DB backups, migrations runbook, data retention/privacy policy.
- FUTURE - Security review of session/auth (SIWS), CSRF/origin checks, abuse limits on notification/outcome routes.
- FUTURE - Legal/terms, fee disclosures, token list (mainnet USDC mint), accessibility audit.
- FUTURE - Realtime/push/email delivery for notifications.

## ACCOUNT, IDENTITY & MARKETPLACE ROADMAP

### P1 - Account & Identity Foundation

- PLANNED - Email sign-up and sign-in for PREMIFLOW users.
- PLANNED - Secure authenticated sessions and sign-out.
- PLANNED - Persistent PREMIFLOW user profile independent of wallet connection.
- PLANNED - Link one or more Solana wallets to a PREMIFLOW account with wallet-signature ownership verification.
- PLANNED - Wallet connection remains mandatory for on-chain actions. Email authentication must never authorize, sign, resolve, collect, refund, fund, or otherwise move escrow funds.
- PLANNED - Account/profile settings and basic account recovery flow.
- PLANNED - Role is flexible rather than permanent: the same PREMIFLOW account may hire as an employer, work as a freelancer, or hold other authorized roles where appropriate.

### P1 - Marketplace MVP

- PLANNED - Freelancer/talent profiles: display name, headline, bio, skills, portfolio/work samples, availability and relevant work history.
- PLANNED - Employer/company profiles.
- PLANNED - Employers can create and manage job posts.
- PLANNED - Users can browse/search/filter open jobs.
- PLANNED - Freelancers can submit proposals/applications.
- PLANNED - Employers can review, accept or decline proposals.
- PLANNED - Accepting a proposal should lead into the existing PREMIFLOW contract flow with appropriate employer, freelancer and job information prefilled; the on-chain contract remains authoritative for escrow/payment state.
- PLANNED - Marketplace dashboards for posted jobs, proposals sent/received, hires and active work.
- PLANNED - Marketplace notifications for relevant job/proposal/hiring events.
- PLANNED - Reputation/reviews only after the underlying contract relationship can be verified; design anti-abuse rules before implementation.

### FUTURE - Marketplace Expansion

- FUTURE - Advanced talent/job search and discovery.
- FUTURE - Public portfolio and verified PREMIFLOW contract history controls.
- FUTURE - Reputation/ratings expansion and anti-manipulation controls.
- FUTURE - Resolver marketplace / resolver discovery, with security and conflict-of-interest requirements.
- FUTURE - Marketplace/service fees only after explicit economic and legal design.

### Product Identity Boundary

PREMIFLOW account identity and Solana wallet authority are separate layers.

Email/session authentication may authorize access to off-chain PREMIFLOW data such as profiles, job posts, proposals, messages and preferences. It must never substitute for the wallet signature required by the Solana program for an on-chain action. Existing program authorization remains authoritative for contract funds and dispute settlement.
