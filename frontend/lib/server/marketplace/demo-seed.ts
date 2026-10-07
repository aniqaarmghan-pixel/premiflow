/**
 * Devnet demo marketplace seed: 10 freelancer profiles, 10 gigs and 10 jobs.
 *
 * Every record is fictional and carries the "devnet demo" skill tag (shown as
 * a small Demo badge in the UI) plus a short trailing note. IDs and wallet
 * addresses are deterministic, so seeding twice updates the same rows instead
 * of duplicating them. Demo wallet addresses are hashes mapped onto the
 * ed25519 curve: no private key is generated, stored or known by anyone, so
 * nobody can sign in as a demo profile. No reviews, contracts or transactions
 * are created. Writes go through the existing marketplace store methods only.
 */
import { createHash } from "node:crypto";

import { PublicKey } from "@solana/web3.js";

import { DEVNET_CLUSTER, getActiveCluster } from "@/lib/cluster";
import type { MarketplaceCategorySlug } from "@/lib/app/marketplace-categories";
import { DEMO_SKILL_TAG } from "@/lib/app/marketplace-demo";

import { JOB_DESCRIPTION_MAX, JOB_TITLE_MAX } from "./service";
import {
  JOB_SKILLS_MAX,
  parseCategory,
  parseSkills,
  validateGigInput,
  validateProfileInput,
} from "./catalog-validation";
import type {
  GigPackage,
  JobPaymentMode,
  MarketplaceGigRecord,
  MarketplaceJobRecord,
  MarketplaceProfileRecord,
  MarketplaceStore,
  ProfileAvailability,
} from "./store";

export const DEMO_SEED_FLAG = "PREMIFLOW_ALLOW_DEMO_SEED";
/** Shared with the UI, which shows a small "Demo" badge instead of this skill chip. */
export { DEMO_SKILL_TAG };

const DEMO_LABEL = "premiflow-devnet-demo:v1";
/** Fixed namespace for deterministic (RFC 4122 v5) demo record IDs. */
const DEMO_UUID_NAMESPACE = "3b8f5c1e-9a24-4d7b-8f61-2c0e7d9a4b15";

/* Short trailing notes: card previews show the real summary first; the Demo badge discloses. */
const PROFILE_NOTE = "Devnet demo profile: fictional, not a real person.";
const GIG_NOTE = "Devnet demo gig: fictional sample, not a real offer.";
const JOB_NOTE = "Devnet demo job: fictional sample, not a real client.";

/* ---------------- deterministic ids and addresses ---------------- */

