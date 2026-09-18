const U64_MAX = (1n << 64n) - 1n;
const U32_MAX = (1n << 32n) - 1n;

export function u64ToLeBytes(value: bigint): Uint8Array {
  if (value < 0n || value > U64_MAX) {
    throw new Error(`u64 out of range: ${value.toString()}`);
  }
  const out = new Uint8Array(8);
  const view = new DataView(out.buffer, out.byteOffset, 8);
  view.setBigUint64(0, value, true);
  return out;
}

export function u32ToLeBytes(value: number): Uint8Array {
  if (!Number.isInteger(value) || value < 0 || value > Number(U32_MAX)) {
    throw new Error(`u32 out of range: ${value}`);
  }
  const out = new Uint8Array(4);
  const view = new DataView(out.buffer, out.byteOffset, 4);
  view.setUint32(0, value, true);
  return out;
}

export function toHashArray(bytes: Uint8Array | number[]): number[] {
  const arr = bytes instanceof Uint8Array ? Array.from(bytes) : bytes;
  if (arr.length !== 32) {
    throw new Error(`hash must be 32 bytes, got ${arr.length}`);
  }
  for (const b of arr) {
    if (!Number.isInteger(b) || b < 0 || b > 255) {
      throw new Error("hash bytes must be 0..=255");
    }
  }
  return arr;
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
