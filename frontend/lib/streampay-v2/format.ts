const U64_MAX = (1n << 64n) - 1n;

function assertDecimals(decimals: number): void {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new Error(`unsupported mint decimals: ${decimals}`);
  }
}

/**
 * Convert a UI decimal string into token base units.
 * Rejects negatives, empty input, extra dots, non-digits, and
 * fractional precision beyond `decimals`. Never uses floating point.
 */
export function uiAmountToBaseUnits(uiAmount: string, decimals: number): bigint {
  assertDecimals(decimals);
  const trimmed = uiAmount.trim();
  if (trimmed.length === 0) {
    throw new Error("amount is empty");
  }
  if (trimmed.startsWith("-") || trimmed.startsWith("+")) {
    throw new Error("amount must be a non-negative decimal");
  }
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`invalid decimal amount: ${uiAmount}`);
  }
  const [wholeRaw, fracRaw = ""] = trimmed.split(".");
  if (fracRaw.length > decimals) {
    throw new Error(
      `amount has ${fracRaw.length} fractional digits; mint allows ${decimals}`
    );
  }
  const whole = wholeRaw.replace(/^0+(?=\d)/, "") || "0";
  const frac = fracRaw.padEnd(decimals, "0");
  const combined = decimals === 0 ? whole : `${whole}${frac}`;
  const result = BigInt(combined);
  if (result > U64_MAX) {
    throw new Error("amount exceeds u64 base-unit maximum");
  }
  return result;
}

/**
 * Convert token base units to a UI decimal string. Exact, no float rounding.
 */
export function baseUnitsToUiAmount(baseUnits: bigint, decimals: number): string {
  assertDecimals(decimals);
  if (baseUnits < 0n) {
    throw new Error("negative base units");
  }
  if (baseUnits > U64_MAX) {
    throw new Error("base units exceed u64");
  }
  if (decimals === 0) {
    return baseUnits.toString(10);
  }
  const scale = 10n ** BigInt(decimals);
  const whole = baseUnits / scale;
  const frac = baseUnits % scale;
  const fracStr = frac.toString(10).padStart(decimals, "0").replace(/0+$/, "");
  return fracStr.length === 0 ? whole.toString(10) : `${whole.toString(10)}.${fracStr}`;
}

export function requireU64(amount: bigint, label = "amount"): bigint {
  if (amount < 0n) {
    throw new Error(`${label} must not be negative`);
  }
  if (amount > U64_MAX) {
    throw new Error(`${label} exceeds u64`);
  }
  return amount;
}

/**
 * Convert a JS Date (UTC instant) to the Unix seconds the program expects.
 * Uses floor division; milliseconds are never sent on-chain.
 */
export function dateToUnixSeconds(date: Date): number {
  if (Number.isNaN(date.getTime())) {
    throw new Error("invalid Date");
  }
  return Math.floor(date.getTime() / 1000);
}

/**
 * Convert program Unix seconds to a Date representing that UTC instant.
 */
export function unixSecondsToUtcDate(seconds: number): Date {
  if (!Number.isFinite(seconds) || !Number.isInteger(seconds)) {
    throw new Error("unix seconds must be an integer");
  }
  return new Date(seconds * 1000);
}

/**
 * Parse an ISO-8601 timestamp that includes a timezone (`Z` or ±hh:mm).
 * Naive strings are rejected so local vs UTC cannot be implicit.
 */
export function utcIsoToUnixSeconds(iso: string): number {
  const trimmed = iso.trim();
  if (!/([zZ]|[+-]\d{2}:\d{2})$/.test(trimmed)) {
    throw new Error(
      "ISO timestamp must include a timezone (Z or ±hh:mm); use localDateTimeInputToUnixSeconds for naive local input"
    );
  }
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) {
    throw new Error(`invalid ISO timestamp: ${iso}`);
  }
  return Math.floor(ms / 1000);
}

/**
 * Parse a `datetime-local` value as the user's local timezone, then convert
 * to Unix seconds. The local interpretation is explicit at this boundary.
 */
export function localDateTimeInputToUnixSeconds(localDateTime: string): number {
  const trimmed = localDateTime.trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
    throw new Error(
      "expected local datetime-local input YYYY-MM-DDTHH:mm[:ss]"
    );
  }
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`invalid local datetime: ${localDateTime}`);
  }
  return Math.floor(date.getTime() / 1000);
}

export function nowUnixSeconds(now: Date = new Date()): number {
  return dateToUnixSeconds(now);
}
