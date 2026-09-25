import type { PaymentModeName } from "@/lib/streampay-v2";

export const CONTRACT_TYPES: readonly PaymentModeName[] = [
  "Fixed",
  "Milestone",
  "Streaming",
  "Hourly",
];

export const CONTRACT_TYPE_DECISION_HEADING = "How will this work be paid?";

export type ContractTypeGuide = {
  type: PaymentModeName;
  title: string;
  customerChoice: string;
  tagline: string;
  /** One-line card copy for compact Create UI. */
  cardSummary: string;
  /** Secondary “Best for” line on Create type cards. */
  cardBestFor: string;
  bestFor: string;
  compactBestFor: string;
  exampleHeading: string;
  exampleLines: readonly string[];
  compactExampleLines: readonly string[];
  explanation: string;
  collectNote?: string;
  goodFor: readonly string[];
  selectedExplanation: string;
  howPaymentWorks: string;
  configurePreview: readonly string[];
  distinction?: string;
};

export const CONTRACT_TYPE_GUIDES: Record<PaymentModeName, ContractTypeGuide> = {
  Fixed: {
    type: "Fixed",
    title: "Fixed",
    customerChoice: "One finished job",
    tagline: "One job, one price",
    cardSummary: "One price for a defined job.",
    cardBestFor: "one-off deliverables.",
    bestFor: "Best for a clearly defined deliverable.",
    compactBestFor: "Logo, article, and one-time jobs",
    exampleHeading: "Examples",
    exampleLines: [
      "Logo design",
      "Article",
      "One-time development task",
      "A specific completed piece of work",
    ],
    compactExampleLines: ["Logo design · Article · One-time development task"],
    explanation:
      "You agree on one total price for one main deliverable. The freelancer submits that finished work for review.",
    goodFor: [
      "Logo design",
      "Articles",
      "Small development tasks",
      "One-time freelance jobs",
    ],
    selectedExplanation:
      "You agree on one total price. The freelancer submits the main deliverable for review. After approval, the released amount becomes available for the freelancer to collect.",
    howPaymentWorks:
      "You agree on one total price. The freelancer submits the main deliverable for review. After approval, the released amount becomes available for the freelancer to collect.",
    configurePreview: [
      "Total price",
      "Main deliverable",
      "Review period",
      "Revisions where applicable",
    ],
  },
  Milestone: {
    type: "Milestone",
    title: "Milestone",
    customerChoice: "Several project stages",
    tagline: "Pay by project stage",
    cardSummary: "Pay as agreed stages are completed.",
    cardBestFor: "projects with clear stages.",
    bestFor: "Best for a larger project split into separate deliverables.",
    compactBestFor: "Websites, apps, and multi-stage work",
    exampleHeading: "Example",
    exampleLines: [
      "Website project: Design → Frontend → Backend → Testing",
    ],
    compactExampleLines: ["Design → Frontend → Backend → Testing"],
    explanation:
      "Each stage has its own amount and deliverable. Work can be submitted and reviewed stage by stage.",
    goodFor: [
      "Websites",
      "Apps",
      "Long design projects",
      "Multi-stage freelance work",
    ],
    selectedExplanation:
      "You divide the project into stages. Each milestone has its own amount and deliverable, allowing work to be submitted and reviewed stage by stage.",
    howPaymentWorks:
      "You divide the project into stages. Each milestone has its own amount and deliverable, allowing work to be submitted and reviewed stage by stage.",
    configurePreview: [
      "Project stages",
      "Amount per milestone",
      "Deliverable per milestone",
      "Review and revision lifecycle",
    ],
  },
  Streaming: {
    type: "Streaming",
    title: "Streaming",
    customerChoice: "Continuous scheduled payment",
    tagline: "Pay as contract time passes",
    cardSummary: "Payment accrues over the contract schedule.",
    cardBestFor: "ongoing scheduled work.",
    bestFor:
      "Best for work where payment should accrue continuously during an agreed scheduled period.",
    compactBestFor: "Retainers and scheduled consulting periods",
    exampleHeading: "Examples",
    exampleLines: [
      "Retainers",
      "Scheduled consulting windows",
      "Defined engagement periods",
    ],
    compactExampleLines: ["Retainers · Scheduled consulting windows"],
    explanation:
      "Payment accrues automatically as scheduled contract time passes. It does not track actual working sessions.",
    collectNote:
      "Tokens remain in escrow until the freelancer collects available pay.",
    goodFor: [
      "Retainers",
      "Scheduled consulting windows",
      "Defined engagement periods",
      "Continuous scheduled payment",
    ],
    selectedExplanation:
      "Payment accrues with scheduled contract time while the stream is active. It does not measure actual hours worked. Choose Hourly if payment should depend on Start work / Stop work sessions.",
    howPaymentWorks:
      "Payment accrues with scheduled contract time while the stream is active. It does not measure actual hours worked. Choose Hourly if payment should depend on Start work / Stop work sessions.",
    configurePreview: [
      "Funded amount",
      "Scheduled duration",
      "Accrual over contract time",
      "Review / activation lifecycle where applicable",
    ],
    distinction: "Does not track actual hours worked",
  },
  Hourly: {
    type: "Hourly",
    title: "Hourly",
    customerChoice: "Actual hours worked",
    tagline: "Pay for recorded working time",
    cardSummary: "Track approved work time and pay by the hour.",
    cardBestFor: "flexible work where hours vary.",
    bestFor:
      "Best for work where payment depends on actual recorded Start work / Stop work sessions.",
    compactBestFor: "Logged consulting and session-based work",
    exampleHeading: "Examples",
    exampleLines: [
      "Logged consulting",
      "Session-based support",
      "Work that should not accrue while idle",
    ],
    compactExampleLines: ["Logged consulting · Session-based support"],
    explanation:
      "Payment is based on recorded Start work / Stop work sessions. Calendar time alone does not create Hourly earnings.",
    collectNote:
      "Streaming accrues automatically as scheduled contract time passes. Hourly accrues only from explicit Start work / Stop work sessions.",
    goodFor: [
      "Logged consulting",
      "Session-based support",
      "Work that should not accrue while idle",
      "Authorized working-time budgets",
    ],
    selectedExplanation:
      "Set an hourly rate and maximum authorized working time. The freelancer records eligible work using Start work and Stop work. Unused funded budget can settle according to the Hourly protocol.",
    howPaymentWorks:
      "Set an hourly rate and maximum authorized working time. The freelancer records eligible work using Start work and Stop work. Unused funded budget can settle according to the Hourly protocol.",
    configurePreview: [
      "Hourly rate",
      "Maximum authorized work time",
      "Engagement window",
      "Recorded work sessions",
      "Maximum funded work budget",
      "Optional trial where applicable",
    ],
    distinction: "Uses Start work / Stop work sessions",
  },
};

export const CONTRACT_TYPE_DECISION_HINTS: readonly {
  match: string;
  type: PaymentModeName;
}[] = CONTRACT_TYPES.map((type) => ({
  match: CONTRACT_TYPE_GUIDES[type].customerChoice,
  type,
}));

export const STREAMING_VS_HOURLY = {
  heading: "Streaming or Hourly?",
  streamingTitle: "Streaming",
  streaming:
    "Payment accrues automatically as scheduled contract time passes. It does not track actual working sessions.",
  hourlyTitle: "Hourly",
  hourly:
    "Payment is based on recorded Start work / Stop work sessions. Calendar time alone does not create Hourly earnings.",
} as const;

export const HOW_PAYMENT_WORKS_HEADING = "How payment works";
export const CONFIGURE_PREVIEW_HEADING = "You'll configure";
export const TYPE_SELECTION_CONTINUE_LABEL = "Continue";

export const TYPE_SELECTION_SUPPORT_NOTE =
  "Need help choosing? Open Help & Support or ask PREMIFLOW Assistant.";

export function paymentModeForWorkChoice(choice: string): PaymentModeName | null {
  const hit = CONTRACT_TYPE_DECISION_HINTS.find((hint) => hint.match === choice);
  return hit?.type ?? null;
}
