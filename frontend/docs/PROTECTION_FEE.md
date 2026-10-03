# Protection fee (monetization readiness only)

Status: **disabled, 0%**. No fee is charged, shown or transferred today.

## What exists

- `lib/app/protection-fee.ts`: one central `PROTECTION_FEE_CONFIG`, set to
  `PROTECTION_FEE_DISABLED` (`enabled: false`, `bps: 0`), and a display-only
  `protectionFeeBreakdown()` helper.
- `components/contracts/ProtectionFeeSummary.tsx`: optional review/summary rows
  (Freelancer receives / Platform protection fee / Employer total). They render
  nothing while the fee is disabled.

## What deliberately does not exist

- No fee transfer, treasury account, Rust/program fee logic or token deduction.
- The helper is not imported by `send.ts`, `instructions.ts` or the
  CreateWizard transaction path, so every escrowed and released amount is
  exactly what the parties agreed. Tests enforce this.

## Intended future model

1. The freelancer always receives the full agreed amount.
2. The employer may later pay a transparent platform/protection fee on top,
   shown before signing as "Employer total".
3. The fee value must come from a trusted source (program config account or
   a server-verified setting), never from client-editable input.

## Before enabling a real fee

A real implementation needs a protocol and payment review, program changes
(fee account / treasury, fee instruction or escrow split), an audit of the
escrow math, and a Devnet redeploy plus migration plan for existing
contracts. Only after that should `PROTECTION_FEE_CONFIG` be wired to the
trusted value and the display rows switched on.
