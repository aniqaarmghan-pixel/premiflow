import { isRealSignature } from "@/lib/app/resolve-signature-store";
import { formatUnix } from "@/lib/app/datetime";
import { formatTokenAmount } from "@/lib/app/money";
import { resolverCaseCard } from "@/lib/app/resolver-cases";
import type { ContractView } from "@/lib/streampay-v2";

/**
 * Resolver Workspace view models. Everything here is derived from on-chain
 * contracts discovered for the resolver wallet plus case data the resolver is
 * allowed to read. Visibility is not authorization: the program enforces
 * resolve_dispute (has_one = resolver).
 */
export type ResolverWorkspaceView = "dashboard" | "assigned" | "resolved" | "activity";
export type CaseReadiness = "awaiting_statements" | "ready" | "resolved" | "unknown";
export type StatementPresence = { employer: boolean; freelancer: boolean };
export type CaseLookup =
  | { state: "loaded"; statements: StatementPresence }
  | { state: "not_created" }
  | { state: "unavailable" };
export type ReadinessMap = Readonly<Record<string, CaseReadiness>>;

export const READINESS_LABEL: Record<CaseReadiness, string> = {
  awaiting_statements: "Awaiting statements",
  ready: "Ready for decision",
  resolved: "Resolved",
  unknown: "Readiness unknown",
};

export const RESOLVER_WORKSPACE_COPY = {
  notAdmin:
    "You only see disputes where this wallet is the designated resolver. This is not an admin console; the program enforces every settlement.",
  connect: "Connect the resolver wallet to see disputes assigned to it.",
  loadError: "Could not load assigned disputes. Try again shortly.",
  none: "No disputes are assigned to this wallet.",
  noOpen: "No open disputes need attention.",
  readinessUnknown: (n: number) =>
    `Readiness is unknown for ${n} dispute${n === 1 ? "" : "s"}. Verify your wallet to read case statements.`,
  resolvedNote:
    "Settlement recorded on-chain. The parties collect or claim their amounts separately; recording the settlement does not move tokens.",
  activityEmpty: "No resolver activity yet.",
  activityNote: "Built from on-chain dispute timestamps of contracts assigned to this wallet.",
  txHistoryTitle: "Recent on-chain transactions",
  txHistoryNote: "Read from the RPC for contracts assigned to this wallet (any party or resolver). Links open the block explorer for this network.",
  txHistoryLoading: "Loading on-chain transactions...",
  txHistoryEmpty: "No on-chain transactions found for your assigned contracts.",
  txHistoryError: "On-chain transaction history could not be loaded right now. Dispute timestamps below are still accurate.",
  switchToResolver: "Switch to resolver workspace",
  switchToContracts: "Switch to contracts workspace",
} as const;

type StatementLike = { body?: string | null } | null | undefined;

export function statementPresence(input: {
  employerStatement?: StatementLike;
  freelancerStatement?: StatementLike;
}): StatementPresence {
  const has = (s: StatementLike) =>
    Boolean(s && typeof s.body === "string" && s.body.trim().length > 0);
  return { employer: has(input.employerStatement), freelancer: has(input.freelancerStatement) };
}

export function caseReadiness(
  contract: Pick<ContractView, "status">,
  lookup?: CaseLookup
): CaseReadiness {
  if (contract.status === "Resolved") return "resolved";
  if (contract.status !== "Disputed") return "unknown";
  if (!lookup || lookup.state === "unavailable") return "unknown";
  if (lookup.state === "not_created") return "awaiting_statements";
  return lookup.statements.employer && lookup.statements.freelancer
    ? "ready"
    : "awaiting_statements";
}

export function readinessFor(
  contract: Pick<ContractView, "status" | "address">,
  map: ReadinessMap
): CaseReadiness {
  if (contract.status === "Resolved") return "resolved";
  if (contract.status !== "Disputed") return "unknown";
  return map[contract.address.toBase58()] ?? "unknown";
}

type CaseLike = Pick<ContractView, "status" | "address" | "disputedAt">;

export type ResolverMetrics = {
  open: number;
  awaitingStatements: number;
  readyForDecision: number;
  readinessUnknown: number;
  resolved: number;
};

export function resolverWorkspaceMetrics(
  cases: readonly CaseLike[],
  map: ReadinessMap
): ResolverMetrics {
  const m: ResolverMetrics = {
    open: 0,
    awaitingStatements: 0,
    readyForDecision: 0,
    readinessUnknown: 0,
    resolved: 0,
  };
  for (const c of cases) {
    if (c.status === "Resolved") {
      m.resolved += 1;
      continue;
    }
    if (c.status !== "Disputed") continue;
    m.open += 1;
    const r = readinessFor(c, map);
    if (r === "ready") m.readyForDecision += 1;
    else if (r === "awaiting_statements") m.awaitingStatements += 1;
    else m.readinessUnknown += 1;
  }
  return m;
}

