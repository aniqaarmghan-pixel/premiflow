import type {
  AuthChallengeRecord,
  AuthStore,
  CaseEventRecord,
  CaseStore,
  MessageCursor,
  MessageRecord,
  MessageStore,
  PartyStatementRecord,
  RateLimitStore,
  ResolutionCaseRecord,
  SessionRecord,
  ThreadReadRecord,
} from "./stores";

function compareCursor(a: MessageCursor, b: MessageCursor): number {
  if (a.createdAt.getTime() !== b.createdAt.getTime()) {
    return a.createdAt.getTime() - b.createdAt.getTime();
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function createMemoryAuthStore(): AuthStore {
  const challenges: AuthChallengeRecord[] = [];
  const sessions: SessionRecord[] = [];
  return {
    async insertChallenge(row) {
      challenges.push({ ...row });
    },
    async getChallenge(id) {
      return challenges.find((row) => row.id === id) ?? null;
    },
    async latestChallengeForWallet(wallet) {
      return (
        challenges
          .filter((row) => row.walletAddress === wallet)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null
      );
    },
    async consumeChallenge(id, now) {
      const row = challenges.find((item) => item.id === id);
      if (!row || row.consumedAt || row.expiresAt.getTime() <= now.getTime()) {
        return null;
      }
      row.consumedAt = now;
      return { ...row };
    },
    async insertSession(row) {
      sessions.push({ ...row });
    },
    async getSessionByTokenHash(tokenHash) {
      return sessions.find((row) => row.tokenHash === tokenHash) ?? null;
    },
    async revokeSession(id, now) {
      const row = sessions.find((item) => item.id === id);
      if (!row || row.revokedAt) return false;
      row.revokedAt = now;
      return true;
    },
  };
}

export function createMemoryMessageStore(): MessageStore {
  const messages: MessageRecord[] = [];
  const reads: ThreadReadRecord[] = [];
  return {
    async insertMessage(row) {
      const saved = { ...row };
      messages.push(saved);
      return saved;
    },
    async getMessage(id) {
      return messages.find((row) => row.id === id) ?? null;
    },
    async listMessagesBefore(contractAddress, cursor, limit) {
      return messages
        .filter((row) => row.contractAddress === contractAddress)
        .filter((row) =>
          cursor ? compareCursor({ createdAt: row.createdAt, id: row.id }, cursor) < 0 : true
        )
        .sort((a, b) => compareCursor(b, a))
        .slice(0, limit);
    },
    async upsertRead(row) {
      const index = reads.findIndex(
        (item) =>
          item.contractAddress === row.contractAddress &&
          item.walletAddress === row.walletAddress
      );
      if (index >= 0) reads[index] = { ...row };
      else reads.push({ ...row });
    },
    async getRead(contractAddress, walletAddress) {
      return (
        reads.find(
          (row) =>
            row.contractAddress === contractAddress &&
            row.walletAddress === walletAddress
        ) ?? null
      );
    },
    async countUnread({ contractAddress, wallet, after }) {
      return messages.filter((row) => {
        if (row.contractAddress !== contractAddress) return false;
        if (row.senderWallet === wallet) return false;
        if (!after) return true;
        return messageIsAfter(row, after);
      }).length;
    },
  };
}

export function createMemoryRateLimitStore(): RateLimitStore {
  const events: { bucket: string; at: Date }[] = [];
  return {
    async addEvent(bucket, at) {
      events.push({ bucket, at });
    },
    async countSince(bucket, since) {
      return events.filter(
        (event) => event.bucket === bucket && event.at.getTime() > since.getTime()
      ).length;
    },
  };
}

export function messageIsAfter(message: MessageRecord, cursor: MessageCursor): boolean {
  return compareCursor({ createdAt: message.createdAt, id: message.id }, cursor) > 0;
}

export function createMemoryCaseStore(): CaseStore {
  const cases: ResolutionCaseRecord[] = [];
  const statements: PartyStatementRecord[] = [];
  const events: CaseEventRecord[] = [];
  return {
    async getCaseByContract(contractAddress) {
      const row = cases.find((item) => item.contractAddress === contractAddress);
      return row ? { ...row } : null;
    },
    async getCaseById(id) {
      const row = cases.find((item) => item.id === id);
      return row ? { ...row } : null;
    },
    async insertCase(row) {
      if (cases.some((item) => item.contractAddress === row.contractAddress)) {
        const error = new Error("duplicate contract_address");
        (error as Error & { code?: string }).code = "23505";
        throw error;
      }
      const saved = { ...row };
      cases.push(saved);
      return { ...saved };
    },
    async updateCase(id, patch) {
      const row = cases.find((item) => item.id === id);
      if (!row) return null;
      Object.assign(row, patch);
      return { ...row };
    },
    async listStatements(caseId) {
      return statements.filter((row) => row.caseId === caseId).map((row) => ({ ...row }));
    },
    async getStatement(caseId, partyWallet) {
      const row = statements.find(
        (item) => item.caseId === caseId && item.partyWallet === partyWallet
      );
      return row ? { ...row } : null;
    },
    async upsertStatement(row) {
      const index = statements.findIndex(
        (item) => item.caseId === row.caseId && item.partyWallet === row.partyWallet
      );
      if (index >= 0) {
        statements[index] = {
          ...statements[index],
          body: row.body,
          partyRole: row.partyRole,
          updatedAt: row.updatedAt,
          submittedAt: row.submittedAt,
        };
        return { ...statements[index] };
      }
      const saved = { ...row };
      statements.push(saved);
      return { ...saved };
    },
    async insertEvent(row) {
      const saved = { ...row };
      events.push(saved);
      return { ...saved };
    },
  };
}

export { compareCursor };
