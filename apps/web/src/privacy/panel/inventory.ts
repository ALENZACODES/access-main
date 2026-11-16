// The data inventory: what the App keeps, where, why, for how long, and where
// each statement came from. Nothing is assumed; a missing field is UNKNOWN.

import { lintCopy, type Locale } from "./copyLint";

export type Where = "on-device" | "sent-to-server" | "unknown";

export interface Bilingual {
  en: string;
  fr: string;
}

export interface InventoryEntry {
  /** lower-case letters, digits and hyphens */
  id: string;
  label: Bilingual;
  /** Omit when not confirmed: treated as unknown. */
  where?: Where;
  /** Why the App keeps it. Omit when not confirmed. */
  purpose?: Bilingual;
  /** How long it is kept. Omit when not confirmed. */
  keptFor?: Bilingual;
  /**
   * Storage names this entry uses, written without the App's key prefix. A name
   * ending in "*" matches every name that starts the same way. Omit if unknown:
   * the entry then cannot be matched against what is stored.
   */
  storageKeys?: readonly string[];
  /** Where this statement came from (a code review, a policy page...). Required. */
  source: Bilingual;
  /** Licence identifier, only if the statement comes from third-party material. */
  licence?: string;
  /** YYYY-MM-DD the statement was recorded. Required. */
  recordedOn: string;
}

export type ProblemCode =
  | "bad-id"
  | "duplicate-id"
  | "empty-text"
  | "bad-date"
  | "empty-licence"
  | "bad-storage-key"
  | "duplicate-storage-key"
  | "reserved-id"
  | "copy-lint";

export interface InventoryProblem {
  id: string;
  field: string;
  code: ProblemCode;
  detail?: string;
}

const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
/** Ids starting with this are reserved for the privacy panel's own entries. */
export const RESERVED_ID_PREFIX = "privacy-";
const KEY_RE = /^[A-Za-z0-9._:-]+\*?$/;

export function isValidKeyPattern(p: string): boolean {
  return KEY_RE.test(p);
}
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar date written YYYY-MM-DD. */
export function isIsoDate(s: string): boolean {
  const m = DATE_RE.exec(s);
  if (m === null) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

const LOCALES: readonly Locale[] = ["en", "fr"];

function checkText(
  out: InventoryProblem[],
  id: string,
  field: string,
  value: Bilingual | undefined,
  required: boolean,
): void {
  if (value === undefined) {
    if (required) out.push({ id, field, code: "empty-text" });
    return;
  }
  for (const loc of LOCALES) {
    const text = value[loc];
    if (typeof text !== "string" || text.trim() === "") {
      out.push({ id, field: `${field}.${loc}`, code: "empty-text" });
      continue;
    }
    for (const issue of lintCopy(loc, text)) {
      out.push({ id, field: `${field}.${loc}`, code: "copy-lint", detail: `${issue.code}: ${issue.message}` });
    }
  }
}

export interface ValidateOptions {
  /** Set when validating the panel's own entries, which may use the reserved id prefix. */
  allowReservedIds?: boolean;
}

export function validateInventory(
  entries: readonly InventoryEntry[],
  options: ValidateOptions = {},
): InventoryProblem[] {
  const out: InventoryProblem[] = [];
  const seen = new Set<string>();
  const keys = new Map<string, string>();
  for (const e of entries) {
    if (!ID_RE.test(e.id)) out.push({ id: e.id, field: "id", code: "bad-id" });
    if (!options.allowReservedIds && e.id.startsWith(RESERVED_ID_PREFIX)) {
      out.push({ id: e.id, field: "id", code: "reserved-id" });
    }
    for (const k of e.storageKeys ?? []) {
      if (!isValidKeyPattern(k)) out.push({ id: e.id, field: "storageKeys", code: "bad-storage-key", detail: k });
      else if (keys.has(k)) out.push({ id: e.id, field: "storageKeys", code: "duplicate-storage-key", detail: `${k} (also ${keys.get(k)})` });
      else keys.set(k, e.id);
    }
    if (seen.has(e.id)) out.push({ id: e.id, field: "id", code: "duplicate-id" });
    seen.add(e.id);
    checkText(out, e.id, "label", e.label, true);
    checkText(out, e.id, "purpose", e.purpose, false);
    checkText(out, e.id, "keptFor", e.keptFor, false);
    checkText(out, e.id, "source", e.source, true);
    if (!isIsoDate(e.recordedOn)) out.push({ id: e.id, field: "recordedOn", code: "bad-date" });
    if (e.licence !== undefined && e.licence.trim() === "") {
      out.push({ id: e.id, field: "licence", code: "empty-licence" });
    }
  }
  return out;
}

export function assertValidInventory(entries: readonly InventoryEntry[], options: ValidateOptions = {}): void {
  const problems = validateInventory(entries, options);
  if (problems.length > 0) {
    const lines = problems.map((p) => `${p.id}.${p.field}: ${p.code}${p.detail ? ` (${p.detail})` : ""}`);
    throw new Error(`Invalid privacy inventory:\n${lines.join("\n")}`);
  }
}

export function sortInventory(entries: readonly InventoryEntry[], locale: Locale): InventoryEntry[] {
  const collator = new Intl.Collator(locale, { sensitivity: "base" });
  return [...entries].sort((a, b) => collator.compare(a.label[locale], b.label[locale]));
}

export type InventorySummary = Record<Where, number> & { total: number };

export function summarizeInventory(entries: readonly InventoryEntry[]): InventorySummary {
  const s: InventorySummary = { "on-device": 0, "sent-to-server": 0, unknown: 0, total: entries.length };
  for (const e of entries) s[e.where ?? "unknown"] += 1;
  return s;
}
