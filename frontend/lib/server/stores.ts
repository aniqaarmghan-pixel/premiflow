export type AuthChallengeRecord = {
  id: string;
  walletAddress: string;
  nonceHash: string;
  message: string;
  createdAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
};

export type SessionRecord = {
  id: string;
  tokenHash: string;
  walletAddress: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
};

export type MessageRecord = {
  id: string;
  contractAddress: string;
  senderWallet: string;
  body: string;
  createdAt: Date;
};

export type ThreadReadRecord = {
  contractAddress: string;
  walletAddress: string;
  lastReadMessageId: string | null;
  lastReadAt: Date;
};

export type MessageCursor = {
  createdAt: Date;
  id: string;
};

export interface AuthStore {
  insertChallenge(row: AuthChallengeRecord): Promise<void>;
  getChallenge(id: string): Promise<AuthChallengeRecord | null>;
  latestChallengeForWallet(wallet: string): Promise<AuthChallengeRecord | null>;
  consumeChallenge(id: string, now: Date): Promise<AuthChallengeRecord | null>;
  insertSession(row: SessionRecord): Promise<void>;
  getSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  revokeSession(id: string, now: Date): Promise<boolean>;
}

export interface MessageStore {
  insertMessage(row: MessageRecord): Promise<MessageRecord>;
  getMessage(id: string): Promise<MessageRecord | null>;
  listMessagesBefore(
    contractAddress: string,
    cursor: MessageCursor | null,
    limit: number
  ): Promise<MessageRecord[]>;
  upsertRead(row: ThreadReadRecord): Promise<void>;
  getRead(
    contractAddress: string,
    walletAddress: string
  ): Promise<ThreadReadRecord | null>;
  countUnread(input: {
    contractAddress: string;
    wallet: string;
    after: MessageCursor | null;
  }): Promise<number>;
}

export interface RateLimitStore {
  addEvent(bucket: string, at: Date): Promise<void>;
  countSince(bucket: string, since: Date): Promise<number>;
}

export type OffchainWorkflowStatus =
  | "awaiting_statements"
  | "ready_for_resolver"
  | "under_review"
  | "settlement_submitted";

export type PartyStatementRole = "employer" | "freelancer";

export type DisputeOpener = "Employer" | "Freelancer";