export function demoUuid(name: string): string {
  const ns = Buffer.from(DEMO_UUID_NAMESPACE.replace(/-/g, ""), "hex");
  const bytes = Buffer.from(createHash("sha1").update(ns).update(`${DEMO_LABEL}:${name}`, "utf8").digest().subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Public address only: a hash placed on the curve, never a keypair. */
export function demoAddress(name: string): string {
  for (let counter = 0; counter < 256; counter += 1) {
    const bytes = createHash("sha256").update(`${DEMO_LABEL}:wallet:${name}:${counter}`, "utf8").digest();
    if (PublicKey.isOnCurve(bytes)) return new PublicKey(bytes).toBase58();
  }
  throw new Error("Could not derive a demo address.");
}

function units(whole: number): string {
  const decimals = DEVNET_CLUSTER.paymentMintDecimals ?? 6;
  return (BigInt(whole) * 10n ** BigInt(decimals)).toString();
}

function demoMint(): string {
  if (!DEVNET_CLUSTER.paymentMint) throw new Error("Devnet payment mint is not configured.");
  return DEVNET_CLUSTER.paymentMint;
}

/* ---------------- source data ---------------- */

type ProfileSource = {
  key: string;
  name: string;
  headline: string;
  body: string;
  location: string;
  skills: string[];
  rate: number;
  availability: ProfileAvailability;
};

type PackageSource = [title: string, scope: string, price: number, days: number, revisions: number];

type GigSource = {
  key: string;
  owner: string;
  title: string;
  body: string;
  category: MarketplaceCategorySlug;
  paymentMode: JobPaymentMode;
  skills: string[];
  price?: number;
  deliveryDays?: number;
  packages?: [PackageSource, PackageSource, PackageSource];
};

type JobSource = {
  key: string;
  employer: number;
  title: string;
  body: string;
  location: string;
  category: MarketplaceCategorySlug;
  paymentMode: JobPaymentMode;
  /** Whole tokens; for Hourly jobs this is the hourly rate. */
  budget: number;
  skills: string[];
};

const PROFILES: ProfileSource[] = [
  {
    key: "amara",
    name: "Amara Nwosu",
    headline: "Solana smart contract engineer · Rust & Anchor · Lagos (remote)",
    body: "Writes Anchor programs for escrow, vesting and payment flows, with a focus on clear account constraints, thorough tests and readable code. Comfortable pairing with frontend teams on transaction building and wallet UX.",
    location: "Lagos, Nigeria · remote",
    skills: ["solana", "rust", "anchor", "smart contracts", "typescript"],
    rate: 85,
    availability: "available",
  },
  {
    key: "lukas",
    name: "Lukas Brandt",
    headline: "Full-stack TypeScript developer · Next.js & Node · Berlin (remote)",
    body: "Builds fast, accessible web apps with Next.js, React and Node. Enjoys turning rough product ideas into typed APIs, clean dashboards and well-tested deploy pipelines.",
    location: "Berlin, Germany · remote",
    skills: ["typescript", "next.js", "react", "node.js", "postgresql"],
    rate: 70,
    availability: "available",
  },
  {
    key: "sofia",
    name: "Sofia Marín",
    headline: "Product designer · UI/UX & design systems · Valencia (remote)",
    body: "Designs onboarding flows, dashboards and design systems in Figma. Works from short interviews and simple prototypes, and hands off annotated components that developers can build quickly.",
    location: "Valencia, Spain · remote",
    skills: ["ui design", "ux research", "figma", "design systems", "prototyping"],
    rate: 60,
    availability: "limited",
  },
  {
    key: "ravi",
    name: "Ravi Menon",
    headline: "Data analyst · Python, SQL & on-chain dashboards · Bengaluru",
    body: "Turns raw transaction data into dashboards and weekly reports. Works with Python, SQL and notebooks, and documents every metric definition so teams can reuse the numbers with confidence.",
    location: "Bengaluru, India · remote",
    skills: ["python", "sql", "data science", "data visualization", "pandas"],
    rate: 55,
    availability: "available",
  },
  {
    key: "hana",
    name: "Hana Kobayashi",
    headline: "Motion designer & video editor · explainers and tutorials · Osaka",
    body: "Edits tutorials, product walkthroughs and short explainers. Handles scripting support, motion graphics in After Effects, captions and export presets for YouTube and social channels.",
    location: "Osaka, Japan · remote",
    skills: ["video editing", "motion graphics", "after effects", "premiere", "explainer"],
    rate: 50,
    availability: "available",
  },
  {
    key: "daniel",
    name: "Daniel Okoro",
    headline: "Technical writer · API docs & developer guides · Nairobi (remote)",
    body: "Writes quickstarts, API references and conceptual guides for developer tools. Tests every code sample, keeps a consistent voice and sets up docs structures that are easy to maintain.",
    location: "Nairobi, Kenya · remote",
    skills: ["technical writing", "documentation", "markdown", "api", "developer experience"],
    rate: 45,
    availability: "available",
  },
  {
    key: "claire",
    name: "Claire Dubois",
    headline: "Community & growth marketer · Discord, X and newsletters · Montréal",
    body: "Plans content calendars, runs community programs and writes newsletters for developer and crypto audiences. Reports on engagement with simple, honest metrics.",
    location: "Montréal, Canada · remote",
    skills: ["community management", "social media", "content strategy", "email marketing", "copywriting"],
    rate: 55,
    availability: "available",
  },
  {
    key: "mateo",
    name: "Mateo Rossi",
    headline: "Mobile developer · React Native & wallet integrations · Milan (remote)",
    body: "Ships cross-platform mobile apps with React Native and Expo, including deep links, push notifications and wallet connection flows. Cares about smooth animations and offline-friendly state.",
    location: "Milan, Italy · remote",
    skills: ["react native", "mobile", "typescript", "ios", "android"],
    rate: 75,
    availability: "limited",
  },
  {
    key: "aisha",
    name: "Aisha Rahman",
    headline: "AI engineer · LLM apps, retrieval and evaluation · Karachi (remote)",
    body: "Builds LLM-powered assistants with retrieval, tool calling and evaluation sets. Focuses on grounded answers, cost controls and clear fallbacks when the model is unsure.",
    location: "Karachi, Pakistan · remote",
    skills: ["llm", "python", "machine learning", "prompt engineering", "automation"],
    rate: 80,
    availability: "available",
  },
  {
    key: "tomas",
    name: "Tomás Silva",
    headline: "Project manager · product sprints & operations · Lisbon (remote)",
    body: "Runs sprint planning, roadmaps and stakeholder updates for small product teams. Keeps scope, budgets and milestones visible so contributors can focus on delivery.",
    location: "Lisbon, Portugal · remote",
    skills: ["project management", "operations", "agile", "roadmapping", "business"],
    rate: 60,
    availability: "available",
  },
];

const GIGS: GigSource[] = [
  {
    key: "anchor-review",
    owner: "amara",
    title: "Anchor program review and test suite for your Solana project",
    body: "Milestone-based engagement: each package is split into review, tests and handover milestones. You get a written report covering account constraints, arithmetic checks and signer checks, plus tests that exercise every fix.",
    category: "web3",
    paymentMode: "Milestone",
    skills: ["solana", "anchor", "rust", "smart contracts"],
    packages: [
      ["Focused review", "Review of one instruction set with written findings and suggested fixes.", 600, 5, 1],
      ["Review and tests", "Full program review plus a TypeScript test suite covering success and failure cases.", 1400, 10, 2],
      ["Review, tests and fixes", "Everything in the standard package, plus implemented fixes and a short handover call.", 2800, 18, 3],
    ],
  },
  {
    key: "nextjs-dashboard",
    owner: "lukas",
    title: "Next.js dashboard for your Solana app",
    body: "A typed, responsive dashboard built with Next.js, React and Tailwind. Includes wallet connection, loading and error states, and a short README for your team.",
    category: "development",
    paymentMode: "Fixed",
    skills: ["next.js", "react", "typescript", "tailwind"],
    packages: [
      ["Single view", "Single-page dashboard with wallet connect and one data view.", 800, 7, 1],
      ["Multi-page", "Multi-page dashboard with charts, auth-aware routes and API integration.", 1600, 14, 2],
      ["Complete", "Multi-page scope plus admin tools, tests and deployment setup.", 3000, 21, 3],
    ],
  },
  {
    key: "onboarding-ui",
    owner: "sofia",
    title: "Wallet-friendly onboarding UI in Figma",
    body: "Clear onboarding screens that explain wallets, signatures and network fees in plain language. Delivered as a tidy Figma file with auto-layout components.",
    category: "design",
    paymentMode: "Fixed",
    skills: ["figma", "ui design", "ux", "prototyping"],
    packages: [
      ["Key screens", "Three key screens with a clickable prototype.", 450, 4, 2],
      ["Full flow", "Complete onboarding flow of up to eight screens with components.", 950, 8, 3],
      ["Flow and handoff", "Full flow, component library and developer handoff notes.", 1800, 14, 4],
    ],
  },
  {
    key: "onchain-analytics",
    owner: "ravi",
    title: "On-chain analytics dashboard with Python and SQL",
    body: "Hourly support for data pulls, metric definitions and dashboards. Typical work: transaction volume breakdowns, retention cohorts and weekly summaries. Hours are logged against agreed tasks and billed at the hourly rate.",
    category: "ai",
    paymentMode: "Hourly",
    skills: ["python", "sql", "data science", "dashboards"],
    price: 55,
  },
  {
    key: "explainer-video",
    owner: "hana",
    title: "60-second product explainer video",
    body: "Milestones: script and storyboard, rough cut, final delivery. Includes captions, simple motion graphics and exports for YouTube, X and LinkedIn.",
    category: "video",
    paymentMode: "Milestone",
    skills: ["video editing", "motion graphics", "explainer", "after effects"],
    packages: [
      ["Short edit", "30-second edit from your footage with captions.", 400, 6, 1],
      ["Explainer", "60-second explainer with motion graphics and music licensing guidance.", 900, 10, 2],
      ["Explainer and cut-downs", "60-second explainer plus three vertical cut-downs for social.", 1700, 16, 3],
    ],
  },
  {
    key: "docs-retainer",
    owner: "daniel",
    title: "Developer documentation retainer for your SDK",
    body: "A four-week documentation retainer paid as a continuous stream. Covers quickstarts, API reference cleanup and two in-depth guides, with weekly check-ins and tested code samples.",
    category: "writing",
    paymentMode: "Streaming",
    skills: ["technical writing", "documentation", "api", "markdown"],
    price: 1600,
    deliveryDays: 28,
  },
  {
    key: "community-management",
    owner: "claire",
    title: "Monthly community and social media management",
    body: "Ongoing community support for Discord and X, streamed over the month: content calendar, moderation guidelines, two weekly posts per channel and a short monthly engagement report.",
    category: "marketing",
    paymentMode: "Streaming",
    skills: ["community management", "social media", "content strategy"],
    price: 2400,
    deliveryDays: 30,
  },
  {
    key: "react-native-mvp",
    owner: "mateo",
    title: "React Native app MVP with wallet connection",
    body: "Built in milestones: prototype, feature-complete build, store-ready release. TypeScript throughout, with a clean component structure and setup notes.",
    category: "development",
    paymentMode: "Milestone",
    skills: ["react native", "mobile", "typescript", "ios"],
    packages: [
      ["Prototype", "Two-screen prototype with wallet connect and navigation.", 1500, 14, 1],
      ["MVP", "MVP with up to six screens, API integration and push notifications.", 3500, 28, 2],
      ["MVP and release", "MVP plus store submission support and analytics setup.", 6000, 45, 3],
    ],
  },
  {
    key: "ai-support-assistant",
    owner: "aisha",
    title: "Custom AI support assistant with retrieval",
    body: "An LLM assistant that answers from your own documentation, cites its sources and hands off to a human when unsure. Includes a small evaluation set so you can measure answer quality over time.",
    category: "ai",
    paymentMode: "Fixed",
    skills: ["llm", "python", "chatbot", "automation"],
    packages: [
      ["Prototype", "Prototype assistant over up to 50 help articles.", 900, 7, 1],
      ["Grounded assistant", "Assistant with retrieval, citations and an evaluation set.", 2000, 14, 2],
      ["Assistant with tools", "Grounded assistant plus tool calling, an admin review queue and cost dashboards.", 3800, 24, 3],
    ],
  },
  {
    key: "fractional-pm",
    owner: "tomas",
    title: "Fractional project management for product sprints",
    body: "Hourly project management for small teams: sprint planning, backlog grooming, milestone tracking and concise weekly updates for stakeholders. Hours are tracked against an agreed weekly cap.",
    category: "business",
    paymentMode: "Hourly",
    skills: ["project management", "operations", "agile"],
    price: 60,
  },
];

const JOBS: JobSource[] = [
  {
    key: "anchor-escrow",
    employer: 1,
    title: "Build an Anchor escrow program with milestone payouts",
    body: "We need an Anchor program that holds SPL tokens in escrow and releases them per approved milestone. Scope: account design, fund/approve/refund instructions, a TypeScript test suite and a short design doc. The budget is split across three milestones: design, implementation, tests and handover.",
    location: "Remote · overlap with UTC+1 preferred",
    category: "web3",
    paymentMode: "Milestone",
    budget: 4500,
    skills: ["solana", "anchor", "rust", "smart contracts"],
  },
  {
    key: "marketing-site",
    employer: 2,
    title: "Next.js marketing site with wallet connect",
    body: "Five-page marketing site with a wallet connect button, a waitlist form and basic analytics. Designs are ready in Figma. Looking for clean, accessible components and good Lighthouse scores.",
    location: "Remote · any timezone",
    category: "development",
    paymentMode: "Fixed",
    budget: 2200,
    skills: ["next.js", "react", "typescript", "tailwind"],
  },
  {
    key: "wallet-onboarding-redesign",
    employer: 3,
    title: "Redesign the onboarding flow for a Solana wallet app",
    body: "People drop off at the recovery phrase step of our current onboarding. We want a clearer flow of around eight screens, a clickable prototype and a handoff file. Short usability-test notes are a plus.",
    location: "Remote · Europe or Africa timezones",
    category: "design",
    paymentMode: "Fixed",
    budget: 1800,
    skills: ["figma", "ui design", "ux", "prototyping"],
  },
  {
    key: "weekly-analytics",
    employer: 4,
    title: "Weekly on-chain analytics reports",
    body: "Four-week engagement paid as a continuous stream. Each week: pull transaction data for our program, update a dashboard and write a one-page summary of volume, retention and notable changes.",
    location: "Remote · async friendly",
    category: "ai",
    paymentMode: "Streaming",
    budget: 1200,
    skills: ["python", "sql", "data science", "dashboards"],
  },
  {
    key: "youtube-tutorials",
    employer: 1,
    title: "Edit a three-part YouTube tutorial series",
    body: "Raw screen recordings and voiceover are ready, about 40 minutes in total. We need three tutorials of 8 to 12 minutes with intro cards, captions and simple callouts. One milestone per episode.",
    location: "Remote",
    category: "video",
    paymentMode: "Milestone",
    budget: 900,
    skills: ["video editing", "youtube", "motion graphics"],
  },
  {
    key: "api-docs",
    employer: 2,
    title: "Write API documentation and a quickstart guide",
    body: "Document 14 REST endpoints, write a quickstart for TypeScript developers and review error messages for clarity. An OpenAPI spec and a test environment are provided.",
    location: "Remote · English, async",
    category: "writing",
    paymentMode: "Fixed",
    budget: 1000,
    skills: ["technical writing", "documentation", "api"],
  },
  {
    key: "community-manager",
    employer: 3,
    title: "Part-time community manager for Discord and X",
    body: "Monthly role paid as a stream: moderate Discord, schedule posts on X, host one community call per week and share a short monthly report. Around 15 hours per week.",
    location: "Remote · Americas timezones",
    category: "marketing",
    paymentMode: "Streaming",
    budget: 2000,
    skills: ["community management", "social media", "content strategy"],
  },
  {
    key: "payments-prototype",
    employer: 4,
    title: "React Native developer for a payments prototype",
    body: "Hourly contract to build a payments prototype: wallet connection, a send flow and transaction history. Estimated 60 to 80 hours over five weeks, with a weekly hours cap. Budget shown is the hourly rate.",
    location: "Remote · UTC-5 to UTC+2",
    category: "development",
    paymentMode: "Hourly",
    budget: 65,
    skills: ["react native", "mobile", "typescript"],
  },
  {
    key: "llm-support-prototype",
    employer: 1,
    title: "Prototype an LLM assistant for support tickets",
    body: "We want to test whether an LLM can draft replies to common support tickets. Scope: retrieval over our help center, a small evaluation set and a simple review UI. Estimated 40 hours. Budget shown is the hourly rate.",
    location: "Remote · Asia or Europe timezones",
    category: "ai",
    paymentMode: "Hourly",
    budget: 75,
    skills: ["llm", "python", "prompt engineering", "automation"],
  },
  {
    key: "treasury-memo",
    employer: 2,
    title: "Draft a treasury and tokenomics policy memo",
    body: "Write a 6 to 8 page memo covering treasury diversification options, vesting schedules and contributor compensation in tokens. Plain language for a non-specialist board; no legal advice required.",
    location: "Remote",
    category: "business",
    paymentMode: "Fixed",
    budget: 1500,
    skills: ["tokenomics", "strategy", "finance"],
  },
];

/* ---------------- built records ---------------- */

export type DemoSeedData = {
  profiles: MarketplaceProfileRecord[];
  gigs: MarketplaceGigRecord[];
  jobs: MarketplaceJobRecord[];
  employerWallets: string[];
};

const HOUR_MS = 3_600_000;

/**
 * Pure and deterministic apart from timestamps (taken from `now`). Profiles and
 * gigs pass through the same validators the API uses, so DB checks hold.
 */
export function buildDemoSeedData(now: Date = new Date()): DemoSeedData {
  const mint = demoMint();
  const walletByKey = new Map(PROFILES.map((p) => [p.key, demoAddress(`freelancer:${p.key}`)]));
  const employerWallets = [1, 2, 3, 4].map((n) => demoAddress(`employer:${n}`));
  const at = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * HOUR_MS);

  const profiles = PROFILES.map((p, i): MarketplaceProfileRecord => {
    const input = validateProfileInput({
      displayName: p.name,
      avatarUrl: null,
      headline: p.headline,
      bio: `${p.body}\n\nLocation: ${p.location}\n\n${PROFILE_NOTE}`,
      skills: [DEMO_SKILL_TAG, ...p.skills],
      rateAmount: units(p.rate),
      availability: p.availability,
      portfolio: [],
    });
    const ts = at(2 + i * 5);
    return { wallet: walletByKey.get(p.key)!, ...input, createdAt: ts, updatedAt: ts };
  });

  const gigs = GIGS.map((g, i): MarketplaceGigRecord => {
    const wallet = walletByKey.get(g.owner);
    if (!wallet) throw new Error(`Unknown demo gig owner: ${g.owner}`);
    const packages: GigPackage[] | undefined = g.packages?.map(([title, description, price, deliveryDays, revisions], idx) => ({
      tier: (["basic", "standard", "premium"] as const)[idx],
      title,
      description,
      priceAmount: units(price),
      deliveryDays,
      revisions,
    }));
    const input = validateGigInput({
      title: g.title,
      description: `${g.body}\n\n${GIG_NOTE}`,
      skills: [DEMO_SKILL_TAG, ...g.skills],
      paymentMode: g.paymentMode,
      priceAmount: g.price != null ? units(g.price) : undefined,
      category: g.category,
      coverUrl: null,
      media: [],
      videoUrl: null,
      deliveryDays: g.deliveryDays ?? null,
      packages: packages ?? [],
    });
    const ts = at(3 + i * 5);
    return {
      id: demoUuid(`gig:${g.key}`),
      freelancerWallet: wallet,
      ...input,
      tokenMint: mint,
      status: "active",
      createdAt: ts,
      updatedAt: ts,
    };
  });

  const jobs = JOBS.map((j, i): MarketplaceJobRecord => {
    const description = `${j.body}\n\nLocation: ${j.location}\n\n${JOB_NOTE}`;
    if (j.title.length > JOB_TITLE_MAX || description.length > JOB_DESCRIPTION_MAX) {
      throw new Error(`Demo job text is too long: ${j.key}`);
    }
    const ts = at(1 + i * 4);
    return {
      id: demoUuid(`job:${j.key}`),
      employerWallet: employerWallets[j.employer - 1],
      title: j.title,
      description,
      paymentMode: j.paymentMode,
      budgetAmount: units(j.budget),
      tokenMint: mint,
      status: "open",
      selectedProposalId: null,
      createdAt: ts,
      updatedAt: ts,
      closedAt: null,
      skills: parseSkills([DEMO_SKILL_TAG, ...j.skills], JOB_SKILLS_MAX),
      category: parseCategory(j.category),
    };
  });

  return { profiles, gigs, jobs, employerWallets };
}

export function demoSeedCounts(data: DemoSeedData) {
  return { profiles: data.profiles.length, gigs: data.gigs.length, jobs: data.jobs.length };
}

/* ---------------- production guard ---------------- */

export type DemoSeedVerdict = { ok: true } | { ok: false; reason: string };

/**
 * Refuses production and non-Devnet configurations. Writes additionally need
 * PREMIFLOW_ALLOW_DEMO_SEED=1 and DATABASE_URL. Never echoes env values.
 */
export function checkDemoSeedAllowed(opts: {
  env: Record<string, string | undefined>;
  dryRun: boolean;
  clusterId?: string;
}): DemoSeedVerdict {
  const { env, dryRun } = opts;
  const clusterId = opts.clusterId ?? getActiveCluster().id;
  if (env.NODE_ENV === "production") return { ok: false, reason: "NODE_ENV is production." };
  if (env.VERCEL_ENV === "production") return { ok: false, reason: "VERCEL_ENV is production." };
  if (clusterId !== "devnet") return { ok: false, reason: "The active cluster is not devnet." };
  if (env.SOLANA_RPC_URL && /mainnet/i.test(env.SOLANA_RPC_URL)) {
    return { ok: false, reason: "SOLANA_RPC_URL points at mainnet." };
  }
  if (dryRun) return { ok: true };
  if (env[DEMO_SEED_FLAG] !== "1") {
    return { ok: false, reason: `Set ${DEMO_SEED_FLAG}=1 to write demo data (or pass --dry-run).` };
  }
  if (!env.DATABASE_URL?.trim()) return { ok: false, reason: "DATABASE_URL is not set." };
  return { ok: true };
}

/* ---------------- idempotent apply / remove ---------------- */

/** Existing marketplace store methods plus two id-scoped deletes for --remove. */
export type DemoSeedStore = Pick<
  MarketplaceStore,
  | "getProfile"
  | "upsertProfile"
  | "getGig"
  | "insertGig"
  | "updateGigForOwner"
  | "deleteGigForOwner"
  | "getJob"
  | "insertJob"
  | "updateJobIfStatus"
  | "listProposalsForJob"
> & {
  deleteProfile(wallet: string): Promise<boolean>;
  deleteJobForEmployer(id: string, employer: string): Promise<boolean>;
};

export type DemoSeedReport = {
  profiles: { created: number; updated: number };
  gigs: { created: number; updated: number; skipped: number };
  jobs: { created: number; updated: number; skipped: number };
};

export async function applyDemoSeed(store: DemoSeedStore, data: DemoSeedData, now: Date = new Date()): Promise<DemoSeedReport> {
  const report: DemoSeedReport = {
    profiles: { created: 0, updated: 0 },
    gigs: { created: 0, updated: 0, skipped: 0 },
    jobs: { created: 0, updated: 0, skipped: 0 },
  };

  for (const profile of data.profiles) {
    const existing = await store.getProfile(profile.wallet);
    await store.upsertProfile({
      ...profile,
      createdAt: existing?.createdAt ?? profile.createdAt,
      updatedAt: existing ? now : profile.updatedAt,
    });
    if (existing) report.profiles.updated += 1;
    else report.profiles.created += 1;
  }

  for (const gig of data.gigs) {
    const existing = await store.getGig(gig.id);
    if (!existing) {
      await store.insertGig(gig);
      report.gigs.created += 1;
    } else if (existing.freelancerWallet !== gig.freelancerWallet) {
      report.gigs.skipped += 1;
    } else {
      await store.updateGigForOwner(gig.id, gig.freelancerWallet, {
        title: gig.title,
        description: gig.description,
        skills: gig.skills,
        paymentMode: gig.paymentMode,
        priceAmount: gig.priceAmount,
        status: "active",
        category: gig.category,
        coverUrl: gig.coverUrl,
        media: gig.media,
        videoUrl: gig.videoUrl,
        deliveryDays: gig.deliveryDays,
        packages: gig.packages,
        updatedAt: now,
      });
      report.gigs.updated += 1;
    }
  }

  for (const job of data.jobs) {
    const existing = await store.getJob(job.id);
    if (!existing) {
      await store.insertJob(job);
      report.jobs.created += 1;
    } else if (existing.employerWallet !== job.employerWallet || existing.status !== "open") {
      // Never reopen or take over a job that is closed, filled or not ours.
      report.jobs.skipped += 1;
    } else {
      const saved = await store.updateJobIfStatus(job.id, "open", {
        title: job.title,
        description: job.description,
        paymentMode: job.paymentMode,
        budgetAmount: job.budgetAmount,
        skills: job.skills,
        category: job.category,
        updatedAt: now,
      });
      if (saved) report.jobs.updated += 1;
      else report.jobs.skipped += 1;
    }
  }
  return report;
}

export type DemoRemoveReport = { profiles: number; gigs: number; jobsDeleted: number; jobsClosed: number };

/**
 * Deletes only the deterministic demo records. A demo job that already has
 * proposals is closed instead of deleted so nobody's proposal is removed.
 */
export async function removeDemoSeed(store: DemoSeedStore, data: DemoSeedData, now: Date = new Date()): Promise<DemoRemoveReport> {
  const report: DemoRemoveReport = { profiles: 0, gigs: 0, jobsDeleted: 0, jobsClosed: 0 };
  for (const gig of data.gigs) {
    if (await store.deleteGigForOwner(gig.id, gig.freelancerWallet)) report.gigs += 1;
  }
  for (const job of data.jobs) {
    const existing = await store.getJob(job.id);
    if (!existing || existing.employerWallet !== job.employerWallet) continue;
    const proposals = await store.listProposalsForJob(job.id);
    if (proposals.length === 0) {
      if (await store.deleteJobForEmployer(job.id, job.employerWallet)) report.jobsDeleted += 1;
    } else if (existing.status === "open") {
      const closed = await store.updateJobIfStatus(job.id, "open", { status: "closed", closedAt: now, updatedAt: now });
      if (closed) report.jobsClosed += 1;
    }
  }
  for (const profile of data.profiles) {
    if (await store.deleteProfile(profile.wallet)) report.profiles += 1;
  }
  return report;
}
