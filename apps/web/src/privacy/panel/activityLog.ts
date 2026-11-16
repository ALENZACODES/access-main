// A short, visible log of what the person did on the privacy page. It lives
// only on this device, expires 90 days after the latest action, holds no
// contents of any data, and is removed when local data is erased.

import type { Locale } from "./copyLint";
import { getExpiring, putExpiring } from "./expiry";
import type { StorageLike } from "./storage";

export type ActivityKind =
  | "export"
  | "list-export"
  | "consent-granted"
  | "consent-declined"
  | "language"
  | "expired-removed"
  | "import"
  | "support-export"
  | "printable-export"
  | "protected-export"
  | "protected-import"
  | "device-clear";

export interface ActivityEntry {
  /** ISO date and time */
  at: string;
  kind: ActivityKind;
  purposeId?: string;
  count?: number;
  lang?: Locale;
  format?: "csv" | "text";
}

export const ACTIVITY_KEY_SUFFIX = "activity.v1";
export const ACTIVITY_TTL_DAYS = 90;
export const MAX_ACTIVITY_ENTRIES = 50;

const KINDS: readonly ActivityKind[] = [
  "export",
  "list-export",
  "consent-granted",
  "consent-declined",
  "language",
  "expired-removed",
  "import",
  "support-export",
  "printable-export",
  "protected-export",
  "protected-import",
  "device-clear",
];

export function activityKey(prefix: string): string {
  return `${prefix}${ACTIVITY_KEY_SUFFIX}`;
}

function isEntry(v: unknown): v is ActivityEntry {
  if (v === null || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (typeof o.at !== "string" || Number.isNaN(Date.parse(o.at))) return false;
  if (typeof o.kind !== "string" || !KINDS.includes(o.kind as ActivityKind)) return false;
  if (o.purposeId !== undefined && typeof o.purposeId !== "string") return false;
  if (o.count !== undefined && (typeof o.count !== "number" || !Number.isInteger(o.count) || o.count < 0)) return false;
  if (o.lang !== undefined && o.lang !== "en" && o.lang !== "fr") return false;
  if (o.format !== undefined && o.format !== "csv" && o.format !== "text") return false;
  return true;
}

/** Entries, newest first. Anything unreadable or expired gives an empty list. */
export function loadActivity(storage: StorageLike | null, prefix: string, now: Date): ActivityEntry[] {
  if (storage === null) return [];
  const r = getExpiring(storage, activityKey(prefix), now);
  if (r.state !== "fresh") return [];
  try {
    const v: unknown = JSON.parse(r.value);
    if (!Array.isArray(v)) return [];
    return v.filter(isEntry).slice(0, MAX_ACTIVITY_ENTRIES);
  } catch {
    return [];
  }
}

/** Adds an entry at the front, keeps the newest 50, and restarts the 90 day clock. */
export function recordActivity(
  storage: StorageLike | null,
  prefix: string,
  entry: Omit<ActivityEntry, "at">,
  now: Date,
): boolean {
  if (storage === null) return false;
  const next: ActivityEntry[] = [{ at: now.toISOString(), ...entry }, ...loadActivity(storage, prefix, now)].slice(
    0,
    MAX_ACTIVITY_ENTRIES,
  );
  return putExpiring(storage, activityKey(prefix), JSON.stringify(next), now, ACTIVITY_TTL_DAYS);
}

/** Local date and time, YYYY-MM-DD HH:MM. */
export function formatActivityTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
