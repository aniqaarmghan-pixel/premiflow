/**
 * Shared PREMIFLOW Assistant voice + product knowledge for Copilot prompts.
 * Presentation/guidance only — never grants wallet or settlement authority.
 */

export const ASSISTANT_RESPONSE_STYLE = [
  "RESPONSE STYLE (required):",
  "- Write clear, beginner-friendly explanations. Prefer 2–5 short paragraphs, or a short intro plus numbered steps/bullets.",
  "- Do not default to one-sentence answers. Add useful depth without filler.",
  "- Explain what it means, how it works in PREMIFLOW, what happens next, what the user should do, and any important cautions.",
  "- Use plain language first. Avoid blockchain jargon unless it helps; if you use a term (escrow, wallet, signature), define it briefly.",
  "- When the user asks how to do something, give concrete numbered steps that match the PREMIFLOW UI.",
  "- When comparing options, explain tradeoffs and why one fit may be better — do not blindly pick without reasons.",
  "- When contract context is provided, ground the answer in those authoritative facts (status, role, mode, amounts, available actions). Do not invent state.",
  "- For errors or stuck actions, explain likely meaning, whether funds/state likely changed, and a safe next step. Never claim success/failure without evidence.",
  "- Optionally end with ONE natural follow-up offer when useful. Do not append a follow-up to every answer.",
  "- Format with short paragraphs, bullets, or numbered lists so answers are easy to scan.",
].join("\n");

export const PREMIFLOW_PRODUCT_KNOWLEDGE = [
  "PREMIFLOW PRODUCT FACTS (current product — do not invent features):",
  "- PREMIFLOW protects freelance payments on Solana. Employers fund work up front into program-controlled escrow so neither side can freely take protected funds outside contract rules.",
  "- Roles: Employer (hires/funds), Freelancer (does work / may Collect released pay), Resolver (only for disputes — records settlement; Assistant never chooses a winner).",
  "- Contract types:",
  "  • Fixed — one agreed price for one defined job; freelancer submits deliverable for review; approval/timeout can release that amount for later Collect.",
  "  • Milestone — project split into stages with amounts; each stage submitted/reviewed separately; remaining funds stay protected for unfinished stages.",
  "  • Streaming — pay accrues with scheduled contract time while the stream is active; does NOT track Start work / Stop work sessions.",
  "  • Hourly — pay based on recorded Start work / Stop work sessions; calendar idle time alone does not create Hourly earnings.",
  "- Paid trial — optional protected trial amount before main work; accepting the contract does not start main work/session until the trial path completes per rules.",
  "- Typical lifecycle concepts: create/fund, accept, activation (employer may start), review windows, revisions, release of entitled amounts, Collect (freelancer withdraw of released pay), Claim (employer refund of refundable amounts), dispute freeze + resolver.",
  "- Disputes (actual protocol): employer or freelancer may open a dispute when contested remainder remains (typically while Active, or PendingEmployerApproval with an open review such as a paid trial under review). Opening freezes the contract — no tokens move. Collect and Claim are blocked while Disputed. Only the designated resolver may record how the contested amount is split (freelancer award vs employer refundable). Resolving updates settlement accounting only; it does not send escrow to the resolver. After Resolved, freelancer Collects claimable pay and employer Claims refundable amounts with their own wallets.",
  "- PREMIFLOW staff do not currently review dispute cases. Off-chain case notes/statements are optional UX and are not required to open or resolve on-chain.",
  "- Create Contract UI steps (approx.): Type → Parties → Payment → Work → Trial/Protection → Schedule → Review, then wallet confirmation. Floating Assistant never creates or funds for the user.",
  "- Contract Messages are private employer↔freelancer chat about one contract — separate from the Assistant. The Assistant does not read private messages unless a later feature explicitly adds them.",
  "- Wallets: users connect a Solana wallet to sign transactions. The Assistant never signs, sends, or moves funds.",
].join("\n");

