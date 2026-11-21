// Optional features, off until the person decides. A choice is stored only on
// this device, with its date and the version of the wording it was made under.
// If the wording changes, the old choice no longer counts and the state goes
// back to unknown: the person is asked again.

import { lintCopy } from "./copyLint";
import type { Bilingual } from "./inventory";
import type { StorageLike } from "./storage";

export interface Purpose {
  /** lower-case letters, digits and hyphens */
  id: string;
  label: Bilingual;
  description: Bilingual;
  /** Whole number. Raise it whenever label or description changes in meaning. */
  wordingVersion: number;
}

export type ConsentValue = "granted" | "declined" | "unknown";

export interface ConsentRecord {
  value: "granted" | "declined";
  /** YYYY-MM-DD */
  decidedOn: string;
  wordingVersion: number;
}

export type ConsentState = Readonly<Record<string, ConsentRecord>>;

export interface ConsentStatus {
  value: ConsentValue;
  decidedOn?: string;
  /** true when a choice exists but was made under older wording */
  stale: boolean;
}

export const CONSENT_KEY_SUFFIX = "consent.v1";
const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function consentKey(prefix: string): string {
  return `${prefix}${CONSENT_KEY_SUFFIX}`;
}

export function consentStatus(state: ConsentState, purpose: Purpose): ConsentStatus {
  const r = state[purpose.id];
  if (r === undefined) return { value: "unknown", stale: false };
  if (r.wordingVersion !== purpose.wordingVersion) return { value: "unknown", stale: true };
  return { value: r.value, decidedOn: r.decidedOn, stale: false };
}

/** The only question feature code should ask. Anything but a current "granted" is no. */
export function isAllowed(state: ConsentState, purpose: Purpose): boolean {
  return consentStatus(state, purpose).value === "granted";
}

function localDate(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function setConsent(
  state: ConsentState,
  purpose: Purpose,
  value: "granted" | "declined",
  now: Date,
): ConsentState {
  return {
    ...state,
    [purpose.id]: { value, decidedOn: localDate(now), wordingVersion: purpose.wordingVersion },
  };
}

export function clearConsent(state: ConsentState, id: string): ConsentState {
  const { [id]: removed, ...rest } = state;
  void removed;
  return rest;
}

export type PurposeProblemCode = "bad-id" | "duplicate-id" | "bad-version" | "empty-text" | "copy-lint";

export interface PurposeProblem {
  id: string;
  field: string;
  code: PurposeProblemCode;
  detail?: string;
}

export function validatePurposes(purposes: readonly Purpose[]): PurposeProblem[] {
  const out: PurposeProblem[] = [];
  const seen = new Set<string>();
  for (const p of purposes) {
    if (!ID_RE.test(p.id)) out.push({ id: p.id, field: "id", code: "bad-id" });
    if (seen.has(p.id)) out.push({ id: p.id, field: "id", code: "duplicate-id" });
    seen.add(p.id);
    if (!Number.isInteger(p.wordingVersion) || p.wordingVersion < 1) {
      out.push({ id: p.id, field: "wordingVersion", code: "bad-version" });
    }
    for (const field of ["label", "description"] as const) {
      for (const loc of ["en", "fr"] as const) {
        const text = p[field][loc];
        if (typeof text !== "string" || text.trim() === "") {
          out.push({ id: p.id, field: `${field}.${loc}`, code: "empty-text" });
          continue;
        }
        for (const i of lintCopy(loc, text)) {
          out.push({ id: p.id, field: `${field}.${loc}`, code: "copy-lint", detail: `${i.code}: ${i.message}` });
        }
      }
    }
  }
  return out;
}

export function assertValidPurposes(purposes: readonly Purpose[]): void {
  const problems = validatePurposes(purposes);
  if (problems.length > 0) {
    const lines = problems.map((p) => `${p.id}.${p.field}: ${p.code}${p.detail ? ` (${p.detail})` : ""}`);
    throw new Error(`Invalid consent purposes:\n${lines.join("\n")}`);
  }
}

function isRecord(v: unknown): v is ConsentRecord {
  if (v === null || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    (o.value === "granted" || o.value === "declined") &&
    typeof o.decidedOn === "string" &&
    DATE_RE.test(o.decidedOn) &&
    typeof o.wordingVersion === "number" &&
    Number.isInteger(o.wordingVersion)
  );
}

/** Stored choices for the given purposes. Unreadable or unknown entries are dropped. */
export function loadConsent(
  storage: StorageLike | null,
  prefix: string,
  purposes: readonly Purpose[],
): ConsentState {
  if (storage === null) return {};
  try {
    const raw = storage.getItem(consentKey(prefix));
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") return {};
    const records = (parsed as { records?: unknown }).records;
    if (records === null || typeof records !== "object") return {};
    const out: Record<string, ConsentRecord> = {};
    for (const p of purposes) {
      const r = (records as Record<string, unknown>)[p.id];
      if (isRecord(r)) out[p.id] = { value: r.value, decidedOn: r.decidedOn, wordingVersion: r.wordingVersion };
    }
    return out;
  } catch {
    return {};
  }
}

/** Returns false when the choices could not be stored. */
export function saveConsent(storage: StorageLike | null, prefix: string, state: ConsentState): boolean {
  if (storage === null) return false;
  try {
    storage.setItem(consentKey(prefix), JSON.stringify({ records: state }));
    return true;
  } catch {
    return false;
  }
}
