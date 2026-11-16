// A local record of refused requests: how many, to which host, and when last.
// Kept 30 days after the latest one; holds no paths, queries or contents.

import type { BlockedRequest, EgressPolicy, GuardHost, InstalledGuard } from "./egress";
import { installEgressGuard } from "./egress";
import { getExpiring, putExpiring } from "./expiry";
import type { StorageLike } from "./storage";

export const EGRESS_KEY_SUFFIX = "egress.v1";
export const EGRESS_TTL_DAYS = 30;
export const MAX_EGRESS_HOSTS = 50;

export interface BlockedSummary {
  host: string;
  count: number;
  lastAt: string;
}

export interface BlockedView {
  /** ISO date and time of the first refusal in the current record */
  since?: string;
  /** Most refused first, then by host name */
  hosts: BlockedSummary[];
}

interface Stored {
  since: string;
  hosts: Record<string, { count: number; lastAt: string }>;
}

export function egressKey(prefix: string): string {
  return `${prefix}${EGRESS_KEY_SUFFIX}`;
}

function read(storage: StorageLike, prefix: string, now: Date): Stored | null {
  const r = getExpiring(storage, egressKey(prefix), now);
  if (r.state !== "fresh") return null;
  try {
    const v: unknown = JSON.parse(r.value);
    if (v === null || typeof v !== "object") return null;
    const o = v as { since?: unknown; hosts?: unknown };
    if (typeof o.since !== "string" || Number.isNaN(Date.parse(o.since))) return null;
    if (o.hosts === null || typeof o.hosts !== "object") return null;
    const hosts: Stored["hosts"] = {};
    for (const [h, e] of Object.entries(o.hosts as Record<string, unknown>)) {
      const x = e as { count?: unknown; lastAt?: unknown } | null;
      if (x === null || typeof x !== "object") return null;
      if (typeof x.count !== "number" || !Number.isInteger(x.count) || x.count < 1) return null;
      if (typeof x.lastAt !== "string" || Number.isNaN(Date.parse(x.lastAt))) return null;
      hosts[h] = { count: x.count, lastAt: x.lastAt };
    }
    return { since: o.since, hosts };
  } catch {
    return null;
  }
}

export function loadBlocked(storage: StorageLike | null, prefix: string, now: Date): BlockedView {
  if (storage === null) return { hosts: [] };
  const s = read(storage, prefix, now);
  if (s === null) return { hosts: [] };
  const hosts = Object.entries(s.hosts)
    .map(([host, e]) => ({ host, count: e.count, lastAt: e.lastAt }))
    .sort((a, b) => b.count - a.count || a.host.localeCompare(b.host));
  return { since: s.since, hosts };
}

/** Counts one refusal. Keeps the 50 most recently refused hosts. Returns false if storage refused the write. */
export function recordBlocked(storage: StorageLike | null, prefix: string, b: BlockedRequest, now: Date): boolean {
  if (storage === null) return false;
  const cur = read(storage, prefix, now) ?? { since: b.at, hosts: {} };
  const host = b.host === "" ? "(invalid address)" : b.host;
  const prev = cur.hosts[host];
  cur.hosts[host] = { count: (prev?.count ?? 0) + 1, lastAt: b.at };
  const keep = Object.entries(cur.hosts)
    .sort((a, b2) => Date.parse(b2[1].lastAt) - Date.parse(a[1].lastAt))
    .slice(0, MAX_EGRESS_HOSTS);
  return putExpiring(storage, egressKey(prefix), JSON.stringify({ since: cur.since, hosts: Object.fromEntries(keep) }), now, EGRESS_TTL_DAYS);
}

/** Installs the guard and records each refusal on this device. */
export function installPersistentGuard(
  host: GuardHost,
  policy: EgressPolicy,
  storage: StorageLike | null,
  prefix: string,
  now: () => Date = () => new Date(),
): InstalledGuard {
  return installEgressGuard(host, policy, (b) => recordBlocked(storage, prefix, b, now()), now);
}
