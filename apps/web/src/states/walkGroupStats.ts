/** Counts and filters for the groups: how the list divides, which groups are worth a look, and in what order. */
import type { WheelchairTag } from "./packPlaces";
import { nameGroup } from "./walkGroupName";
import type { WalkGrouping, WalkGroup } from "./walkGroups";

export interface WalkGroupStats {
  readonly groups: number;
  /** Places in a group of two or more. */
  readonly grouped: number;
  readonly alone: number;
  readonly withoutPoint: number;
  readonly largest: number;
  /** Median group size, 0 when there are no groups. */
  readonly median: number;
  /** Share of the places with a point that sit in a group, whole percent. */
  readonly percentGrouped: number;
}

export function groupStats(g: WalkGrouping): WalkGroupStats {
  const sizes = g.groups.map((x) => x.members.length).sort((a, b) => a - b);
  const grouped = sizes.reduce((s, n) => s + n, 0);
  const located = grouped + g.alone;
  const mid = sizes.length >> 1;
  const median = sizes.length === 0 ? 0 : sizes.length % 2 ? sizes[mid]! : (sizes[mid - 1]! + sizes[mid]!) / 2;
  return {
    groups: sizes.length,
    grouped,
    alone: g.alone,
    withoutPoint: g.withoutPoint,
    largest: sizes.length === 0 ? 0 : sizes[sizes.length - 1]!,
    median,
    percentGrouped: located === 0 ? 0 : Math.min(100, Math.round((grouped / located) * 100)),
  };
}

export type WalkGroupFilter = "all" | "mixed" | "none-known" | "several-unknown" | "has-no-tag";
export const WALK_GROUP_FILTERS: readonly WalkGroupFilter[] = ["all", "mixed", "none-known", "several-unknown", "has-no-tag"];
export const isWalkGroupFilter = (v: unknown): v is WalkGroupFilter => typeof v === "string" && (WALK_GROUP_FILTERS as readonly string[]).includes(v);

const REPORTED: readonly WheelchairTag[] = ["yes", "limited", "no", "designated"];
/** How many different tags among yes, limited, no and designated a group has. */
export const reportedKinds = (g: Pick<WalkGroup, "tags">): number => REPORTED.filter((t) => g.tags[t] > 0).length;

/** Places in the group whose tag is UNKNOWN. */
export const unknownIn = (g: Pick<WalkGroup, "tags">): number => g.tags.unknown;

/**
 * "mixed": at least two different reported tags. "none-known": every place is UNKNOWN. "several-unknown": two or more places are UNKNOWN, so one visit could ask about several. "has-no-tag": at least
 * one place is tagged no. None of these says which place is best.
 */
export function matchesFilter(g: WalkGroup, f: WalkGroupFilter): boolean {
  switch (f) {
    case "all":
      return true;
    case "mixed":
      return reportedKinds(g) >= 2;
    case "none-known":
      return g.tags.unknown === g.members.length;
    case "several-unknown":
      return g.tags.unknown >= 2;
    case "has-no-tag":
      return g.tags.no > 0;
  }
}

export const filterGroups = (groups: readonly WalkGroup[], f: WalkGroupFilter): WalkGroup[] => groups.filter((g) => matchesFilter(g, f));

export type WalkGroupOrder = "size" | "tight" | "name" | "pack";
export const WALK_GROUP_ORDERS: readonly WalkGroupOrder[] = ["size", "tight", "name", "pack"];
export const DEFAULT_WALK_GROUP_ORDER: WalkGroupOrder = "size";
export const isWalkGroupOrder = (v: unknown): v is WalkGroupOrder => typeof v === "string" && (WALK_GROUP_ORDERS as readonly string[]).includes(v);

export function orderWalkGroups(groups: readonly WalkGroup[], order: WalkGroupOrder): WalkGroup[] {
  const out = [...groups];
  const label = (g: WalkGroup) => nameGroup(g).text ?? "";
  const byName = (a: WalkGroup, b: WalkGroup) => {
    const la = label(a);
    const lb = label(b);
    if ((la === "") !== (lb === "")) return la === "" ? 1 : -1;
    return la.localeCompare(lb, "en", { sensitivity: "base" }) || a.id.localeCompare(b.id);
  };
  if (order === "pack") return out;
  if (order === "name") return out.sort(byName);
  if (order === "tight") return out.sort((a, b) => a.spreadM - b.spreadM || b.members.length - a.members.length || byName(a, b));
  return out.sort((a, b) => b.members.length - a.members.length || a.spreadM - b.spreadM || byName(a, b));
}
