import {
  assertMetadataUri,
  hashMetadata,
  type ContractMetadata,
  type MetadataStore,
  type StoredMetadata,
} from "@/lib/streampay-v2";

const PREFIX = "streampay:meta:";

export class LocalStorageMetadataStore implements MetadataStore {
  async put(metadata: ContractMetadata): Promise<StoredMetadata> {
    const hash = await hashMetadata(metadata);
    const hex = [...hash].map((b) => b.toString(16).padStart(2, "0")).join("");
    const uri = `local:${hex}`;
    assertMetadataUri(uri);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(`${PREFIX}${uri}`, JSON.stringify(metadata));
    }
    return { uri, hash };
  }

  async get(uri: string): Promise<ContractMetadata> {
    if (typeof window === "undefined") {
      throw new Error("metadata is stored in this browser only");
    }
    const raw = window.localStorage.getItem(`${PREFIX}${uri}`);
    if (!raw) throw new Error(`metadata not found: ${uri}`);
    return JSON.parse(raw) as ContractMetadata;
  }
}

export const localMetadataStore = new LocalStorageMetadataStore();
