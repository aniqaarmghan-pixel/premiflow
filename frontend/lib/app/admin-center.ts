/**
 * Admin Center: one PREMIFLOW admin account can use both desks.
 * Help Desk has no escrow settlement authority. Resolution Desk lists disputes
 * assigned to the connected wallet; only the on-chain designated resolver
 * wallet can sign Resolve dispute (program-enforced). No AI decides disputes
 * or allocations.
 */
export const ADMIN_CENTER_HREF = "/admin";

export type AdminDesk = {
  id: "help" | "resolution";
  title: string;
  href: string;
  body: string;
  authority: string;
};

export const ADMIN_DESKS: readonly AdminDesk[] = [
  {
    id: "help",
    title: "Help Desk",
    href: "/support",
    body: "Answer account, wallet and product questions for PREMIFLOW users.",
    authority: "No escrow settlement authority. Help Desk cannot move, release or refund funds.",
  },
  {
    id: "resolution",
    title: "Resolution Desk",
    href: "/resolver",
    body: "Assigned disputed contracts: contract facts, employer and freelancer statements, submitted message evidence, the disputed amount and the settlement allocation.",
    authority:
      "Resolve dispute is available only when the connected wallet is the contract's on-chain designated resolver. The program enforces the signature.",
  },
] as const;

export const ADMIN_CENTER_COPY = {
  title: "Admin Center",
  intro: "The same PREMIFLOW admin account can use the Help Desk and the Resolution Desk.",
  humanDecision:
    "PREMIFLOW does not use AI to decide disputes or allocations. The human designated resolver reviews the case and signs.",
} as const;
