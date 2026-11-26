/**
 * A short name for a group of places, taken from the pack's own words: the street most of its places share, or
 * else the name of its first place. Never a neighbourhood or district: the pack does not say which one a place is in.
 */
import type { PackPlaceRecord } from "./packPlaces";
import { parseAddress } from "./streetAddress";
import type { WalkGroup } from "./walkGroups";

export type WalkGroupNameKind = "street" | "place" | "none";

export interface WalkGroupName {
  readonly kind: WalkGroupNameKind;
  /** The street as shown, the place's name, or null. */
  readonly text: string | null;
  /** How many of the group's places are on that street (street kind only). */
  readonly onStreet: number;
}

/** A street must hold at least this share of the group, and at least two places, to name it. */
export const STREET_SHARE = 0.5;

export function nameGroup(group: Pick<WalkGroup, "members">): WalkGroupName {
  const counts = new Map<string, { shown: string; n: number; first: number }>();
  group.members.forEach((m, i) => {
    const a = parseAddress(m.address);
    if (a.kind !== "street" || a.key === null || a.street === null) return;
    const c = counts.get(a.key);
    if (c) c.n += 1;
    else counts.set(a.key, { shown: a.street, n: 1, first: i });
  });
  let best: { shown: string; n: number; first: number } | null = null;
  for (const c of counts.values()) if (best === null || c.n > best.n || (c.n === best.n && c.first < best.first)) best = c;
  if (best !== null && best.n >= 2 && best.n / group.members.length >= STREET_SHARE) return { kind: "street", text: best.shown, onStreet: best.n };
  const named = group.members.find((m) => m.name !== null);
  if (named) return { kind: "place", text: named.name, onStreet: 0 };
  return { kind: "none", text: null, onStreet: 0 };
}

/** Members as they should be listed: by name without regard to case, places with no name last, then by id. */
export function membersByName(members: readonly PackPlaceRecord[]): PackPlaceRecord[] {
  return [...members].sort((a, b) => {
    if ((a.name === null) !== (b.name === null)) return a.name === null ? 1 : -1;
    const byName = (a.name ?? "").localeCompare(b.name ?? "", "en", { sensitivity: "base" });
    return byName !== 0 ? byName : a.id.localeCompare(b.id);
  });
}