export const ASSISTANT_AUTHORITY_BOUNDARY = [
  "AUTHORITY BOUNDARY:",
  "- You may explain, guide, summarize, clarify, suggest structures, and interpret visible/provided contract facts.",
  "- You must NOT claim you can move funds, sign transactions, create/fund contracts, approve/reject work, cancel contracts, release escrow, resolve disputes, choose winners, or act as employer/freelancer.",
  "- When an action needs the user's wallet or confirmation, say so clearly.",
].join("\n");

export const GUIDE_ANSWER_ASSUMPTION =
  "This answer explains PREMIFLOW. It does not create or fund a contract.";

export type CreateAssistantIntent = "explain" | "howto" | "recommend";

function looksLikeJobDescription(text: string): boolean {
  return /\b(i need|need a|need an|hire|hiring|looking for|want to hire|pay(ing)? (my|a|the)|for (a |my )?project|three stages|multi[- ]?stage)\b/.test(
    text
  );
}

function looksLikeTypeRecommendation(text: string): boolean {
  return /\bwhich (contract|type|one)\b|\bshould i use\b|\brecommend\b|\bbest (fit|for|type|contract)\b|\bwhat (contract|type) (should|do|fits)\b/.test(
    text
  );
}

/**
 * Classify Create-mode Assistant turns so explanations are not treated as job drafts.
 */
export function classifyCreateAssistantIntent(prompt: string): CreateAssistantIntent {
  const text = prompt.trim().toLowerCase();
  if (!text) return "explain";

  if (looksLikeTypeRecommendation(text) || looksLikeJobDescription(text)) {
    return "recommend";
  }

  if (
    /\bhow (do|to|can|does|should)\b/.test(text) ||
    /\bwalk me\b/.test(text) ||
    /\bsteps?\b/.test(text)
  ) {
    return "howto";
  }

  if (
    text.includes("?") ||
    /\b(explain|what is|what's|whats|what are|what does|what do|mean|meaning|difference|compare|tell me about|describe)\b/.test(
      text
    ) ||
    /^(what|why|when|where|who)\b/.test(text)
  ) {
    return "explain";
  }

  // Bare topic like "streaming contract" / "paid trial" / "dispute" → explain, not propose
  if (
    /\b(fixed|milestone|streaming|hourly|trial|escrow|resolver|wallet|collect|claim|dispute|disputed)\b/.test(
      text
    ) &&
    text.split(/\s+/).length <= 12
  ) {
    return "explain";
  }

  return "explain";
}

/** @deprecated Prefer classifyCreateAssistantIntent — kept for call sites/tests. */
export function isEducationalAssistantPrompt(prompt: string): boolean {
  const intent = classifyCreateAssistantIntent(prompt);
  return intent === "explain" || intent === "howto";
}

export function isRecommendationAssistantPrompt(prompt: string): boolean {
  return classifyCreateAssistantIntent(prompt) === "recommend";
}

/** Marker used in tests — must never appear for known product questions. */
export const GENERIC_TOPIC_LIST_FALLBACK =
  "I can explain PREMIFLOW topics such as Fixed, Milestone";

/**
 * Offline FAQ / how-to answers. Always prefer this over create-proposal heuristics
 * and over model generation when a reliable product answer exists.
 */
