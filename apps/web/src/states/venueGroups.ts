/**
 * The listed places grouped into venues by their names: a main place with its entrance, elevator,
 * parking and so on, when the names say so. Two places are put together only when their base names are
 * the same and, if both have a map point, they are close. A place with no map point is joined only when
 * the name leaves one possible venue, and then it says so. Nothing here says that an entrance leads to
 * the place, how to get between the parts, or that one part's tag applies to another.
 */
import { distanceMetres, formatPackDistance, isPoint, type Point } from "./packGeo";
import type { PackPlaceRecord, WheelchairTag } from "./packPlaces";
import { tagValue } from "./placeSheet";
import type { Locale } from "./stateCopy";
import { t } from "./typography";
import { PART_KINDS, type PartKind, foldVenueName, readName, venueDisplayBase, venuePartLabel } from "./venueName";

/** Parts of one venue are within this many metres of each other when both have a map point. */
export const VENUE_RADIUS_METRES = 200;

export interface VenueMember {
  readonly id: string;
  readonly name: string | null;
  readonly kind: PartKind;
  readonly tag: WheelchairTag;
  /** Straight-line metres from the first member, or null when either has no map point. */
  readonly metres: number | null;
  /** True for the first member of the group, which the other distances are measured from. */
  readonly first: boolean;
  /** "map" when the map point put it here, "name" when only the name did. */
  readonly basis: "map" | "name";
}

export interface VenueGroup {
  readonly key: string;
  readonly label: string;
  readonly members: readonly VenueMember[];
  readonly tagCounts: Readonly<Record<WheelchairTag, number>>;
  /** True when the members do not all have the same tag (UNKNOWN counts as a tag here). */
  readonly tagsDiffer: boolean;
  /** The largest straight-line distance between two members that both have a map point, or null with fewer than two. */
  readonly spanMetres: number | null;
}

export interface ApartName {
  readonly key: string;
  readonly label: string;
  readonly places: number;
  /** The smallest straight-line distance between two of the separate places. */
  readonly nearestMetres: number;
}

export interface VenueData {
  readonly groups: readonly VenueGroup[];
  /** Names that are the same but whose places are too far apart to be one venue. */
  readonly apart: readonly ApartName[];
  /** Places named like a venue that has more than one possible place, and no map point to choose with. */
  readonly unplacedIds: readonly string[];
  readonly placeCount: number;
  readonly grouped: number;
}

const ZERO: Readonly<Record<WheelchairTag, number>> = { yes: 0, limited: 0, no: 0, designated: 0, unknown: 0 };
const KIND_ORDER = new Map(PART_KINDS.map((k, i) => [k, i] as const));

interface Item {
  readonly place: PackPlaceRecord;
  readonly kind: PartKind;
  readonly point: Point | null;
}

/** Single-link clusters of the located items: two items are in one cluster when a chain of steps of at most the radius joins them. */
function cluster(items: readonly Item[]): Item[][] {
  const parent = items.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (distanceMetres(items[i]!.point!, items[j]!.point!) <= VENUE_RADIUS_METRES) parent[find(i)] = find(j);
    }
  }
  const out = new Map<number, Item[]>();
  items.forEach((it, i) => {
    const r = find(i);
    out.set(r, [...(out.get(r) ?? []), it]);
  });
  return [...out.values()];
}

function memberOrder(a: Item, b: Item): number {
  const k = (KIND_ORDER.get(a.kind) ?? 0) - (KIND_ORDER.get(b.kind) ?? 0);
  if (k !== 0) return k;
  const an = a.place.name ?? "";
  const bn = b.place.name ?? "";
  if (an !== bn) return an < bn ? -1 : 1;
  return a.place.id < b.place.id ? -1 : a.place.id > b.place.id ? 1 : 0;
}

function groupOf(key: string, members: Item[], nameOnly: ReadonlySet<string>): VenueGroup {
  const sorted = [...members].sort(memberOrder);
  const first = sorted[0]!;
  const tagCounts = { ...ZERO };
  for (const m of sorted) tagCounts[m.place.tag] += 1;
  const located = sorted.filter((m) => m.point !== null);
  let span: number | null = null;
  for (let i = 0; i < located.length; i++) for (let j = i + 1; j < located.length; j++) span = Math.max(span ?? 0, distanceMetres(located[i]!.point!, located[j]!.point!));
  return {
    key,
    label: first.place.name !== null && first.kind === "main" ? first.place.name : (venueDisplayBase(first.place.name) ?? titleOf(key)),
    members: sorted.map((m, i) => ({
      id: m.place.id,
      name: m.place.name,
      kind: m.kind,
      tag: m.place.tag,
      first: i === 0,
      metres: i === 0 || m.point === null || first.point === null ? null : distanceMetres(first.point, m.point),
      basis: nameOnly.has(m.place.id) ? "name" : "map",
    })),
    tagCounts,
    tagsDiffer: Object.values(tagCounts).filter((n) => n > 0).length > 1,
    spanMetres: span,
  };
}

