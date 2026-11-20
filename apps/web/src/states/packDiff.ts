/**
 * What changed between a places file saved earlier and the pack stored now.
 *
 * Places are matched by id. A place only in the pack now is "added"; one only in the earlier file is
 * "removed" (the pack no longer lists it, which says nothing about whether the place still exists).
 * For places in both, each field that differs is listed with the earlier and the current value.
 * A value the pack does not state is the token UNKNOWN, and UNKNOWN to a value (or back) counts as a change.
 *
 * Nothing here says a change is good or bad, or that the place got better or worse.
 */
import type { EarlierPlace } from "./packEarlier";
import { distanceMetres } from "./packGeo";
import { type PackPlaceRecord, type WheelchairTag } from "./packPlaces";
import { UNKNOWN_TOKEN } from "./packExport";

export type ChangeField = "tag" | "name" | "kind" | "address" | "position" | "source" | "retrieved" | "tier";
export const CHANGE_FIELDS: readonly ChangeField[] = ["tag", "name", "kind", "address", "position", "source", "retrieved", "tier"];

export interface FieldChange {
  readonly field: ChangeField;
  readonly before: string;
  readonly after: string;
}

export interface ChangedPlace {
  readonly id: string;
  /** The name now, or the earlier one when the pack no longer gives a name. null when neither is known. */
  readonly name: string | null;
  readonly changes: readonly FieldChange[];
}

export interface PackDiff {
  readonly added: readonly PackPlaceRecord[];
  readonly removed: readonly EarlierPlace[];
  readonly changed: readonly ChangedPlace[];
  readonly unchanged: number;
  /** Places in the earlier file, and in the pack now. */
  readonly earlierCount: number;
  readonly currentCount: number;
  /** How many places changed in each field. */
  readonly byField: Readonly<Record<ChangeField, number>>;
}

export interface DiffOptions {
  /** A position counts as moved only when it differs by more than this. Default 5 m, so rounding is not a change. */
  readonly movedMetres?: number;
  /** The tier of each current place, by id (from the pack's provenance). Left out means tiers are not compared. */
  readonly tiers?: ReadonlyMap<string, string | null>;
}

export const DEFAULT_MOVED_METRES = 5;

const show = (value: string | null): string => (value === null || value === "" ? UNKNOWN_TOKEN : value);
const norm = (value: string | null): string => (value ?? "").normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();

function position(lat: number | null, lon: number | null): string {
  return lat === null || lon === null ? UNKNOWN_TOKEN : `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

function tagText(tag: WheelchairTag): string {
  return tag === "unknown" ? UNKNOWN_TOKEN : tag;
}

function emptyCounts(): Record<ChangeField, number> {
  return { tag: 0, name: 0, kind: 0, address: 0, position: 0, source: 0, retrieved: 0, tier: 0 };
}

/** The changes for one place present in both. Text is compared ignoring case and spacing, so a re-spacing is not a change. */
export function changesFor(before: EarlierPlace, now: PackPlaceRecord, options: DiffOptions = {}): FieldChange[] {
  const out: FieldChange[] = [];
  const push = (field: ChangeField, b: string, a: string) => out.push({ field, before: b, after: a });
  if (before.tag !== now.tag) push("tag", tagText(before.tag), tagText(now.tag));
  if (norm(before.name) !== norm(now.name)) push("name", show(before.name), show(now.name));
  if (norm(before.kind) !== norm(now.category)) push("kind", show(before.kind), show(now.category));
  if (norm(before.address) !== norm(now.address)) push("address", show(before.address), show(now.address));
  const beforeHas = before.lat !== null && before.lon !== null;
  const nowHas = now.location !== null;
  if (beforeHas !== nowHas) push("position", position(before.lat, before.lon), position(now.location?.lat ?? null, now.location?.lon ?? null));
  else if (beforeHas && nowHas) {
    const limit = options.movedMetres ?? DEFAULT_MOVED_METRES;
    const moved = distanceMetres({ lat: before.lat!, lon: before.lon! }, now.location!);
    if (moved > limit) push("position", position(before.lat, before.lon), position(now.location!.lat, now.location!.lon));
  }
  const nowSource = now.provenance?.source ?? null;
  if (norm(before.source) !== norm(nowSource)) push("source", show(before.source), show(nowSource));
  const nowRetrieved = now.provenance?.retrievedOn ?? null;
  if (before.retrievedOn !== nowRetrieved) push("retrieved", show(before.retrievedOn), show(nowRetrieved));
  if (options.tiers !== undefined) {
    const nowTier = options.tiers.get(now.id) ?? null;
    if (norm(before.tier) !== norm(nowTier)) push("tier", show(before.tier), show(nowTier));
  }
  return out;
}

export function diffPacks(earlier: readonly EarlierPlace[], current: readonly PackPlaceRecord[], options: DiffOptions = {}): PackDiff {
  const earlierById = new Map(earlier.map((p) => [p.id, p] as const));
  const currentIds = new Set(current.map((p) => p.id));
  const added = current.filter((p) => !earlierById.has(p.id)).sort(byId);
  const removed = earlier.filter((p) => !currentIds.has(p.id)).sort(byId);
  const changed: ChangedPlace[] = [];
  const byField = emptyCounts();
  let unchanged = 0;
  for (const now of [...current].sort(byId)) {
    const before = earlierById.get(now.id);
    if (before === undefined) continue;
    const changes = changesFor(before, now, options);
    if (changes.length === 0) {
      unchanged += 1;
      continue;
    }
    for (const c of changes) byField[c.field] += 1;
    changed.push({ id: now.id, name: now.name ?? before.name, changes });
  }
  return { added, removed, changed, unchanged, earlierCount: earlier.length, currentCount: current.length, byField };
}

function byId(a: { readonly id: string }, b: { readonly id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** True when nothing differs: no place added or removed and no field changed. */
export function isUnchanged(diff: PackDiff): boolean {
  return diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0;
}