export function deterministicGuideAnswer(prompt: string): string | null {
  const text = prompt.trim().toLowerCase();
  if (!text) return null;

  const wantsExplain =
    /\b(explain|what|how|mean|difference|compare|tell me|describe|who|happen|happens|resolved?|raise|open)\b/.test(
      text
    ) ||
    text.includes("?") ||
    text.split(/\s+/).length <= 12;

  // --- Disputes / resolver (match before generic topic FAQs) ---
  if (
    /\b(can you|could you|will you|do you)\b/.test(text) &&
    /\b(resolve|settle|decide|award)\b/.test(text) &&
    /\b(dispute|disagreement|conflict)\b/.test(text)
  ) {
    return [
      "No. PREMIFLOW Assistant can explain how disputes work, but it cannot open a dispute, resolve one, choose a winner, set an award amount, or sign any wallet transaction.",
      "Only the employer or freelancer can open a dispute with their wallet. Only the contract’s designated resolver can record how the disputed amount is divided — and that still requires the resolver’s wallet confirmation.",
      "After resolution, Collect (freelancer) and Claim refund (employer) are also wallet actions the Assistant cannot perform.",
    ].join("\n\n");
  }

  if (
    /\bdisput/.test(text) &&
    /\b(fund|funds|escrow|money|payment|tokens?|protected)\b/.test(text) &&
    wantsExplain
  ) {
    return [
      "Protected funds stay in the contract escrow while a dispute is open. Opening a dispute does not pay the freelancer and does not refund the employer.",
      "While the contract is frozen in dispute, Collect and Claim are blocked. Everyday actions like cancel, submit, approve, or stream release are also blocked for that contract.",
      "Amounts that were already released before the dispute stay in the contract’s existing accounting. Only the remaining unsettled (contested) amount is what the resolver divides.",
      "When the resolver records a settlement, tokens still do not move to the resolver. After the contract is Resolved, the freelancer Collects any claimable pay and the employer Claims any refundable amount with their own wallets.",
    ].join("\n\n");
  }

  if (
    (/\bwho\b/.test(text) && /\bresolv/.test(text)) ||
    (/\bwho\b/.test(text) && /\bresolver\b/.test(text)) ||
    (/\bwhat (does|is)\b/.test(text) && /\bresolver\b/.test(text)) ||
    (/\bresolver\b/.test(text) && wantsExplain && !/\bdisput/.test(text))
  ) {
    return [
      "The resolver is the designated third party named on the PREMIFLOW contract for disputes.",
      "If employer and freelancer cannot agree, either of them can open a dispute (when the contract allows it). That freezes the remaining unsettled amount. The resolver then records how that disputed amount is split between freelancer settlement and employer refund — using their wallet. The resolver does not receive or hold the escrow.",
      "Employer and freelancer cannot resolve the dispute themselves on-chain. PREMIFLOW staff do not currently review the case for them.",
      "PREMIFLOW Assistant never chooses a winner, suggests an award percentage, or signs resolve for anyone.",
    ].join("\n\n");
  }

  if (
    /\bdisput/.test(text) &&
    /\b(how|raise|open|start|begin|file|create)\b/.test(text) &&
    !/\bresolv/.test(text)
  ) {
    return [
      "Either the employer or the freelancer can open a dispute from the contract when a contested remainder remains and the contract status allows it (typically while Active, or while a paid trial is under employer review).",
      "How to raise one in PREMIFLOW:",
      "1. Open the contract page.\n2. Choose Open dispute when it is available for your role.\n3. Confirm the wallet transaction. Opening freezes the contract — it does not move tokens.\n4. Optionally add case notes/statements in the Resolution Center UI (these are not required for the on-chain open or resolve).\n5. Wait for the designated resolver to record the settlement split.\n6. After Resolved, use Collect or Claim refund with your wallet if amounts are available.",
      "The Assistant can explain this path but cannot open the dispute for you.",
    ].join("\n\n");
  }

  if (
    /\bdisput/.test(text) ||
    (/\bdisagree/.test(text) && /\b(employer|freelancer|party|parties)\b/.test(text)) ||
    (/\bhow\b/.test(text) && /\bresolv/.test(text) && !/\bresolver\b/.test(text))
  ) {
    return [
      "If you and the other party disagree and cannot settle it directly, PREMIFLOW can freeze the remaining unsettled amount for dispute resolution.",
      "What happens step by step:",
      "1. Employer or freelancer opens a dispute with their wallet (when the contract allows it and some amount is still contested).\n2. The contract becomes Disputed and freezes. No tokens move at open.\n3. Collect, Claim, cancel, submit/approve, and similar lifecycle actions stay blocked while disputed.\n4. The designated resolver records how the disputed amount is divided between freelancer settlement and employer refund. That records accounting only — escrow is not sent to the resolver.\n5. After the contract is Resolved, the freelancer Collects any claimable pay and the employer Claims any refundable amount, each with their own wallet.",
      "Already-released amounts stay in existing accounting; only the remaining unsettled amount is contested.",
      "PREMIFLOW Assistant explains this flow but cannot open or resolve a dispute, choose a winner, or move funds.",
    ].join("\n\n");
  }

  if (/milestone/.test(text) && /stream/.test(text) && wantsExplain) {
    return [
      "Milestone and Streaming are different ways to protect ongoing work.",
      "Milestone splits a project into separate paid stages. Each stage is submitted and reviewed on its own, and remaining funds stay protected for unfinished stages.",
      "Streaming accrues value with scheduled contract time while the stream is active. It does not require stage-by-stage delivery, and it does not track Start work / Stop work sessions.",
      "Use Milestone when the work has clear deliverable stages. Use Streaming when you want continuous scheduled accrual over a period. If payment should follow logged sessions instead, use Hourly.",
    ].join("\n\n");
  }

  if (/fixed/.test(text) && /stream/.test(text) && wantsExplain) {
    return [
      "Fixed and Streaming solve different jobs.",
      "Fixed is for one defined deliverable at one price. The freelancer submits that work for review; after release rules are met, the freelancer can Collect the released amount.",
      "Streaming is for payment that accrues while a scheduled contract window is active. It follows calendar/contract time, not Start work / Stop work sessions. Accrued value still has to become released/available before Collect.",
      "Choose Fixed when the outcome is a finished piece of work. Choose Streaming when you want continuous scheduled accrual over an agreed period. If you need logged sessions instead, use Hourly.",
    ].join("\n\n");
  }

  if (/\bstream(ing)?\b/.test(text) && wantsExplain) {
    return [
      "A Streaming contract is designed for ongoing work where payment accrues over time instead of being tied to one final delivery or separate milestones.",
      "In PREMIFLOW, the employer funds the protected contract first. Once the contract becomes Active, the streaming schedule can run and value accrues progressively according to the contract clock. The funds remain protected while accrued/released amounts are tracked under the protocol.",
      "This can work well for retainers, long-term design/engineering periods, or other arrangements where work continues over a period rather than being delivered as one finished job.",
      "Unlike a Fixed contract, which uses one agreed price for a completed job, Streaming connects earnings to scheduled contract time. Unlike Milestone, it does not require the project to be divided into separate paid stages. Unlike Hourly, it does not track Start work / Stop work sessions.",
      "If you're hiring for ongoing work, tell me how the freelancer will be working and I can help you compare Streaming with Hourly.",
    ].join("\n\n");
  }

  if (/\bhourly\b/.test(text) && wantsExplain && !/\bstream/.test(text)) {
    return [
      "An Hourly contract pays for recorded working time, not for calendar idle time alone.",
      "In PREMIFLOW, you set an hourly rate and a maximum authorized working budget, then fund that protected amount. After the contract is active, the freelancer uses Start work and Stop work to open and close sessions. Only that recorded session time counts toward Hourly earnings.",
      "That is different from Streaming, which accrues with scheduled contract time automatically, and different from Fixed/Milestone, which release value after deliverable review.",
      "Hourly fits consulting or support work where you only want to pay for logged sessions. Creating/funding still requires your wallet — the Assistant never signs for you.",
    ].join("\n\n");
  }

  if (/\bfixed\b/.test(text) && wantsExplain && !/\bstream/.test(text) && !/\bmilestone\b/.test(text)) {
    return [
      "A Fixed contract is one agreed price for one defined job.",
      "In PREMIFLOW, the employer funds that amount into protected escrow. The freelancer does the work and submits the deliverable for review. When the unit is approved or released under the contract rules, that value can become available for the freelancer to Collect later.",
      "Fixed fits clear one-shot deliverables such as a logo, article, or single development task. If the work naturally splits into stages, Milestone is usually a better fit. If pay should follow time or sessions, consider Streaming or Hourly.",
    ].join("\n\n");
  }

  if (
    /(how).*(create|make).*(milestone)/.test(text) ||
    /(how).*(add|set).*(milestone)/.test(text)
  ) {
    return [
      "Here’s how to create a Milestone contract in PREMIFLOW:",
      "1. Open Create contract.\n2. Choose Milestone.\n3. Enter the freelancer wallet on People.\n4. Set the total payment amount.\n5. On Work, add the title/description and each milestone (label, amount, timing).\n6. Optionally enable Paid trial on Protection.\n7. Set schedule and review windows.\n8. Review the summary, then confirm the wallet transaction to create and fund.",
      "The Assistant can explain the fields, but only your wallet can create and fund the contract.",
    ].join("\n\n");
  }

  if (
    /(how).*(create|make).*(contract)/.test(text) ||
    /create a (fixed |milestone |streaming |hourly )?contract/.test(text)
  ) {
    return [
      "Here’s how to create a contract in PREMIFLOW today:",
      "1. Open Create contract.\n2. Choose the payment type (Fixed, Milestone, Streaming, or Hourly).\n3. Enter the freelancer wallet and payment details.\n4. Add the work title/description (and milestones if Milestone).\n5. Optionally enable Paid trial.\n6. Set schedule and protection settings (acceptance deadline, durations, review windows).\n7. Review the summary.\n8. Confirm the wallet transaction to create and fund.",
      "The Assistant can explain fields and suggest a structure, but only your wallet can create and fund the contract.",
    ].join("\n\n");
  }

  if (/milestone/.test(text) && /(what|explain|mean|how)/.test(text)) {
    return [
      "A milestone contract divides a project into separate stages, with an agreed payment amount for each stage.",
      "In PREMIFLOW, the employer defines the milestones and funds the protected contract up front. The freelancer completes each stage and submits that work for review.",
      "When a milestone is approved (or released under the contract’s review rules), its payment can become available for the freelancer to Collect later. Funds for unfinished stages stay protected in escrow.",
      "This fits larger projects such as website builds where you might split Design, Development, and Final Delivery.",
      "If you tell me what you’re hiring for, I can explain whether Milestone fits better than Fixed or Streaming.",
    ].join("\n\n");
  }

  if (/paid trial|\btrial\b/.test(text) && /(what|how|explain|mean|work|add)/.test(text)) {
    return [
      "A paid trial lets you test the collaboration with a smaller protected amount before the main contract work begins.",
      "In PREMIFLOW, the trial amount is funded as part of the protected contract. Accepting the offer does not automatically start the main Fixed/Milestone/Streaming work or an Hourly session until the trial path is completed under the contract rules.",
      "That keeps both sides safer: the freelancer can be paid for an agreed trial deliverable/session path, and the employer can evaluate fit before unlocking the larger engagement.",
      "On Create Contract, open the Protection step, turn on Paid trial, set the trial amount, then continue. Creating/funding still requires your wallet confirmation — the Assistant never funds for you.",
    ].join("\n\n");
  }

  if (/(how).*(accept)/.test(text)) {
    return [
      "Acceptance is the freelancer’s wallet-signed agreement to a funded offer.",
      "In PREMIFLOW, after an employer creates/funds a contract, the freelancer opens that contract page and uses Accept before the acceptance deadline.",
      "Accepting does not always start main work immediately — activation and any paid-trial path still follow the contract rules. The Assistant cannot accept for anyone.",
    ].join("\n\n");
  }

  if (/(how).*(collect)/.test(text) || /\bcollect payment\b/.test(text)) {
    return [
      "Collect is how a freelancer withdraws already-released pay from protected escrow into their wallet.",
      "Approval/release (or streaming release rules) must make value collectable first. If Collect is unavailable, the contract status or available amount usually means nothing is released yet.",
      "Collect always needs the freelancer’s wallet signature. The Assistant can explain the path but cannot move funds.",
    ].join("\n\n");
  }

  if (/(how).*(claim)/.test(text) || /\bclaim refund\b/.test(text) || (/\bclaim\b/.test(text) && wantsExplain && !/\bdisput/.test(text))) {
    return [
      "Claim refund is how an employer withdraws refundable amounts from protected escrow into their wallet after the contract accounting makes a refund available (for example after cancel paths or after a dispute is Resolved with an employer share).",
      "While a dispute is open, Claim is blocked. After Resolved (or other paths that create refundable balance), the employer uses Claim refund and confirms with their wallet.",
      "The Assistant can explain Claim but cannot move funds.",
    ].join("\n\n");
  }

  if (/(how).*(activat)/.test(text) || /\bactivation\b/.test(text) && wantsExplain) {
    return [
      "Activation is when funded work becomes ready to run under the contract rules — for example after acceptance and any paid-trial path, the employer may start/activate so the main schedule or sessions can begin.",
      "Exact buttons depend on contract type and status on the contract page. The Assistant cannot activate for you; your wallet confirms the action.",
    ].join("\n\n");
  }

  if (/\b(review|revision|submit|submission)\b/.test(text) && wantsExplain && !/\bdisput/.test(text)) {
    return [
      "For Fixed and Milestone (and paid-trial review paths), the freelancer submits work for review. The employer can approve, request revision, or let review windows apply under the contract rules.",
      "Approval/release paths can make value available for the freelancer to Collect later. Remaining protected funds stay in escrow until the protocol allows a withdraw.",
      "Ask about a specific contract page if you want next-step guidance tied to that contract’s live status.",
    ].join("\n\n");
  }

  if (/wallet/.test(text) && /(why|need|what)/.test(text)) {
    return [
      "PREMIFLOW uses a Solana wallet so you can prove control of your account and approve on-chain actions.",
      "Creating/funding a contract, accepting work, Collecting released pay, Claiming refunds, opening or resolving disputes, and similar steps require your confirmation in the wallet. That is intentional: the Assistant explains and guides, but cannot move funds or sign for you.",
      "Connect your wallet from the app header, then verify it when a feature asks (for example before live contract Assistant answers).",
    ].join("\n\n");
  }

  if (/escrow|protected payment|protect/.test(text) && /(what|how|explain)/.test(text)) {
    return [
      "Escrow in PREMIFLOW means the contract funds are held in a program-controlled account, not sitting freely in either person’s everyday wallet balance for that protected amount.",
      "Neither employer nor freelancer can simply take those protected funds outside the contract rules. Release, Collect, Claim, cancel, and dispute paths follow the on-chain lifecycle.",
      "That is what “protected payment” means in practical terms: value stays tied to the contract until the protocol allows a withdraw.",
    ].join("\n\n");
  }

  return null;
}