function titleOf(key: string): string {
  return key
    .split(" ")
    .map((w) => (w === "" ? w : w[0]!.toUpperCase() + w.slice(1)))
    .join(" ");
}

export function buildVenueGroups(places: readonly PackPlaceRecord[]): VenueData {
  const buckets = new Map<string, Item[]>();
  for (const p of places) {
    const r = readName(p.name);
    if (r.base === null) continue;
    const item: Item = { place: p, kind: r.kind, point: p.location !== null && isPoint(p.location) ? p.location : null };
    buckets.set(r.base, [...(buckets.get(r.base) ?? []), item]);
  }
  const groups: VenueGroup[] = [];
  const apart: ApartName[] = [];
  const unplaced: string[] = [];
  for (const [key, items] of buckets) {
    if (items.length < 2) continue;
    const located = items.filter((i) => i.point !== null);
    const unlocated = items.filter((i) => i.point === null);
    const clusters = cluster(located);
    const nameOnly = new Set<string>();
    if (clusters.length === 0) {
      unlocated.forEach((u) => nameOnly.add(u.place.id));
      groups.push(groupOf(key, unlocated, nameOnly));
      continue;
    }
    if (clusters.length === 1) {
      unlocated.forEach((u) => nameOnly.add(u.place.id));
      const all = [...clusters[0]!, ...unlocated];
      if (all.length >= 2) groups.push(groupOf(key, all, nameOnly));
      continue;
    }
    unlocated.forEach((u) => unplaced.push(u.place.id));
    let nearest = Infinity;
    for (let a = 0; a < clusters.length; a++) {
      for (let b = a + 1; b < clusters.length; b++) {
        for (const x of clusters[a]!) for (const y of clusters[b]!) nearest = Math.min(nearest, distanceMetres(x.point!, y.point!));
      }
    }
    apart.push({ key, label: venueDisplayBase(items[0]!.place.name) ?? titleOf(key), places: clusters.length, nearestMetres: nearest });
    for (const c of clusters) if (c.length >= 2) groups.push(groupOf(key, c, nameOnly));
  }
  groups.sort((a, b) => b.members.length - a.members.length || (a.label < b.label ? -1 : a.label > b.label ? 1 : a.key < b.key ? -1 : a.key > b.key ? 1 : a.members[0]!.id < b.members[0]!.id ? -1 : 1));
  apart.sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
  return { groups, apart, unplacedIds: unplaced.sort(), placeCount: places.length, grouped: groups.reduce((n, g) => n + g.members.length, 0) };
}

/** Only the venues whose parts do not all carry the same wheelchair tag. */
export function onlyDiffering(groups: readonly VenueGroup[]): VenueGroup[] {
  return groups.filter((g) => g.tagsDiffer);
}

export function venueSummary(d: VenueData, locale: Locale): string[] {
  const out: string[] = [];
  const n = d.groups.length;
  if (n === 0) {
    out.push(t(locale, "No listed places share a venue name.", "Aucun lieu de la liste ne partage un nom de lieu."));
  } else {
    out.push(t(locale, `${d.grouped} of ${d.placeCount} places fall into ${n} ${n === 1 ? "venue" : "venues"} by name.`, `${d.grouped} lieux sur ${d.placeCount} forment ${n} ${n === 1 ? "lieu" : "lieux"} d’après le nom.`));
    const differ = d.groups.filter((g) => g.tagsDiffer).length;
    if (differ > 0) out.push(t(locale, `${differ} ${differ === 1 ? "venue has" : "venues have"} parts with different wheelchair tags in the pack.`, `${differ} ${differ === 1 ? "lieu a" : "lieux ont"} des parties dont l’étiquette fauteuil roulant diffère dans le pack.`));
  }
  for (const a of d.apart) {
    out.push(t(locale, `${a.label}: ${a.places} places have this name, at least ${formatPackDistance(a.nearestMetres, "en")} apart, so they are not grouped.`, `${a.label}\u00a0: ${a.places} lieux portent ce nom, à au moins ${formatPackDistance(a.nearestMetres, "fr")} l’un de l’autre, donc ils ne sont pas regroupés.`));
  }
  if (d.unplacedIds.length > 0) out.push(t(locale, `${d.unplacedIds.length} ${d.unplacedIds.length === 1 ? "place has" : "places have"} a name that fits more than one venue and no map point, so ${d.unplacedIds.length === 1 ? "it is" : "they are"} not grouped.`, `${d.unplacedIds.length} ${d.unplacedIds.length === 1 ? "lieu a" : "lieux ont"} un nom qui convient à plus d’un lieu et pas de point de carte, donc ${d.unplacedIds.length === 1 ? "il n’est pas regroupé" : "ils ne sont pas regroupés"}.`));
  return out;
}

