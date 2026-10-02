import type { PaymentModeName } from "@/lib/streampay-v2";

export const ABOUT_PATH = "/about";
export const ABOUT_NAV_LABEL = "About";

export const ABOUT_HERO = {
  eyebrow: "About PREMIFLOW",
  heading: "Why PREMIFLOW?",
  idea: "Freelance work is not one-size-fits-all. Payment protection shouldn't be either.",
  body:
    "PREMIFLOW is being built as a contract-based workspace for employers and freelancers. It brings payment terms, work progress, communication, and dispute resolution into one connected workflow — instead of leaving those pieces scattered across invoices, chats, and after-the-fact arguments.",
} as const;

export const ABOUT_PROBLEM = {
  heading: "The problem PREMIFLOW is built around",
  intro:
    "Most freelance friction is not about talent. It is about unclear terms, delayed payment, and conversations that sit apart from the agreement. PREMIFLOW treats both sides as partners in the same contract, not as adversaries.",
  freelancerHeading: "Freelancers often worry about",
  freelancer: [
    "Finishing work and then waiting to be paid",
    "Payment conditions that were never written clearly",
    "Revision scope that keeps expanding",
    "Proving or recording time-based work",
    "Work discussion scattered across tools",
    "Disputes that start after the work is already done",
  ],
  employerHeading: "Employers often worry about",
  employer: [
    "Paying before knowing what will be delivered",
    "Unclear progress on the engagement",
    "Projects that naturally split into stages",
    "Tracking time-based work without a shared record",
    "Revision and deadline expectations",
    "How remaining funds are handled if the parties disagree",
  ],
} as const;

export const ABOUT_WORKFLOW = {
  heading: "How PREMIFLOW approaches the work",
  intro:
    "The product follows the actual contract path. Collecting pay is a separate step from recording that pay became available. A dispute is a formal path, not a default.",
  steps: [
    {
      id: "agree",
      title: "Agree",
      body: "Employer and freelancer define payment and work terms in a contract model that matches the engagement.",
    },
    {
      id: "fund",
      title: "Fund",
      body: "The payment budget is placed into the contract escrow according to the selected model — before work depends on an informal promise.",
    },
    {
      id: "work",
      title: "Work",
      body: "The freelancer performs the agreed work. What “progress” means depends on the contract type.",
    },
    {
      id: "review",
      title: "Review / Record",
      body: "Fixed and Milestone use deliverable review. Streaming records elapsed contract time. Hourly records explicit Start work / Stop work sessions.",
    },
    {
      id: "collect",
      title: "Collect",
      body: "Eligible, already-released amounts can be collected separately. Recording earned pay does not by itself move tokens.",
    },
    {
      id: "resolve",
      title: "Resolve when necessary",
      body: "If the parties cannot settle a disagreement themselves, Resolution Center and the configured resolver provide a formal settlement path.",
    },
  ],
} as const;

export const ABOUT_MODELS: Record<
  PaymentModeName,
  {
    type: PaymentModeName;
    heading: string;
    tagline: string;
    body: string;
    examples: readonly string[];
    explain: string;
  }
> = {
  Fixed: {
    type: "Fixed",
    heading: "Fixed",
    tagline: "One job, one price",
    body: "For clearly defined work with one main deliverable.",
    examples: ["Logo", "Article", "Small development task", "One-time freelance job"],
    explain:
      "The freelancer submits the work. After review and approval, the released amount becomes available to collect.",
  },
  Milestone: {
    type: "Milestone",
    heading: "Milestone",
    tagline: "Pay by project stage",
    body: "For larger projects divided into separate deliverables.",
    examples: ["Design", "Frontend", "Backend", "Testing"],
    explain:
      "Each milestone has its own amount and its own submit / review lifecycle. Stages do not automatically pay just because calendar time passed.",
  },
  Streaming: {
    type: "Streaming",
    heading: "Streaming",
    tagline: "Pay as time passes",
    body: "For continuous, scheduled payment over a defined contract period.",
    examples: ["Retainers", "Scheduled consulting windows", "Defined engagement periods"],
    explain:
      "Payment accrues proportionally while the stream is active, from the contract clock — not from Start work / Stop work sessions.",
  },
  Hourly: {
    type: "Hourly",
    heading: "Hourly",
    tagline: "Pay for recorded working time",
    body: "For engagements where freelancer work sessions are explicitly started and stopped.",
    examples: ["Logged consulting", "Session-based support", "Work that should not accrue while idle"],
    explain:
      "The employer authorizes a maximum amount of payable working time. The freelancer records sessions. Earnings come from recorded eligible time. Unused funded budget can settle back according to the protocol.",
  },
};

export const ABOUT_MODELS_HEADING = "Four ways to work";
export const ABOUT_MODELS_INTRO =
  "Choose the model that matches how the work actually happens. All four use the same PREMIFLOW workspace for funding, communication, and disputes.";

