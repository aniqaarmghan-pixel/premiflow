/**
 * Server-only Blob credential access.
 * Never import from client components. Never log token values.
 */

export class BlobConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlobConfigError";
  }
}

export type BlobEnv = {
  readWriteToken: string;
  storeId: string | null;
};

export function readBlobEnv(
  env: NodeJS.ProcessEnv = process.env
): BlobEnv {
  const readWriteToken = env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!readWriteToken) {
    throw new BlobConfigError("Private attachment storage is not configured.");
  }
  const storeId = env.BLOB_STORE_ID?.trim() || null;
  return { readWriteToken, storeId };
}
