import type { ContractType } from "@/lib/streampay-v2";

export const CONTRACT_TYPES: readonly ContractType[] = [
  "Fixed",
  "Milestone",
  "Streaming",
];

export const CONTRACT_TYPE_DECISION_HEADING = "Which contract fits your work?";

export const CONTRACT_TYPE_DECISION_HINTS: readonly {
  match: string;
  type: ContractType;
}[] = [
  { match: "One specific deliverable", type: "Fixed" },
  { match: "Several project stages", type: "Milestone" },
  { match: "Payment based on time", type: "Streaming" },
];

export type ContractTypeGuide = {
  type: ContractType;
  title: string;
  tagline: string;
  bestFor: string;
  compactBestFor: string;
  exampleHeading: string;
  exampleLines: readonly string[];
  compactExampleLines: readonly string[];
  explanation: string;
  collectNote?: string;
  goodFor: readonly string[];
  selectedExplanation: string;
};

export const CONTRACT_TYPE_GUIDES: Record<ContractType, ContractTypeGuide> = {
  Fixed: {
    type: "Fixed",
    title: "Fixed",
    tagline: "One job, one price",
    bestFor: "Best for a clearly defined task with one final deliverable.",
    compactBestFor: "Logo, articles, and one-time jobs",
    exampleHeading: "Example",
    exampleLines: ["Design a logo for a fixed price."],
    compactExampleLines: ["Design a logo for a fixed price."],
    explanation:
      "The freelancer submits the finished work for review. Once approved, the payment becomes available to collect.",
    goodFor: [
      "Logo/design work",
      "Articles",
      "Small development tasks",
      "One-time freelance jobs",
    ],
    selectedExplanation:
      "You'll agree on one total price. The freelancer submits one main deliverable for review.",
  },
  Milestone: {
    type: "Milestone",
    title: "Milestone",
    tagline: "Pay by project stage",
    bestFor: "Best for larger projects divided into separate deliverables.",
    compactBestFor: "Websites, apps, and multi-stage work",
    exampleHeading: "Example",
    exampleLines: [
      "Build a website with separate amounts for Design, Frontend, Backend, and Testing.",
    ],
    compactExampleLines: [
      "Build a website with separate amounts for Design, Frontend, Backend, and Testing.",
    ],
    explanation:
      "Each milestone has its own deliverable and amount. Work can be submitted and reviewed stage by stage.",
    goodFor: [
      "Websites",
      "Apps",
      "Long design projects",
      "Multi-stage freelance work",
    ],
    selectedExplanation:
      "You'll divide the project into stages with separate amounts and deliverables.",
  },
  Streaming: {
    type: "Streaming",
    title: "Streaming",
    tagline: "Pay as time passes",
    bestFor: "Best for ongoing work over a defined start and end time.",
    compactBestFor: "Consulting, retainers, and scheduled hours",
    exampleHeading: "Example",
    exampleLines: [
      "Fund an 8-hour work period.",
      "Your equivalent hourly rate is shown automatically.",
    ],
    compactExampleLines: ["Fund an 8-hour work period."],
    explanation:
      "Payment accrues proportionally with time while the stream is active. The main stream does not require a normal deliverable submission.",
    collectNote:
      "Tokens remain in escrow until the freelancer collects available pay.",
    goodFor: [
      "Scheduled remote work",
      "Consulting sessions",
      "Retainers",
      "Time-based work",
    ],
    selectedExplanation:
      "You'll fund a defined time period. Pay accrues proportionally while the stream is active.",
  },
};