export const ABOUT_AUDIENCE = {
  heading: "Clearer for both sides",
  freelancerHeading: "For freelancers",
  freelancer: [
    "Terms are visible before work starts",
    "The engagement is a funded contract, not an informal invoice thread",
    "Four payment models for different kinds of work",
    "Hourly sessions are recorded, not inferred from idle time",
    "Milestone work can be submitted and reviewed stage by stage",
    "Revisions and review windows follow the contract",
    "Contract Messages keep discussion with this agreement",
    "A formal dispute path exists if the parties cannot agree",
    "Released pay is collected as a separate step",
  ],
  employerHeading: "For employers",
  employer: [
    "Define the work and payment structure up front",
    "Choose the model that fits the engagement",
    "Fund a budget into escrow for that contract",
    "Review deliverables where the model uses review",
    "Keep milestone control stage by stage",
    "Authorize an Hourly working-time budget",
    "Keep conversation on the contract",
    "Use revision and deadline rules already in the agreement",
    "Open a dispute when remaining funds are genuinely contested",
    "Unused budget can settle back where the protocol allows it",
  ],
  freelancerNote:
    "PREMIFLOW does not guarantee payment. It makes funded terms, recorded progress, and collection steps visible.",
  employerNote:
    "Employers do not arbitrarily reclaim amounts that have already been released under the contract. Unused or remaining budget follows the protocol for that model and status.",
} as const;

export const ABOUT_MESSAGES = {
  heading: "Work and conversation belong together",
  body: [
    "Contract Messages is employer and freelancer communication about one contract. It stays with the agreement instead of living only in a private inbox.",
    "Messages are stored by PREMIFLOW for authorized contract access. This is not end-to-end encryption, and it is not recorded on Solana.",
    "The resolver does not automatically receive private-chat access. A participant may submit a selected message as an immutable Resolution Case snapshot; the whole thread remains private.",
  ],
} as const;

export const ABOUT_DISPUTES = {
  heading: "When agreement breaks down",
  intro:
    "PREMIFLOW is not designed around pretending disagreements never happen. It gives the parties a way to talk first, then a formal path if they still cannot settle remaining funds.",
  points: [
    "Parties can communicate on the contract first",
    "A genuine unresolved disagreement can enter Resolution Center",
    "Remaining disputed funds are frozen and accounted according to the protocol",
    "The configured resolver reviews the dispute",
    "The resolver records a settlement allocation — it does not receive the escrow",
    "Each party later collects pay or claims a refund for their own resulting entitlement",
  ],
  note:
    "A dispute category helps you describe the disagreement. It does not automatically decide who wins or what split to record. PREMIFLOW Assistant does not decide disputes.",
} as const;

export const ABOUT_TRUST = {
  heading: "Don't remove people from the relationship. Make the agreement clearer.",
  intro:
    "PREMIFLOW is a hybrid product. Software can hold funds, record state, and explain next steps. It cannot decide whether creative or professional work is objectively good.",
  layers: [
    {
      title: "Protocol",
      body: "Contract and payment state, escrow accounting, and settlement rules live in the on-chain program.",
    },
    {
      title: "PREMIFLOW application",
      body: "The app is the usable workflow: explanations, communication, support, and dispute context around that state.",
    },
    {
      title: "Human parties",
      body: "Employer and freelancer still agree to the work, communicate, and review what was delivered.",
    },
    {
      title: "Resolver",
      body: "When a formal settlement is required, the configured resolver records how remaining disputed funds are allocated.",
    },
  ],
} as const;

export const ABOUT_VISION = {
  heading: "Our vision",
  idea:
    "PREMIFLOW is being built around a simple idea: freelancers and employers should be able to work together globally without either side having to rely only on blind trust around payment.",
  body: [
    "A logo designer does not work like a long-term developer. A milestone project does not work like a consulting session. Scheduled payment does not work like recorded hourly work.",
    "PREMIFLOW aims to support those different relationships inside one contract-based workspace — with payment models that follow how the work actually happens.",
  ],
} as const;

export const ABOUT_ASSISTANT = {
  heading: "PREMIFLOW Assistant",
  status: "Available now",
  tagline: "AI guidance throughout PREMIFLOW.",
  canHelpHeading: "Can help with",
  willNotHeading: "Will not",
  intended: [
    "Understand contract types (Fixed, Milestone, Streaming, Hourly)",
    "Understand protected payments and escrow basics",
    "Understand contract status and available actions",
    "Understand paid trials",
    "Understand Collect pay and Claim refund",
    "Understand disputes and the resolver’s role",
    "Navigate PREMIFLOW (Create, Contracts, Support)",
  ],
  willNot: [
    "Sign wallet transactions",
    "Move funds or control escrow",
    "Create or fund contracts on its own",
    "Approve work",
    "Collect or Claim for you",
    "Cancel contracts",
    "Resolve disputes or decide winners",
    "Automatically read private Contract Messages",
  ],
  note: "Open the floating PREMIFLOW Assistant anytime for guidance. It explains and suggests — your wallet confirms every on-chain action.",
} as const;

export const ABOUT_CTA = {
  heading: "Start with a real contract",
  body: "Create terms, review existing contracts, or read Help & Support for how the workflow actually behaves.",
  actions: [
    { href: "/create", label: "Create a contract" },
    { href: "/contracts", label: "View contracts" },
    { href: "/support", label: "Help & Support" },
  ],
} as const;

export const ABOUT_HOME_TEASER = {
  heading: "Why PREMIFLOW?",
  body: "Freelance work is not one-size-fits-all. PREMIFLOW gives employers and freelancers contract models designed around how the work actually happens.",
  models: "Fixed · Milestone · Streaming · Hourly",
  button: "Learn why PREMIFLOW",
  href: ABOUT_PATH,
} as const;

export const ABOUT_FORBIDDEN_CLAIMS = [
  "guaranteed payment",
  "guaranteed fairness",
  "eliminates disputes",
  "completely trustless",
  "risk free",
  "risk-free",
  "decentralized everything",
  "AI-powered",
  "AI decides",
] as const;
