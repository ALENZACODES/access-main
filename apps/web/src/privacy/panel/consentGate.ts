// A storage wrapper that refuses to save under a key unless the person has agreed to the
// purpose that key belongs to. Reading and removing are never blocked: a person can always
// see and delete what is on their device. The gate keeps only a count and the key names of
// refused writes (never values), so the panel can say what was not saved.

import { isAllowed, type ConsentState, type Purpose } from "./consent";
import type { StorageLike } from "./storage";

export interface GateRule {
  /** The purpose that must be agreed to before this key is written */
  purposeId: string;
  /** Exact key, or a prefix when `prefix` is true */
  key: string;
  prefix?: boolean;
}

export interface RefusedWrite {
  key: string;
  purposeId: string;
  /** "no-choice": the person has not decided (or the wording changed); "declined": they said no */
  reason: "no-choice" | "declined";
}

export interface GatedStorage extends StorageLike {
  /** Refused writes since the gate was made, newest last. Key names only. */
  refused(): readonly RefusedWrite[];
  /** Forget the refused list (after the panel has shown it). */
  clearRefused(): void;
}

export type GateProblemCode = "unknown-purpose" | "empty-key" | "duplicate-rule" | "overlap";

export interface GateProblem {
  code: GateProblemCode;
  where: string;
}

/** Problems in a rule list, so a typo cannot quietly leave a key ungated. */
export function validateRules(rules: readonly GateRule[], purposes: readonly Purpose[]): GateProblem[] {
  const out: GateProblem[] = [];
  const ids = new Set(purposes.map((p) => p.id));
  const seen = new Set<string>();
  rules.forEach((r, i) => {
    const where = `rules[${i}]`;
    if (r.key === "") out.push({ code: "empty-key", where });
    if (!ids.has(r.purposeId)) out.push({ code: "unknown-purpose", where });
    const sig = `${r.prefix === true ? "p" : "e"}:${r.key}`;
    if (seen.has(sig)) out.push({ code: "duplicate-rule", where });
    seen.add(sig);
  });
  rules.forEach((a, i) => {
    rules.forEach((b, j) => {
      if (i < j && a.purposeId !== b.purposeId && matches(a, b.key)) out.push({ code: "overlap", where: `rules[${i}]/rules[${j}]` });
    });
  });
  return out;
}

function matches(rule: GateRule, key: string): boolean {
  return rule.prefix === true ? key.startsWith(rule.key) : key === rule.key;
}

/** The rule for a key. An exact rule beats a prefix rule; the longest prefix wins. */
export function ruleFor(rules: readonly GateRule[], key: string): GateRule | undefined {
  const exact = rules.find((r) => r.prefix !== true && r.key === key);
  if (exact !== undefined) return exact;
  let best: GateRule | undefined;
  for (const r of rules) {
    if (r.prefix === true && key.startsWith(r.key) && (best === undefined || r.key.length > best.key.length)) best = r;
  }
  return best;
}

/**
 * Wraps a storage. `state` is read on every write, so a choice made a moment ago counts.
 * Keys with no rule are written as before. A key whose purpose is missing from `purposes`
 * is refused (the safe answer).
 */
export function gateStorage(
  inner: StorageLike,
  state: () => ConsentState,
  purposes: readonly Purpose[],
  rules: readonly GateRule[],
): GatedStorage {
  const byId = new Map(purposes.map((p) => [p.id, p]));
  let refused: RefusedWrite[] = [];
  return {
    get length() {
      return inner.length;
    },
    key: (i) => inner.key(i),
    getItem: (k) => inner.getItem(k),
    removeItem: (k) => inner.removeItem(k),
    setItem(k, v) {
      const rule = ruleFor(rules, k);
      if (rule === undefined) {
        inner.setItem(k, v);
        return;
      }
      const purpose = byId.get(rule.purposeId);
      const current = state();
      if (purpose !== undefined && isAllowed(current, purpose)) {
        inner.setItem(k, v);
        return;
      }
      const declined = current[rule.purposeId]?.value === "declined" && current[rule.purposeId]?.wordingVersion === purpose?.wordingVersion;
      refused = [...refused, { key: k, purposeId: rule.purposeId, reason: declined ? "declined" : "no-choice" }];
    },
    refused: () => refused,
    clearRefused() {
      refused = [];
    },
  };
}

/** Removes what a purpose saved, for when the person withdraws their agreement. Returns the keys removed. */
export function removeForPurpose(storage: StorageLike, rules: readonly GateRule[], purposeId: string): string[] {
  const mine = rules.filter((r) => r.purposeId === purposeId);
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const k = storage.key(i);
    if (k !== null && mine.some((r) => matches(r, k)) && ruleFor(rules, k)?.purposeId === purposeId) keys.push(k);
  }
  keys.forEach((k) => storage.removeItem(k));
  return keys;
}
