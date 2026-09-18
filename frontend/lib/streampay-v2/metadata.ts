import { MAX_URI_LEN } from "./constants";

/**
 * Off-chain contract record. The program stores only `metadata_uri` +
 * `metadata_hash`. This type is the application payload those fields point at.
 */
export type ContractMetadata = {
  title: string;
  description: string;
  deliverables: string[];
  attachments: MetadataAttachment[];
  skills: string[];
  externalReferences: MetadataReference[];
};

export type MetadataAttachment = {
  name: string;
  uri: string;
  mimeType?: string;
};

export type MetadataReference = {
  label: string;
  uri: string;
};

export type StoredMetadata = {
  uri: string;
  hash: Uint8Array;
};

/**
 * Transport adapter. Phase 12 does not ship IPFS, a database, or a backend.
 * Later phases can implement this with IPFS, Arweave, or an app server.
 */
export interface MetadataStore {
  put(metadata: ContractMetadata): Promise<StoredMetadata>;
  get(uri: string): Promise<ContractMetadata>;
}

export function emptyMetadata(): ContractMetadata {
  return {
    title: "",
    description: "",
    deliverables: [],
    attachments: [],
    skills: [],
    externalReferences: [],
  };
}

export function assertMetadataUri(uri: string): string {
  if (uri.length === 0 || uri.length > MAX_URI_LEN) {
    throw new Error(
      `metadata URI must be 1..=${MAX_URI_LEN} bytes, got ${uri.length}`
    );
  }
  return uri;
}

export function serializeMetadata(metadata: ContractMetadata): Uint8Array {
  const json = JSON.stringify(metadata);
  return new TextEncoder().encode(json);
}

export async function hashBytes(data: Uint8Array): Promise<Uint8Array> {
  const copy = new ArrayBuffer(data.byteLength);
  new Uint8Array(copy).set(data);
  const digest = await crypto.subtle.digest("SHA-256", copy);
  return new Uint8Array(digest);
}

export async function hashMetadata(
  metadata: ContractMetadata
): Promise<Uint8Array> {
  return hashBytes(serializeMetadata(metadata));
}

/**
 * In-memory adapter for tests and local UI experiments. Not a production store.
 */
export class MemoryMetadataStore implements MetadataStore {
  private readonly byUri = new Map<string, ContractMetadata>();
  private seq = 0;

  async put(metadata: ContractMetadata): Promise<StoredMetadata> {
    this.seq += 1;
    const uri = `memory:contract-metadata/${this.seq}`;
    assertMetadataUri(uri);
    this.byUri.set(uri, metadata);
    return { uri, hash: await hashMetadata(metadata) };
  }

  async get(uri: string): Promise<ContractMetadata> {
    const found = this.byUri.get(uri);
    if (!found) {
      throw new Error(`metadata not found: ${uri}`);
    }
    return found;
  }
}