export function groupAssignedDisputes<T extends CaseLike>(cases: readonly T[], map: ReadinessMap) {
  const groups = { awaiting: [] as T[], ready: [] as T[], unknown: [] as T[], resolved: [] as T[] };
  for (const c of cases) {
    if (c.status === "Resolved") {
      groups.resolved.push(c);
      continue;
    }
    if (c.status !== "Disputed") continue;
    const r = readinessFor(c, map);
    if (r === "ready") groups.ready.push(c);
    else if (r === "awaiting_statements") groups.awaiting.push(c);
    else groups.unknown.push(c);
  }
  return groups;
}

const RANK: Record<CaseReadiness, number> = {
  ready: 0,
  awaiting_statements: 1,
  unknown: 2,
  resolved: 3,
};

/** Open disputes, decision-ready first, then oldest first. */
export function disputesRequiringAttention<T extends CaseLike>(
  cases: readonly T[],
  map: ReadinessMap
): T[] {
  return cases
    .filter((c) => c.status === "Disputed")
    .sort(
      (a, b) =>
        RANK[readinessFor(a, map)] - RANK[readinessFor(b, map)] || a.disputedAt - b.disputedAt
    );
}

export type ResolvedCaseRow = {
  address: string;
  title: string;
  typeLabel: string;
  href: string;
  freelancerSettlementLabel: string;
  employerRefundableLabel: string;
  /** Only a real confirmed signature may ever be linked; none is stored today. */
  txSignature: string | null;
};

export function resolvedCaseRow(
  contract: ContractView,
  decimals: number | undefined,
  txSignature: string | null = null
): ResolvedCaseRow {
  const card = resolverCaseCard(contract, decimals);
  return {
    address: contract.address.toBase58(),
    title: card.title,
    typeLabel: card.typeLabel,
    href: card.href,
    freelancerSettlementLabel: formatTokenAmount(contract.freelancerSettlementAmount, decimals),
    employerRefundableLabel: formatTokenAmount(contract.employerRefundableAmount, decimals),
    // Only a real, locally recorded resolve signature; never invented.
    txSignature: isRealSignature(txSignature) ? txSignature : null,
  };
}

export type ResolverActivityItem = {
  key: string;
  at: number;
  atLabel: string;
  title: string;
  detail: string;
  href: string;
};

export function resolverActivity(cases: readonly ContractView[]): ResolverActivityItem[] {
  return cases
    .filter((c) => c.disputedAt > 0 && (c.status === "Disputed" || c.status === "Resolved"))
    .map((c) => {
      const card = resolverCaseCard(c, undefined);
      return {
        key: `${c.address.toBase58()}:disputed:${c.disputedAt}`,
        at: c.disputedAt,
        atLabel: formatUnix(c.disputedAt),
        title: `Dispute assigned - ${card.title}`,
        detail: c.status === "Resolved" ? "Settlement recorded" : "Awaiting your decision",
        href: card.href,
      };
    })
    .sort((a, b) => b.at - a.at);
}

export type WorkspaceMode = "resolver" | "party";

export function parseWorkspaceMode(value: unknown): WorkspaceMode | null {
  return value === "resolver" || value === "party" ? value : null;
}

export type WorkspaceSnapshot = {
  stored: WorkspaceMode | null;
  resolverCaseCount: number;
  partyContractCount: number | null;
};

export function parseWorkspaceSnapshot(snapshot: string): WorkspaceSnapshot {
  const [mode = "", r = "", p = ""] = snapshot.split("|");
  const rc = Number.parseInt(r, 10);
  const pc = Number.parseInt(p, 10);
  return {
    stored: parseWorkspaceMode(mode),
    resolverCaseCount: Number.isFinite(rc) && rc > 0 ? rc : 0,
    partyContractCount: Number.isFinite(pc) && pc >= 0 ? pc : null,
  };
}

/** Resolver workspace only exists with resolver cases; a stored choice wins. */
export function resolveWorkspaceMode(input: WorkspaceSnapshot): WorkspaceMode {
  if (input.resolverCaseCount <= 0) return "party";
  if (input.stored) return input.stored;
  return input.partyContractCount === 0 ? "resolver" : "party";
}

export function canSwitchWorkspace(resolverCaseCount: number): boolean {
  return resolverCaseCount > 0;
}

export const RESOLVER_NAV = [
  { href: "/resolver", label: "Resolver Dashboard" },
  { href: "/resolver/assigned", label: "Assigned Disputes" },
  { href: "/resolver/resolved", label: "Resolved Cases" },
  { href: "/resolver/activity", label: "Resolver Activity" },
  { href: "/support", label: "Help & Support" },
] as const;

export function isNavActive(href: string, pathname: string): boolean {
  if (href === "/" || href === "/resolver") return pathname === href;
  return pathname.startsWith(href);
}