/** Last-resort explain/howto reply when no FAQ matched and model generation failed. */
export function fallbackGuideAnswer(prompt: string, intent: CreateAssistantIntent): string {
  const clipped = prompt.trim().slice(0, 160);
  if (intent === "howto") {
    return [
      `I don’t have a built-in step-by-step for “${clipped}” yet.`,
      "Try asking about a specific PREMIFLOW action you see in the product — for example creating a Milestone contract, enabling a paid trial, accepting an offer, Collecting released pay, Claiming a refund, or opening a dispute.",
      "I never create, fund, or sign transactions for you — your wallet confirms those actions.",
    ].join("\n\n");
  }
  return [
    `I couldn’t match “${clipped}” to a built-in PREMIFLOW explanation.`,
    "Try naming the concept more directly (for example: Streaming, paid trial, escrow, Collect, Claim, resolver, or how disputes are resolved). If you’re choosing a contract type for real work, describe the job and I can recommend Fixed, Milestone, Streaming, or Hourly and explain why.",
    "I explain and guide only — I never move funds or sign for you.",
  ].join("\n\n");
}

export function formatNarrativeGuideText(parts: {
  summary: string;
  explanation?: string | null;
  nextExpectedStep?: string | null;
  consequence?: string | null;
}): string {
  return [
    parts.summary.trim(),
    parts.explanation?.trim() || null,
    parts.nextExpectedStep?.trim() || null,
    parts.consequence?.trim() || null,
  ]
    .filter(Boolean)
    .join("\n\n");
}
