/**
 * Lines up the records of one group, field by field, so a person can see what they agree on, where they
 * differ and what one of them lacks. It compares as written (names with accents and case folded only to
 * decide "same"), shows every value as the pack gives it, and never chooses between values or builds a
 * merged record.
 */
import { addressKeyOf } from "./duplicateScore";
import { distanceMetres } from "./packGeo";
import type { PackPlaceRecord } from "./packPlaces";
import { foldPlaceName } from "./placeNameKey";
import { foldAddressText } from "./streetAddress";
import { foldText } from "./suggest";

export const REPEAT_FIELDS = ["name", "address", "kind", "tag", "position", "source", "retrieved", "note"] as const;
export type RepeatField = (typeof REPEAT_FIELDS)[number];

export type FieldState =
  /** Every member gives a value and they are the same. */
  | "same"
  /** Members give different values. */
  | "differs"
  /** Some members give a value and some give none; those that do agree. */
  | "partial"
  /** No member gives a value. */
  | "none";

export interface FieldRow {
  readonly field: RepeatField;
  readonly state: FieldState;
  /** One entry per member, in the group's order: the value as the pack gives it, or null when it gives none. */
  readonly values: readonly (string | null)[];
}

export interface RepeatComparison {
  readonly ids: readonly string[];
  readonly rows: readonly FieldRow[];
  /** The fields on which members differ, in table order. */
  readonly differing: readonly RepeatField[];
  /** The greatest distance between two members with a position, in whole metres; null when fewer than two have one. */
  readonly spreadMetres: number | null;
}

/** The value of one field as shown, null when the pack gives none. */
export function fieldValue(p: PackPlaceRecord, field: RepeatField): string | null {
  switch (field) {
    case "name":
      return p.name;
    case "address":
      return p.address;
    case "kind":
      return p.category;
    case "tag":
      return p.tag === "unknown" ? null : p.tag;
    case "position":
      return p.location === null ? null : `${p.location.lat.toFixed(5)}, ${p.location.lon.toFixed(5)}`;
    case "source":
      return p.provenance?.source ?? null;
    case "retrieved":
      return p.provenance?.retrievedOn ?? null;
    case "note":
      return p.note;
  }
}

/** The key two values are compared by: what counts as "the same" depends on the field. */
export function compareKey(p: PackPlaceRecord, field: RepeatField): string | null {
  const v = fieldValue(p, field);
  if (v === null) return null;
  switch (field) {
    case "name": {
      const k = foldPlaceName(v);
      return k === "" ? null : k;
    }
    case "address":
      return addressKeyOf(v) ?? (foldAddressText(v) || null);
    case "kind":
      return foldAddressText(v) || null;
    case "position":
      // Positions within about a metre are the same position.
      return `${p.location!.lat.toFixed(5)}|${p.location!.lon.toFixed(5)}`;
    case "note":
      return foldText(v) || null;
    default:
      return v;
  }
}

export function stateOf(keys: readonly (string | null)[]): FieldState {
  const given = keys.filter((k): k is string => k !== null);
  if (given.length === 0) return "none";
  const distinct = new Set(given);
  if (distinct.size > 1) return "differs";
  return given.length === keys.length ? "same" : "partial";
}

/** Compare the members of one group. Ids the list does not hold are left out. */
export function compareRepeats(ids: readonly string[], places: readonly PackPlaceRecord[]): RepeatComparison {
  const map = new Map(places.map((p) => [p.id, p] as const));
  const members = ids.map((id) => map.get(id)).filter((p): p is PackPlaceRecord => p !== undefined);
  const rows: FieldRow[] = REPEAT_FIELDS.map((field) => ({
    field,
    state: stateOf(members.map((m) => compareKey(m, field))),
    values: members.map((m) => fieldValue(m, field)),
  }));
  const located = members.filter((m) => m.location !== null);
  let spread: number | null = null;
  if (located.length >= 2) {
    let max = 0;
    for (let i = 0; i < located.length; i += 1) for (let j = i + 1; j < located.length; j += 1) max = Math.max(max, distanceMetres(located[i]!.location!, located[j]!.location!));
    spread = Math.round(max);
  }
  return { ids: members.map((m) => m.id), rows, differing: rows.filter((r) => r.state === "differs").map((r) => r.field), spreadMetres: spread };
}