export function venueCaveat(locale: Locale): string {
  return t(
    locale,
    `Places are grouped when their names share the same words and, where both have a map point, they are within ${VENUE_RADIUS_METRES} m. Grouping does not mean an entrance leads to the place or that one part's tag applies to another.`,
    `Les lieux sont regroupés quand leurs noms partagent les mêmes mots et, si les deux ont un point de carte, qu’ils sont à moins de ${VENUE_RADIUS_METRES} m. Le regroupement ne signifie pas qu’une entrée mène au lieu ni que l’étiquette d’une partie s’applique à une autre.`,
  );
}

export function groupHeading(g: VenueGroup, locale: Locale): string {
  const n = g.members.length;
  return `${g.label}${locale === "fr" ? "\u00a0:" : ":"} ${n} ${locale === "fr" ? (n === 1 ? "partie" : "parties") : n === 1 ? "part" : "parts"}`;
}

/** One sentence on how far apart the parts with a map point are, or null when fewer than two have one. A straight line, not a route. */
export function spanSentence(g: VenueGroup, locale: Locale): string | null {
  if (g.spanMetres === null) return null;
  return t(locale, `The parts with a map point are at most ${formatPackDistance(g.spanMetres, "en")} apart in a straight line.`, `Les parties qui ont un point de carte sont à au plus ${formatPackDistance(g.spanMetres, "fr")} les unes des autres en ligne droite.`);
}

export function memberDistance(m: VenueMember, locale: Locale): string {
  if (m.first) return locale === "fr" ? "point de départ" : "starting point";
  if (m.metres === null) return "UNKNOWN";
  return formatPackDistance(m.metres, locale);
}



export const VENUE_ORDERS = ["size", "name", "differing"] as const;
export type VenueOrder = (typeof VENUE_ORDERS)[number];
export const DEFAULT_VENUE_ORDER: VenueOrder = "size";

export function venueOrderLabel(order: VenueOrder, locale: Locale): string {
  if (order === "size") return t(locale, "Most parts first", "Plus de parties d’abord");
  if (order === "name") return t(locale, "Venue name", "Nom du lieu");
  return t(locale, "Different tags first", "Étiquettes différentes d’abord");
}

const byLabel = (a: VenueGroup, b: VenueGroup): number => (a.label < b.label ? -1 : a.label > b.label ? 1 : a.key < b.key ? -1 : a.key > b.key ? 1 : a.members[0]!.id < b.members[0]!.id ? -1 : a.members[0]!.id > b.members[0]!.id ? 1 : 0);

/** The venues in the chosen order. Ties fall back to name, key and first id, so the order never moves between renders. */
export function orderVenues(groups: readonly VenueGroup[], order: VenueOrder, locale: Locale): VenueGroup[] {
  const name = (a: VenueGroup, b: VenueGroup) => a.label.localeCompare(b.label, locale === "fr" ? "fr-CA" : "en-CA", { sensitivity: "base", numeric: true }) || byLabel(a, b);
  const out = [...groups];
  if (order === "name") return out.sort(name);
  if (order === "differing") return out.sort((a, b) => Number(b.tagsDiffer) - Number(a.tagsDiffer) || b.members.length - a.members.length || name(a, b));
  return out.sort((a, b) => b.members.length - a.members.length || name(a, b));
}

export interface VenueFilter {
  /** Words that each start a word of the venue's name. Empty keeps every venue. */
  readonly query: string;
  /** Part kinds a venue must list, all of them. Empty keeps every venue. */
  readonly kinds: readonly PartKind[];
  readonly differOnly: boolean;
}

export const NO_VENUE_FILTER: VenueFilter = { query: "", kinds: [], differOnly: false };

