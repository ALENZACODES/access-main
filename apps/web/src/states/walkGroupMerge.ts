/**
 * What happens to the groups as the distance grows: which groups at one distance join into which group at the
 * next. Lets a reader see, for the group they are looking at, that a longer distance would bring in other groups.
 * Pure comparison of two groupings; nothing is measured again.
 */
import type { WalkGroup, WalkGrouping } from "./walkGroups";

export interface GroupGrowth {
  /** The group at the shorter distance. */
  readonly id: string;
  /** The group at the longer distance that holds it. */
  readonly intoId: string;
  /** Places added to it at the longer distance (including whole other groups and places that were alone). */
  readonly gained: number;
  /** Other shorter-distance groups that end up in the same longer-distance group. */
  readonly joinedGroups: number;
}

/** For each group of `shorter`, the group of `longer` that holds it. Null for a group that has no home (the lists differ). */
export function growthBetween(shorter: WalkGrouping, longer: WalkGrouping): GroupGrowth[] {
  const home = new Map<string, WalkGroup>();
  for (const g of longer.groups) for (const m of g.members) home.set(m.id, g);
  const sharing = new Map<string, number>();
  const intoOf = new Map<string, WalkGroup>();
  for (const g of shorter.groups) {
    const target = home.get(g.members[0]!.id);
    if (!target) continue;
    intoOf.set(g.id, target);
    sharing.set(target.id, (sharing.get(target.id) ?? 0) + 1);
  }
  const out: GroupGrowth[] = [];
  for (const g of shorter.groups) {
    const target = intoOf.get(g.id);
    if (!target) continue;
    out.push({ id: g.id, intoId: target.id, gained: target.members.length - g.members.length, joinedGroups: (sharing.get(target.id) ?? 1) - 1 });
  }
  return out;
}

/** Groups at the longer distance that hold no group of the shorter one: places that were alone and now group. */
export function newGroupsAt(shorter: WalkGrouping, longer: WalkGrouping): WalkGroup[] {
  const grouped = new Set<string>();
  for (const g of shorter.groups) for (const m of g.members) grouped.add(m.id);
  return longer.groups.filter((g) => !g.members.some((m) => grouped.has(m.id)));
}

/** True when growing the distance only enlarged groups: none merged and none was new. */
export function onlyEnlarged(shorter: WalkGrouping, longer: WalkGrouping): boolean {
  return growthBetween(shorter, longer).every((x) => x.joinedGroups === 0) && newGroupsAt(shorter, longer).length === 0;
}