export type ResolutionCaseRecord = {
  id: string;
  contractAddress: string;
  disputeOpener: DisputeOpener;
  disputeCategory: string | null;
  disputeDescription: string | null;
  resolverWallet: string;
  workflowStatus: OffchainWorkflowStatus;
  openedAt: Date;
  resolvedAt: Date | null;
  contestedAmountSnapshot: string;
  openSignature: string | null;
  resolveSignature: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PartyStatementRecord = {
  id: string;
  caseId: string;
  partyWallet: string;
  partyRole: PartyStatementRole;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  submittedAt: Date;
};

export type CaseEventRecord = {
  id: string;
  caseId: string;
  eventType: string;
  actorWallet: string | null;
  payload: string | null;
  createdAt: Date;
};

export type EvidenceSnapshotRecord = {
  id: string;
  caseId: string;
  contractAddress: string;
  messageId: string;
  submittedBy: string;
  submittedByRole: PartyStatementRole;
  senderWalletSnapshot: string;
  bodySnapshot: string;
  createdAtSnapshot: Date;
  submittedAt: Date;
};

export type ResolutionCasePatch = Partial<
  Pick<
    ResolutionCaseRecord,
    | "disputeOpener"
    | "disputeCategory"
    | "disputeDescription"
    | "resolverWallet"
    | "workflowStatus"
    | "openedAt"
    | "resolvedAt"
    | "contestedAmountSnapshot"
    | "openSignature"
    | "resolveSignature"
    | "updatedAt"
  >
>;

export interface CaseStore {
  getCaseByContract(contractAddress: string): Promise<ResolutionCaseRecord | null>;
  getCaseById(id: string): Promise<ResolutionCaseRecord | null>;
  insertCase(row: ResolutionCaseRecord): Promise<ResolutionCaseRecord>;
  updateCase(id: string, patch: ResolutionCasePatch): Promise<ResolutionCaseRecord | null>;
  listStatements(caseId: string): Promise<PartyStatementRecord[]>;
  getStatement(
    caseId: string,
    partyWallet: string
  ): Promise<PartyStatementRecord | null>;
  upsertStatement(row: PartyStatementRecord): Promise<PartyStatementRecord>;
  listEvidence(caseId: string): Promise<EvidenceSnapshotRecord[]>;
  getEvidenceByMessage(
    caseId: string,
    messageId: string
  ): Promise<EvidenceSnapshotRecord | null>;
  insertEvidence(row: EvidenceSnapshotRecord): Promise<EvidenceSnapshotRecord>;
  insertEvent(row: CaseEventRecord): Promise<CaseEventRecord>;
}

export type WorkSubmissionKind = "trial" | "fixed" | "milestone";

export type WorkSubmissionRecord = {
  id: string;
  contractAddress: string;
  submissionKind: WorkSubmissionKind;
  workUnitIndex: number;
  revisionNumber: number;
  freelancerWallet: string;
  deliveryNote: string;
  onChainSubmissionUri: string;
  transactionSignature: string | null;
  chainSubmittedAt: Date | null;
  createdAt: Date;
};

export type WorkSubmissionLinkRecord = {
  id: string;
  submissionId: string;
  url: string;
  label: string | null;
  position: number;
};

export type WorkSubmissionWithLinks = WorkSubmissionRecord & {
  links: WorkSubmissionLinkRecord[];
};

export interface SubmissionStore {
  insertSubmission(
    row: WorkSubmissionRecord,
    links: Omit<WorkSubmissionLinkRecord, "id" | "submissionId">[]
  ): Promise<WorkSubmissionWithLinks>;
  getByTransactionSignature(
    signature: string
  ): Promise<WorkSubmissionWithLinks | null>;
  listByContract(contractAddress: string): Promise<WorkSubmissionWithLinks[]>;
}

export type AttachmentContextKind = "message" | "work_submission";
export type AttachmentStatus = "pending" | "active" | "deleted";

export type AttachmentRecord = {
  id: string;
  contractAddress: string;
  uploaderWallet: string;
  context: AttachmentContextKind;
  blobPathname: string;
  blobUrl: string;
  displayFilename: string;
  contentType: string;
  byteSize: number;
  status: AttachmentStatus;
  createdAt: Date;
  deletedAt: Date | null;
};

export type MessageAttachmentBinding = {
  messageId: string;
  attachmentId: string;
  position: number;
};

export type WorkSubmissionAttachmentBinding = {
  submissionId: string;
  attachmentId: string;
  position: number;
};

export interface AttachmentStore {
  insertPending(row: AttachmentRecord): Promise<AttachmentRecord>;
  getById(id: string): Promise<AttachmentRecord | null>;
  listByIds(ids: string[]): Promise<AttachmentRecord[]>;
  markDeleted(id: string, now: Date): Promise<AttachmentRecord | null>;
  bindToMessage(
    messageId: string,
    attachmentIds: string[],
    now?: Date
  ): Promise<AttachmentRecord[]>;
  bindToSubmission(
    submissionId: string,
    attachmentIds: string[],
    now?: Date
  ): Promise<AttachmentRecord[]>;
  listForMessages(messageIds: string[]): Promise<
    { messageId: string; attachment: AttachmentRecord; position: number }[]
  >;
  listForSubmissions(submissionIds: string[]): Promise<
    { submissionId: string; attachment: AttachmentRecord; position: number }[]
  >;
  findMessageBinding(attachmentId: string): Promise<MessageAttachmentBinding | null>;
  findSubmissionBinding(
    attachmentId: string
  ): Promise<WorkSubmissionAttachmentBinding | null>;
}

export type NotificationRecord = {
  id: string;
  recipientWallet: string;
  type: string;
  contractAddress: string | null;
  title: string;
  body: string;
  href: string | null;
  payload: Record<string, unknown> | null;
  uniqueKey: string;
  createdAt: Date;
  readAt: Date | null;
};

export type NotificationCursor = {
  createdAt: Date;
  id: string;
};

export interface NotificationStore {
  insertIdempotent(row: NotificationRecord): Promise<{
    row: NotificationRecord;
    created: boolean;
  }>;
  getByIdForWallet(
    id: string,
    recipientWallet: string
  ): Promise<NotificationRecord | null>;
  listForWallet(
    recipientWallet: string,
    cursor: NotificationCursor | null,
    limit: number
  ): Promise<NotificationRecord[]>;
  countUnread(recipientWallet: string): Promise<number>;
  markRead(
    id: string,
    recipientWallet: string,
    now: Date
  ): Promise<NotificationRecord | null>;
  markAllRead(recipientWallet: string, now: Date): Promise<number>;
}