export function filterVenues(groups: readonly VenueGroup[], f: VenueFilter): VenueGroup[] {
  const words = foldVenueName(f.query).split(" ").filter((w) => w !== "");
  return groups.filter((g) => {
    if (f.differOnly && !g.tagsDiffer) return false;
    if (!f.kinds.every((k) => g.members.some((m) => m.kind === k))) return false;
    if (words.length === 0) return true;
    const parts = foldVenueName(g.label).split(/[\s'-]+/).filter((p) => p !== "");
    return words.every((w) => parts.some((p) => (w.length === 1 ? p === w : p.startsWith(w))));
  });
}

/** How many venues list a part of each kind. Counts of what the names say, not of what a place has. */
export function kindCounts(groups: readonly VenueGroup[]): Readonly<Record<PartKind, number>> {
  const out: Record<PartKind, number> = { main: 0, entrance: 0, elevator: 0, parking: 0, washroom: 0, ramp: 0 };
  for (const g of groups) for (const k of new Set(g.members.map((m) => m.kind))) out[k] += 1;
  return out;
}

export function kindSentence(groups: readonly VenueGroup[], locale: Locale): string | null {
  if (groups.length === 0) return null;
  const c = kindCounts(groups);
  const bits = PART_KINDS.filter((k) => k !== "main" && c[k] > 0).map((k) => `${venuePartLabel(k, locale).toLowerCase()} ${c[k]}`);
  if (bits.length === 0) return t(locale, "No venue lists an entrance, elevator, parking, washroom or ramp by name.", "Aucun lieu ne nomme d’entrée, d’ascenseur, de stationnement, de toilettes ou de rampe.");
  const n = groups.length;
  return t(locale, `Of ${n} ${n === 1 ? "venue" : "venues"}, the names list: ${bits.join(", ")}.`, `Sur ${n} ${n === 1 ? "lieu" : "lieux"}, les noms indiquent\u00a0: ${bits.join(", ")}.`);
}

export const TAG_COLUMNS: readonly WheelchairTag[] = ["yes", "limited", "no", "designated", "unknown"];

export interface KindTagRow {
  readonly kind: PartKind;
  /** Parts of this kind, counted by the wheelchair tag the pack gives each part. */
  readonly counts: Readonly<Record<WheelchairTag, number>>;
  readonly total: number;
}

/**
 * For each kind of part that appears in the venues, how many parts carry each wheelchair tag. A table of
 * what the pack states for parts named that way. It does not say what a kind of part usually has.
 */
export function kindTagRows(groups: readonly VenueGroup[]): KindTagRow[] {
  const rows = new Map<PartKind, Record<WheelchairTag, number>>();
  for (const g of groups) {
    for (const m of g.members) {
      const row = rows.get(m.kind) ?? { ...ZERO };
      row[m.tag] += 1;
      rows.set(m.kind, row);
    }
  }
  return PART_KINDS.filter((k) => rows.has(k)).map((kind) => {
    const counts = rows.get(kind)!;
    return { kind, counts, total: TAG_COLUMNS.reduce((n, c) => n + counts[c], 0) };
  });
}

export interface VenueNote {
  readonly label: string;
  readonly kind: PartKind;
  /** The other parts of the venue, by kind with the tag the pack gives each, in venue order. */
  readonly others: readonly { readonly kind: PartKind; readonly tag: WheelchairTag }[];
}

/** For each place that belongs to a venue, what the card should say. Built from every place in the pack, so a filter on the list does not hide a part. */
export function venueNotes(places: readonly PackPlaceRecord[]): Map<string, VenueNote> {
  const out = new Map<string, VenueNote>();
  for (const g of buildVenueGroups(places).groups) {
    for (const m of g.members) out.set(m.id, { label: g.label, kind: m.kind, others: g.members.filter((o) => o.id !== m.id).map((o) => ({ kind: o.kind, tag: o.tag })) });
  }
  return out;
}

export function venueNoteText(n: VenueNote, locale: Locale): string {
  const kinds = n.others.map((o) => `${venuePartLabel(o.kind, locale).toLowerCase()} ${tagValue(o.tag, locale)}`);
  const count = n.others.length;
  return t(
    locale,
    `In the pack with ${count} other ${count === 1 ? "part" : "parts"} of ${n.label} (${kinds.join(", ")}). Each part has its own wheelchair tag.`,
    `Dans le pack avec ${count} ${count === 1 ? "autre partie" : "autres parties"} de ${n.label} (${kinds.join(", ")}). Chaque partie a sa propre étiquette fauteuil roulant.`,
  );
}

export { venuePartLabel };
