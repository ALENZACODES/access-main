// Checks what is stored on this device right now against the limits in the
// retention register. The register says what the code sets; this says whether
// the stored values agree. A stored value the check cannot read is reported as
// unreadable, never as fine.

import { parseEnvelope, type Envelope } from "./expiry";
import { limitOf, type RetentionRow } from "./retentionRegister";
import type { StorageLike } from "./storage";
import type { Locale } from "./copyLint";

const DAY_MS = 86_400_000;
/** A saved time may differ from the expiry by this much before it counts as a different number of days. */
const SLACK_MS = 60_000;

export type LiveCode =
  | "past-expiry"
  | "longer-than-listed"
  | "no-end-date"
  | "over-count"
  | "unreadable";

export interface LiveFinding {
  code: LiveCode;
  key: string;
  /** Plain numbers behind the finding, for the message. */
  detail: { listed?: number; found?: number };
}

/** How many things a stored value holds: the length of a list, or the number of addresses in a `hosts` object. Null when it is neither. */
export function countItems(value: string): number | null {
  let v: unknown;
  try {
    v = JSON.parse(value);
  } catch {
    return null;
  }
  if (Array.isArray(v)) return v.length;
  if (v !== null && typeof v === "object") {
    const hosts = (v as Record<string, unknown>).hosts;
    if (hosts !== null && typeof hosts === "object" && !Array.isArray(hosts)) return Object.keys(hosts as object).length;
  }
  return null;
}

/** The whole days between saving and expiry, rounded to the nearest day. */
export function lifetimeDays(env: Pick<Envelope, "savedAt" | "expiresAt">): number {
  return Math.round((Date.parse(env.expiresAt) - Date.parse(env.savedAt)) / DAY_MS);
}

function readRaw(storage: StorageLike, key: string): { ok: true; raw: string | null } | { ok: false } {
  try {
    return { ok: true, raw: storage.getItem(key) };
  } catch {
    return { ok: false };
  }
}

/**
 * Findings for one row. A row with UNKNOWN limits, a row with no limits and a
 * value that is not stored give none: there is nothing listed to disagree with.
 */
export function checkRow(storage: StorageLike, row: RetentionRow, now: Date): LiveFinding[] {
  if (row.limits === "UNKNOWN") return [];
  const days = limitOf(row, "days");
  const count = limitOf(row, "count");
  if (days === undefined && count === undefined) return [];
  const got = readRaw(storage, row.key);
  if (!got.ok) return [{ code: "unreadable", key: row.key, detail: {} }];
  if (got.raw === null) return [];
  const out: LiveFinding[] = [];
  const env = parseEnvelope(got.raw);
  let body = got.raw;
  if (days !== undefined) {
    if (env === null) {
      out.push({ code: "no-end-date", key: row.key, detail: { listed: days.days } });
    } else {
      body = env.v;
      if (Date.parse(env.expiresAt) <= now.getTime()) out.push({ code: "past-expiry", key: row.key, detail: { listed: days.days } });
      const found = lifetimeDays(env);
      if (found > days.days || Date.parse(env.expiresAt) - Date.parse(env.savedAt) > days.days * DAY_MS + SLACK_MS) {
        out.push({ code: "longer-than-listed", key: row.key, detail: { listed: days.days, found } });
      }
    }
  } else if (env !== null) {
    body = env.v;
  }
  if (count !== undefined) {
    const n = countItems(body);
    if (n === null) out.push({ code: "unreadable", key: row.key, detail: {} });
    else if (n > count.max) out.push({ code: "over-count", key: row.key, detail: { listed: count.max, found: n } });
  }
  return out;
}

/** Findings for every row, in the order of the rows. */
export function checkStored(storage: StorageLike, rows: readonly RetentionRow[], now: Date): LiveFinding[] {
  return rows.flatMap((r) => checkRow(storage, r, now));
}

const TEXT: Record<Locale, Record<LiveCode, (f: LiveFinding) => string>> = {
  en: {
    "past-expiry": (f) => `${f.key}: still stored after its end date.`,
    "longer-than-listed": (f) => `${f.key}: its end date is ${f.detail.found} days after saving, but the list says ${f.detail.listed}.`,
    "no-end-date": (f) => `${f.key}: stored with no end date, but the list says ${f.detail.listed} days.`,
    "over-count": (f) => `${f.key}: holds ${f.detail.found} items, but the list says up to ${f.detail.listed}.`,
    unreadable: (f) => `${f.key}: could not be read, so it was not compared.`,
  },
  fr: {
    "past-expiry": (f) => `${f.key}\u00a0: toujours conservé après sa date de fin.`,
    "longer-than-listed": (f) => `${f.key}\u00a0: sa date de fin est ${f.detail.found} jours après l’enregistrement, mais la liste indique ${f.detail.listed}.`,
    "no-end-date": (f) => `${f.key}\u00a0: conservé sans date de fin, alors que la liste indique ${f.detail.listed} jours.`,
    "over-count": (f) => `${f.key}\u00a0: contient ${f.detail.found} éléments, mais la liste indique jusqu’à ${f.detail.listed}.`,
    unreadable: (f) => `${f.key}\u00a0: n’a pas pu être lu, donc n’a pas été comparé.`,
  },
};

export function liveFindingText(locale: Locale, f: LiveFinding): string {
  return TEXT[locale][f.code](f);
}

/** One sentence for the whole check: what was compared and what was found. */
export function liveSummary(locale: Locale, compared: number, differences: number): string {
  const when: Record<Locale, string> = {
    en: `Compared ${compared} stored ${compared === 1 ? "item" : "items"} with the list. ${differences === 0 ? "No differences found." : `${differences} ${differences === 1 ? "difference" : "differences"} found.`}`,
    fr: `${compared} ${compared <= 1 ? "élément conservé comparé" : "éléments conservés comparés"} à la liste. ${differences === 0 ? "Aucune différence trouvée." : `${differences} ${differences <= 1 ? "différence trouvée" : "différences trouvées"}.`}`,
  };
  return when[locale];
}

/** How many rows had a stored value to compare. */
export function comparedCount(storage: StorageLike, rows: readonly RetentionRow[]): number {
  let n = 0;
  for (const r of rows) {
    if (r.limits === "UNKNOWN" || r.limits.length === 0) continue;
    const got = readRaw(storage, r.key);
    if (got.ok && got.raw !== null) n += 1;
  }
  return n;
}
