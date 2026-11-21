// The record of a person's choices: for each optional purpose, the answer, its date, what the choice lets the App
// save and what is saved now. It is built from the choices stored on this device, the gate's rules and the App's
// own list of what it saves. Nothing is sent anywhere. An answer given under older wording does not count, so it is
// listed as asked again, with the date of the earlier answer.

import { consentStatus, type ConsentState, type Purpose } from "./consent";
import { ruleFor, type GateRule } from "./consentGate";
import type { Bilingual } from "./inventory";
import type { RegisterRow } from "./storageRegister";

export type ReceiptAnswer = "granted" | "declined" | "unknown" | "changed";

export interface ReceiptRow {
  id: string;
  label: Bilingual;
  description: Bilingual;
  answer: ReceiptAnswer;
  /** The date of the answer, or of the earlier answer that no longer counts. Absent when none was given. */
  decidedOn?: string;
  /** The wording version now in force */
  wordingVersion: number;
  /** What the choice lets the App save, from the App's own list. Null when no list was given. */
  covers: Bilingual[] | null;
  /** How many of the App's stored items are tied to this choice. */
  tied: number;
  /** How many stored items tied to this choice are on this device now */
  savedNow: number;
  /** True when saying no also removes what was saved */
  removesOnNo: boolean;
}

export interface ReceiptInput {
  purposes: readonly Purpose[];
  rules: readonly GateRule[];
  consent: ConsentState;
  /** The App's own list of what it saves. Without it, what a choice covers is not listed. */
  register?: readonly RegisterRow[];
  /** The names stored on this device now */
  keys: readonly string[];
  /** True when the controller removes what a purpose saved after a no */
  removesOnNo: boolean;
}

export function receiptRows(input: ReceiptInput): ReceiptRow[] {
  return input.purposes.map((p): ReceiptRow => {
    const status = consentStatus(input.consent, p);
    const record = input.consent[p.id];
    const mine = (key: string): boolean => ruleFor(input.rules, key)?.purposeId === p.id;
    const tiedRows = input.register === undefined ? null : input.register.filter((r) => mine(r.key));
    const answer: ReceiptAnswer = status.stale ? "changed" : status.value;
    const decidedOn = record === undefined ? undefined : record.decidedOn;
    return {
      id: p.id,
      label: p.label,
      description: p.description,
      answer,
      ...(decidedOn === undefined ? {} : { decidedOn }),
      wordingVersion: p.wordingVersion,
      covers: tiedRows === null ? null : tiedRows.map((r) => r.holds),
      tied: tiedRows === null ? input.rules.filter((r) => r.purposeId === p.id).length : tiedRows.length,
      savedNow: input.keys.filter(mine).length,
      removesOnNo: input.removesOnNo,
    };
  });
}

/** How many choices are not a current yes or no: not asked yet, or asked again. */
export function receiptOpen(rows: readonly ReceiptRow[]): number {
  return rows.reduce((n, r) => (r.answer === "unknown" || r.answer === "changed" ? n + 1 : n), 0);
}
