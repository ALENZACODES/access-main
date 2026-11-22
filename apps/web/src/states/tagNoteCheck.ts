/**
 * Places whose wheelchair tag and note may point opposite ways. The tag is one OpenStreetMap value; the
 * note is free text. When they seem to disagree, either may be out of date, over-simple or about a
 * different part of the place. This only points at the pair of them, as written. It never says which is
 * right, never changes either, and says nothing about a place whose tag is limited or unknown, because a
 * tag that says "not fully" or "not known" has nothing for a note to contradict.
 */
import { countByDirection, scanSignals, type NoteSignal } from "./tagNoteSignals";
import type { PackPlaceRecord, WheelchairTag } from "./packPlaces";

export type DisagreementKind =
  /** The tag says yes or designated, and the note uses barrier words. */
  | "yes-but-barrier"
  /** The tag says no, and the note uses access words. */
  | "no-but-access";

export const DISAGREEMENT_KINDS: readonly DisagreementKind[] = ["yes-but-barrier", "no-but-access"];

/** How much of the note's wording leans one way. */
export type Weight =
  /** Only words pointing against the tag. */
  | "one-sided"
  /** Words pointing both ways: the note may be describing more than one part of the place. */
  | "mixed";

export interface Disagreement {
  readonly id: string;
  readonly name: string | null;
  readonly tag: WheelchairTag;
  readonly note: string;
  readonly kind: DisagreementKind;
  readonly weight: Weight;
  /** Every signal found in the note, in reading order. */
  readonly signals: readonly NoteSignal[];
  /** The signals that point against the tag. */
  readonly against: readonly NoteSignal[];
}

export interface PlaceStatus {
  readonly id: string;
  readonly state: "disagree" | "no-note" | "no-tag-to-check" | "no-signal" | "agree";
}

/** Check one place. Null when nothing points against its tag. */
export function checkPlace(p: PackPlaceRecord): Disagreement | null {
  if (p.note === null || p.note.trim() === "") return null;
  const yes = p.tag === "yes" || p.tag === "designated";
  const no = p.tag === "no";
  if (!yes && !no) return null;
  const signals = scanSignals(p.note);
  const against = signals.filter((s) => (yes ? s.direction === "barrier" : s.direction === "access"));
  if (against.length === 0) return null;
  const c = countByDirection(signals);
  const mixed = yes ? c.access > 0 : c.barrier > 0;
  return { id: p.id, name: p.name, tag: p.tag, note: p.note, kind: yes ? "yes-but-barrier" : "no-but-access", weight: mixed ? "mixed" : "one-sided", signals, against };
}

export interface TagNoteReport {
  readonly findings: readonly Disagreement[];
  readonly checked: number;
  readonly withoutNote: number;
  /** Places with a note whose tag is limited or unknown. */
  readonly noTagToCheck: number;
  readonly byKind: Readonly<Record<DisagreementKind, number>>;
  readonly oneSided: number;
  readonly mixed: number;
}

export function checkPlaces(places: readonly PackPlaceRecord[]): TagNoteReport {
  const findings: Disagreement[] = [];
  const byKind: Record<DisagreementKind, number> = { "yes-but-barrier": 0, "no-but-access": 0 };
  let withoutNote = 0;
  let noTagToCheck = 0;
  let checked = 0;
  for (const p of places) {
    if (p.note === null || p.note.trim() === "") {
      withoutNote += 1;
      continue;
    }
    if (p.tag !== "yes" && p.tag !== "designated" && p.tag !== "no") {
      noTagToCheck += 1;
      continue;
    }
    checked += 1;
    const d = checkPlace(p);
    if (d !== null) {
      findings.push(d);
      byKind[d.kind] += 1;
    }
  }
  const mixed = findings.filter((f) => f.weight === "mixed").length;
  return { findings, checked, withoutNote, noTagToCheck, byKind, oneSided: findings.length - mixed, mixed };
}

export type DisagreementFilter = "all" | DisagreementKind;
export const DISAGREEMENT_FILTERS: readonly DisagreementFilter[] = ["all", ...DISAGREEMENT_KINDS];
export const isDisagreementFilter = (v: unknown): v is DisagreementFilter => typeof v === "string" && (DISAGREEMENT_FILTERS as readonly string[]).includes(v);

export type DisagreementOrder = "one-sided-first" | "name" | "pack";
export const DISAGREEMENT_ORDERS: readonly DisagreementOrder[] = ["one-sided-first", "name", "pack"];
export const DEFAULT_DISAGREEMENT_ORDER: DisagreementOrder = "one-sided-first";
export const isDisagreementOrder = (v: unknown): v is DisagreementOrder => typeof v === "string" && (DISAGREEMENT_ORDERS as readonly string[]).includes(v);

export function filterFindings(findings: readonly Disagreement[], filter: DisagreementFilter): Disagreement[] {
  return filter === "all" ? [...findings] : findings.filter((f) => f.kind === filter);
}

const nameKey = (f: Disagreement): string => (f.name ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** A new list in the order asked for. Ties keep the pack's order; places with no name go last in name order. */
export function orderFindings(findings: readonly Disagreement[], order: DisagreementOrder): Disagreement[] {
  const indexed = findings.map((f, i) => ({ f, i }));
  if (order === "one-sided-first") indexed.sort((a, b) => (a.f.weight === "one-sided" ? 0 : 1) - (b.f.weight === "one-sided" ? 0 : 1) || a.i - b.i);
  else if (order === "name") indexed.sort((a, b) => (nameKey(a.f) === "" ? 1 : 0) - (nameKey(b.f) === "" ? 1 : 0) || nameKey(a.f).localeCompare(nameKey(b.f)) || a.i - b.i);
  return indexed.map((x) => x.f);
}
