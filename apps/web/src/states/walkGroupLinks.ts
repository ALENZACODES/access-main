/**
 * Inside one group: which places link it together, and how each place sits among the others. A "link" is a place
 * that, if it were not on the list, would leave the rest of its group in two or more separate parts, because the
 * places on either side are further apart than the distance. A link is not better or worse than other places; it
 * only shows where a group is thin. Works on groups of up to MAX_LINK_MEMBERS places, where every pair can be compared.
 */
import { distanceMetres } from "./packGeo";
import type { PackPlaceRecord } from "./packPlaces";
import type { WalkGroup } from "./walkGroups";

export const MAX_LINK_MEMBERS = 400;

export interface Neighbour {
  readonly id: string;
  /** The nearest other member, or null for a group of one. */
  readonly nearestId: string | null;
  readonly nearestM: number | null;
  /** How many other members are within the distance. */
  readonly within: number;
}

export interface GroupLinks {
  /** Ids of places that hold two or more parts of the group together, in pack order. */
  readonly links: readonly string[];
  /** For each link, the sizes of the parts left when it is taken out, largest first. */
  readonly parts: Readonly<Record<string, readonly number[]>>;
  readonly neighbours: readonly Neighbour[];
  /** The two members closest to each other, or null when there is only one member. */
  readonly closestPair: { readonly a: string; readonly b: string; readonly metres: number } | null;
}

/** Null for a group too large to compare pair by pair. */
export function analyseGroup(group: Pick<WalkGroup, "members">, distanceM: number): GroupLinks | null {
  const m = group.members.filter((p): p is PackPlaceRecord & { location: NonNullable<PackPlaceRecord["location"]> } => p.location !== null);
  const n = m.length;
  if (n > MAX_LINK_MEMBERS) return null;
  const adj: number[][] = Array.from({ length: n }, () => []);
  const dist: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const d = distanceMetres(m[i]!.location, m[j]!.location);
      dist[i]![j] = d;
      dist[j]![i] = d;
      if (d <= distanceM) {
        adj[i]!.push(j);
        adj[j]!.push(i);
      }
    }
  }

  const neighbours: Neighbour[] = m.map((p, i) => {
    let best = -1;
    for (let j = 0; j < n; j += 1) if (j !== i && (best === -1 || dist[i]![j]! < dist[i]![best]!)) best = j;
    return { id: p.id, nearestId: best === -1 ? null : m[best]!.id, nearestM: best === -1 ? null : Math.round(dist[i]![best]!), within: adj[i]!.length };
  });

  let closestPair: GroupLinks["closestPair"] = null;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (closestPair === null || dist[i]![j]! < closestPair.metres) closestPair = { a: m[i]!.id, b: m[j]!.id, metres: dist[i]![j]! };
    }
  }
  if (closestPair) closestPair = { ...closestPair, metres: Math.round(closestPair.metres) };

  const links: string[] = [];
  const parts: Record<string, number[]> = {};
  for (let cut = 0; cut < n; cut += 1) {
    const sizes = componentSizes(adj, cut);
    if (sizes.length >= 2) {
      links.push(m[cut]!.id);
      parts[m[cut]!.id] = sizes.sort((a, b) => b - a);
    }
  }
  return { links, parts, neighbours, closestPair };
}

/** Sizes of the connected parts that remain when `removed` is taken out. */
function componentSizes(adj: readonly (readonly number[])[], removed: number): number[] {
  const n = adj.length;
  const seen = new Array<boolean>(n).fill(false);
  seen[removed] = true;
  const sizes: number[] = [];
  for (let s = 0; s < n; s += 1) {
    if (seen[s]) continue;
    let size = 0;
    const stack = [s];
    seen[s] = true;
    while (stack.length > 0) {
      const v = stack.pop()!;
      size += 1;
      for (const w of adj[v]!) {
        if (!seen[w]) {
          seen[w] = true;
          stack.push(w);
        }
      }
    }
    sizes.push(size);
  }
  return sizes;
}

/** The member furthest from its nearest neighbour: the one standing most apart in the group. Null for fewer than two. */
export function mostApart(links: GroupLinks): Neighbour | null {
  let best: Neighbour | null = null;
  for (const nb of links.neighbours) if (nb.nearestM !== null && (best === null || nb.nearestM > (best.nearestM ?? 0))) best = nb;
  return best;
}
