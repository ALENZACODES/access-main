// Local data that expires. A value is stored in an envelope with its own
// expiry date; purgeExpired() removes only values that carry such an envelope.
// A value without one is never touched: its lifetime is unknown, not assumed.

import { listKeys } from "./localData";
import type { StorageLike } from "./storage";

export interface Envelope {
  v: string;
  savedAt: string;
  expiresAt: string;
}

export type ReadResult =
  | { state: "fresh"; value: string; expiresAt: string }
  | { state: "expired" }
  | { state: "missing" }
  | { state: "no-expiry"; raw: string };

export const MAX_TTL_DAYS = 3650;
const DAY_MS = 86_400_000;

function parseEnvelope(raw: string): Envelope | null {
  try {
    const v: unknown = JSON.parse(raw);
    if (v === null || typeof v !== "object") return null;
    const o = v as Record<string, unknown>;
    if (typeof o.v !== "string" || typeof o.savedAt !== "string" || typeof o.expiresAt !== "string") return null;
    if (Number.isNaN(Date.parse(o.savedAt)) || Number.isNaN(Date.parse(o.expiresAt))) return null;
    return { v: o.v, savedAt: o.savedAt, expiresAt: o.expiresAt };
  } catch {
    return null;
  }
}

/** Stores a value that expires `ttlDays` days from `now`. Returns false if storage refused it. */
export function putExpiring(
  storage: StorageLike,
  key: string,
  value: string,
  now: Date,
  ttlDays: number,
): boolean {
  if (!Number.isInteger(ttlDays) || ttlDays < 1 || ttlDays > MAX_TTL_DAYS) {
    throw new RangeError(`ttlDays must be a whole number from 1 to ${MAX_TTL_DAYS}`);
  }
  const env: Envelope = {
    v: value,
    savedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlDays * DAY_MS).toISOString(),
  };
  try {
    storage.setItem(key, JSON.stringify(env));
    return true;
  } catch {
    return false;
  }
}

export function isExpired(env: Envelope, now: Date): boolean {
  return Date.parse(env.expiresAt) <= now.getTime();
}

export function getExpiring(storage: StorageLike, key: string, now: Date): ReadResult {
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return { state: "missing" };
  }
  if (raw === null) return { state: "missing" };
  const env = parseEnvelope(raw);
  if (env === null) return { state: "no-expiry", raw };
  return isExpired(env, now)
    ? { state: "expired" }
    : { state: "fresh", value: env.v, expiresAt: env.expiresAt };
}

export interface PurgeResult {
  purged: string[];
  failed: string[];
}

/** Removes every expired envelope under `prefix`. Other values are left alone. */
export function purgeExpired(storage: StorageLike, prefix: string, now: Date): PurgeResult {
  const out: PurgeResult = { purged: [], failed: [] };
  for (const key of listKeys(storage, prefix)) {
    let raw: string | null;
    try {
      raw = storage.getItem(key);
    } catch {
      continue;
    }
    if (raw === null) continue;
    const env = parseEnvelope(raw);
    if (env === null || !isExpired(env, now)) continue;
    try {
      storage.removeItem(key);
      if (storage.getItem(key) === null) out.purged.push(key);
      else out.failed.push(key);
    } catch {
      out.failed.push(key);
    }
  }
  return out;
}
