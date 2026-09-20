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
