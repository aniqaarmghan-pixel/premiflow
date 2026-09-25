import {
  remainingEmployerRefund,
  remainingFreelancerClaim,
  type ContractStatus,
  type ContractView,
  type PaymentModeName,
} from "@/lib/streampay-v2";

import type { GroupedContracts, RoleFilter, StatusFilter } from "./view-model";
import { filterContracts } from "./view-model";

/** Overview dashboard card destinations (stable hrefs). */
export const OVERVIEW_DASHBOARD_HREFS = {
  availableToWithdraw: "/contracts?claim=withdraw",
  availableRefund: "/contracts?claim=refund",
  activeContracts: "/contracts?status=active",
  pendingReviews: "/contracts?status=review",
  liveStreams: "/contracts?type=streaming&status=active",
  allContracts: "/contracts",
} as const;

const CONTRACT_STATUSES: readonly ContractStatus[] = [
  "Draft",
  "PendingAcceptance",
  "PendingEmployerApproval",
  "Active",
  "Completed",
  "Cancelled",
  "Disputed",
  "Resolved",
  "Declined",
  "Expired",
  "ActivationRejected",
] as const;

const PAYMENT_TYPES: readonly PaymentModeName[] = [
  "Fixed",
  "Milestone",
  "Streaming",
  "Hourly",
] as const;

export type ContractsListStatusFilter = StatusFilter | "review";

export type ContractsListTypeFilter = "all" | PaymentModeName;

export type ContractsListClaimFilter = "none" | "withdraw" | "refund";

export type ContractsListQuery = {
  role: RoleFilter;
  status: ContractsListStatusFilter;
  type: ContractsListTypeFilter;
  claim: ContractsListClaimFilter;
};

export const DEFAULT_CONTRACTS_LIST_QUERY: ContractsListQuery = {
  role: "all",
  status: "all",
  type: "all",
  claim: "none",
};

type SearchParamsLike = {
  get(name: string): string | null;
};

function parseRole(raw: string | null): RoleFilter {
  if (raw === "hiring" || raw === "working") return raw;
  return "all";
}

function parseStatus(raw: string | null): ContractsListStatusFilter {
  if (!raw) return "all";
  const trimmed = raw.trim();
  if (!trimmed) return "all";
  if (trimmed.toLowerCase() === "review") return "review";
  if (trimmed.toLowerCase() === "active") return "Active";
  const exact = CONTRACT_STATUSES.find((s) => s === trimmed);
  if (exact) return exact;
  const ci = CONTRACT_STATUSES.find(
    (s) => s.toLowerCase() === trimmed.toLowerCase()
  );
  return ci ?? "all";
}

function parseType(raw: string | null): ContractsListTypeFilter {
  if (!raw) return "all";
  const trimmed = raw.trim();
  if (!trimmed) return "all";
  const match = PAYMENT_TYPES.find(
    (t) => t.toLowerCase() === trimmed.toLowerCase()
  );
  return match ?? "all";
}

function parseClaim(raw: string | null): ContractsListClaimFilter {
  if (raw === "withdraw" || raw === "refund") return raw;
  return "none";
}

/** Parse `/contracts` search params into a list query. Unknown values are ignored. */
export function parseContractsListQuery(
  params: SearchParamsLike
): ContractsListQuery {
  return {
    role: parseRole(params.get("role")),
    status: parseStatus(params.get("status")),
    type: parseType(params.get("type")),
    claim: parseClaim(params.get("claim")),
  };
}

function serializeStatus(status: ContractsListStatusFilter): string | null {
  if (status === "all") return null;
  if (status === "review") return "review";
  if (status === "Active") return "active";
  return status;
}

function serializeType(type: ContractsListTypeFilter): string | null {
  if (type === "all") return null;
  return type.toLowerCase();
}

/** Build a `/contracts` href from a list query (omits default params). */
export function buildContractsListHref(
  query: Partial<ContractsListQuery> = {}
): string {
  const full: ContractsListQuery = {
    ...DEFAULT_CONTRACTS_LIST_QUERY,
    ...query,
  };
  const sp = new URLSearchParams();
  if (full.role !== "all") sp.set("role", full.role);
  const type = serializeType(full.type);
  if (type) sp.set("type", type);
  const status = serializeStatus(full.status);
  if (status) sp.set("status", status);
  if (full.claim !== "none") sp.set("claim", full.claim);
  const qs = sp.toString();
  return qs ? `/contracts?${qs}` : "/contracts";
}

/**
 * Apply Overview/Contracts URL filters. Role + exact status use existing
 * `filterContracts`; review / type / claim are additional predicates.
 */
export function filterContractsByListQuery(
  grouped: GroupedContracts,
  query: ContractsListQuery
): ContractView[] {
  const statusForRoleFilter: StatusFilter =
    query.status === "review" || query.status === "all" ? "all" : query.status;
  let list = filterContracts(grouped, query.role, statusForRoleFilter);

  if (query.status === "review") {
    list = list.filter((c) => c.openReviewCount > 0);
  }
  if (query.type !== "all") {
    list = list.filter((c) => c.paymentMode === query.type);
  }
  if (query.claim === "withdraw") {
    list = list.filter((c) => remainingFreelancerClaim(c) > 0n);
  } else if (query.claim === "refund") {
    list = list.filter((c) => remainingEmployerRefund(c) > 0n);
  }
  return list;
}

export function contractsListQueryIsDefault(query: ContractsListQuery): boolean {
  return (
    query.role === "all" &&
    query.status === "all" &&
    query.type === "all" &&
    query.claim === "none"
  );
}

/** Empty-state copy when a URL filter yields no rows. */
export function contractsListEmptyCopy(query: ContractsListQuery): {
  title: string;
  body: string;
} {
  if (query.claim === "withdraw") {
    return {
      title: "Nothing available to withdraw",
      body: "No loaded contracts currently have claimable freelancer pay for this wallet.",
    };
  }
  if (query.claim === "refund") {
    return {
      title: "Nothing available to refund",
      body: "No loaded contracts currently have an employer refund balance for this wallet.",
    };
  }
  if (query.status === "review") {
    return {
      title: "No pending reviews",
      body: "No loaded contracts currently have an open review.",
    };
  }
  if (query.type === "Streaming" && query.status === "Active") {
    return {
      title: "No live streams",
      body: "No active Streaming contracts for this wallet match this filter.",
    };
  }
  if (query.status === "Active") {
    return {
      title: "No active contracts",
      body: "No loaded contracts are currently Active for this filter.",
    };
  }
  if (query.role === "hiring") {
    return {
      title: "No hiring contracts",
      body: "When you fund work, those contracts appear here. The same wallet can still show Working contracts separately.",
    };
  }
  if (query.role === "working") {
    return {
      title: "No working contracts",
      body: "When someone hires this wallet, those contracts appear here.",
    };
  }
  if (!contractsListQueryIsDefault(query)) {
    return {
      title: "No matching contracts",
      body: "Nothing matches this filter. Clear filters or create a new contract.",
    };
  }
  return {
    title: "No contracts yet",
    body: "Create a protected contract or wait for an employer to send one to this wallet.",
  };
}
