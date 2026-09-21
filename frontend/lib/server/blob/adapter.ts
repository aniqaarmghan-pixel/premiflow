/**
 * Isolated server-only Vercel Blob adapter for private PREMIFLOW attachments.
 * Do not call @vercel/blob from React components.
 * Never fetch arbitrary remote URLs into storage.
 */

import { del, get, put, type PutBlobResult } from "@vercel/blob";

import { readBlobEnv } from "./env";

export type PrivateBlobPutResult = {
  pathname: string;
  url: string;
  contentType: string;
  size: number;
};

export type PrivateBlobGetResult = {
  stream: ReadableStream<Uint8Array>;
  contentType: string;
  size: number;
  contentDisposition: string;
};

export type BlobStorage = {
  putPrivate(input: {
    pathname: string;
    body: ArrayBuffer | Blob | Buffer | File | ReadableStream | string;
    contentType: string;
    byteSize: number;
  }): Promise<PrivateBlobPutResult>;
  getPrivate(pathname: string): Promise<PrivateBlobGetResult | null>;
  deletePrivate(pathname: string): Promise<void>;
};

function tokenOptions() {
  const env = readBlobEnv();
  return { token: env.readWriteToken };
}

export function createVercelBlobStorage(): BlobStorage {
  return {
    async putPrivate(input) {
      const result: PutBlobResult = await put(input.pathname, input.body, {
        access: "private",
        contentType: input.contentType,
        addRandomSuffix: false,
        ...tokenOptions(),
      });
      return {
        pathname: result.pathname,
        url: result.url,
        contentType: result.contentType,
        size: input.byteSize,
      };
    },
    async getPrivate(pathname) {
      const result = await get(pathname, {
        access: "private",
        ...tokenOptions(),
      });
      if (!result || result.statusCode !== 200 || !result.stream) {
        return null;
      }
      return {
        stream: result.stream,
        contentType: result.blob.contentType,
        size: result.blob.size,
        contentDisposition: result.blob.contentDisposition,
      };
    },
    async deletePrivate(pathname) {
      await del(pathname, tokenOptions());
    },
  };
}

/** In-memory fake for tests — never touches network or credentials. */
export function createMemoryBlobStorage(): BlobStorage {
  const objects = new Map<
    string,
    { body: Buffer; contentType: string; url: string }
  >();
  return {
    async putPrivate(input) {
      const buffer =
        typeof input.body === "string"
          ? Buffer.from(input.body)
          : Buffer.isBuffer(input.body)
            ? input.body
            : input.body instanceof ArrayBuffer
              ? Buffer.from(input.body)
              : input.body instanceof Blob
                ? Buffer.from(await input.body.arrayBuffer())
                : Buffer.alloc(input.byteSize);
      const url = `memory://blob/${encodeURIComponent(input.pathname)}`;
      objects.set(input.pathname, {
        body: buffer,
        contentType: input.contentType,
        url,
      });
      return {
        pathname: input.pathname,
        url,
        contentType: input.contentType,
        size: input.byteSize,
      };
    },
    async getPrivate(pathname) {
      const row = objects.get(pathname);
      if (!row) return null;
      return {
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(row.body));
            controller.close();
          },
        }),
        contentType: row.contentType,
        size: row.body.byteLength,
        contentDisposition: `attachment; filename="download"`,
      };
    },
    async deletePrivate(pathname) {
      objects.delete(pathname);
    },
  };
}
