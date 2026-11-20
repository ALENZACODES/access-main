/**
 * The listed places grouped by the street in their address line. It is a way to see which places the
 * pack puts on the same street. It does not say how far apart they are, which side of the street a
 * place is on, or whether a street is easy to use: the pack does not give those things. A place whose
 * address cannot be read as one street is counted apart and never placed on a street by guesswork.
 */
import { type PackPlaceRecord, type WheelchairTag } from "./packPlaces";
import { type ParsedAddress, foldAddressText, keyWord, parseAddress, parityOf } from "./streetAddress";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

export const STREET_ORDERS = ["name", "count", "gaps"] as const;
export type StreetOrder = (typeof STREET_ORDERS)[number];
export const DEFAULT_STREET_ORDER: StreetOrder = "count";

export interface StreetEntry {
  readonly id: string;
  readonly name: string | null;
  readonly number: string | null;
  readonly numberValue: number | null;
  readonly parity: "odd" | "even" | null;
  readonly unit: string | null;
  readonly tag: WheelchairTag;
  /** The address line exactly as the pack gives it. */
  readonly address: string;
}

export interface StreetGroup {
  readonly key: string;
  readonly name: string;
  /** Numbered places first, by number, then the rest, then by id, so the order never changes between renders. */
  readonly entries: readonly StreetEntry[];
  readonly tagCounts: Readonly<Record<WheelchairTag, number>>;
  /** Places on this street whose wheelchair tag is UNKNOWN. */
  readonly unknownCount: number;
  /** Ids whose number and street are the same as another place's on this street. */
  readonly sameAddressIds: readonly string[];
}

export interface StreetIndexData {
  readonly groups: readonly StreetGroup[];
  readonly order: StreetOrder;
  readonly placeCount: number;
  /** Places put on a street. */
  readonly onStreet: number;
  /** Streets that have two or more listed places. */
  readonly sharedStreets: number;
  readonly noAddressIds: readonly string[];
  readonly poBoxIds: readonly string[];
  readonly intersectionIds: readonly string[];
}

const ZERO_TAGS: Readonly<Record<WheelchairTag, number>> = { yes: 0, limited: 0, no: 0, designated: 0, unknown: 0 };

/** Name order with accents and case ignored, in the reader's language. */
export function compareNames(a: string, b: string, locale: Locale): number {
  return a.localeCompare(b, locale === "fr" ? "fr-CA" : "en-CA", { sensitivity: "base", numeric: true });
}

function entryOf(p: PackPlaceRecord, a: ParsedAddress): StreetEntry {
  return { id: p.id, name: p.name, number: a.number, numberValue: a.numberValue, parity: parityOf(a.numberValue), unit: a.unit, tag: p.tag, address: p.address ?? "" };
}

function byNumber(a: StreetEntry, b: StreetEntry): number {
  if (a.numberValue === null && b.numberValue !== null) return 1;
  if (a.numberValue !== null && b.numberValue === null) return -1;
  if (a.numberValue !== null && b.numberValue !== null && a.numberValue !== b.numberValue) return a.numberValue - b.numberValue;
  const an = a.number ?? "";
  const bn = b.number ?? "";
  if (an !== bn) return an < bn ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function orderGroups(groups: readonly StreetGroup[], order: StreetOrder, locale: Locale): StreetGroup[] {
  const by = (a: StreetGroup, b: StreetGroup) => compareNames(a.name, b.name, locale) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  const sorted = [...groups];
  if (order === "name") return sorted.sort(by);
  if (order === "count") return sorted.sort((a, b) => b.entries.length - a.entries.length || by(a, b));
  return sorted.sort((a, b) => b.unknownCount - a.unknownCount || b.entries.length - a.entries.length || by(a, b));
}

export function buildStreetIndex(places: readonly PackPlaceRecord[], locale: Locale, order: StreetOrder = DEFAULT_STREET_ORDER): StreetIndexData {
  const buckets = new Map<string, { name: string; entries: StreetEntry[] }>();
  const noAddressIds: string[] = [];
  const poBoxIds: string[] = [];
  const intersectionIds: string[] = [];
  for (const p of places) {
    const a = parseAddress(p.address);
    if (a.kind === "po-box") poBoxIds.push(p.id);
    else if (a.kind === "intersection") intersectionIds.push(p.id);
    else if (a.kind !== "street" || a.key === null || a.street === null) noAddressIds.push(p.id);
    else {
      const bucket = buckets.get(a.key) ?? { name: a.street, entries: [] };
      bucket.entries.push(entryOf(p, a));
      buckets.set(a.key, bucket);
    }
  }
  const groups: StreetGroup[] = [...buckets.entries()].map(([key, b]) => {
    const entries = [...b.entries].sort(byNumber);
    const tagCounts = { ...ZERO_TAGS };
    for (const e of entries) tagCounts[e.tag] += 1;
    const seen = new Map<string, number>();
    for (const e of entries) if (e.number !== null) seen.set(e.number.toLowerCase(), (seen.get(e.number.toLowerCase()) ?? 0) + 1);
    const sameAddressIds = entries.filter((e) => e.number !== null && (seen.get(e.number.toLowerCase()) ?? 0) > 1).map((e) => e.id);
    return { key, name: b.name, entries, tagCounts, unknownCount: tagCounts.unknown, sameAddressIds };
  });
  const ordered = orderGroups(groups, order, locale);
  return {
    groups: ordered,
    order,
    placeCount: places.length,
    onStreet: groups.reduce((n, g) => n + g.entries.length, 0),
    sharedStreets: groups.filter((g) => g.entries.length >= 2).length,
    // Sorted, so the same places in another order give the same index.
    noAddressIds: noAddressIds.sort(),
    poBoxIds: poBoxIds.sort(),
    intersectionIds: intersectionIds.sort(),
  };
}

/** Plain sentences about the grouping. Counts only: nothing here ranks a street or advises a visit. */
export function streetSummary(d: StreetIndexData, locale: Locale): string[] {
  const out: string[] = [];
  const streets = d.groups.length;
  out.push(
    t(
      locale,
      `${d.onStreet} of ${d.placeCount} places have an address that reads as one street, on ${streets} ${streets === 1 ? "street" : "streets"}.`,
      `${d.onStreet} lieux sur ${d.placeCount} ont une adresse qui se lit comme une seule rue, sur ${streets} ${streets === 1 ? "rue" : "rues"}.`,
    ),
  );
  if (d.sharedStreets > 0) {
    out.push(
      t(
        locale,
        `${d.sharedStreets} ${d.sharedStreets === 1 ? "street has" : "streets have"} two or more listed places.`,
        `${d.sharedStreets} ${d.sharedStreets === 1 ? "rue compte" : "rues comptent"} deux lieux ou plus dans la liste.`,
      ),
    );
  }
  const apart = d.noAddressIds.length + d.poBoxIds.length + d.intersectionIds.length;
  if (apart > 0) {
    out.push(
      t(
        locale,
        `${apart} ${apart === 1 ? "place is" : "places are"} not on a street here: no address (UNKNOWN), a post office box, or a corner.`,
        `${apart} ${apart === 1 ? "lieu n’est pas placé" : "lieux ne sont pas placés"} sur une rue ici\u00a0: aucune adresse (UNKNOWN), une case postale ou un coin de rues.`,
      ),
    );
  }
  return out;
}

export function streetCaveat(locale: Locale): string {
  return t(
    locale,
    "Streets are read from the address text the pack gives. Two places on one street can be far apart, and an odd or even number does not tell you which side of the street a place is on.",
    "Les rues sont lues dans le texte d’adresse du pack. Deux lieux sur une même rue peuvent être éloignés, et un numéro pair ou impair n’indique pas de quel côté de la rue se trouve un lieu.",
  );
}

export function orderLabel(order: StreetOrder, locale: Locale): string {
  if (order === "name") return t(locale, "Street name", "Nom de la rue");
  if (order === "count") return t(locale, "Most places first", "Plus de lieux d’abord");
  return t(locale, "Most UNKNOWN first", "Plus de UNKNOWN d’abord");
}

export function streetGroupLine(g: StreetGroup, locale: Locale): string {
  const n = g.entries.length;
  const places = t(locale, `${n} ${n === 1 ? "place" : "places"}`, `${n} ${n === 1 ? "lieu" : "lieux"}`);
  const unk = g.unknownCount === 0 ? "" : t(locale, `, ${g.unknownCount} with the wheelchair tag UNKNOWN`, `, ${g.unknownCount} avec l’étiquette fauteuil roulant UNKNOWN`);
  return `${g.name}${locale === "fr" ? "\u00a0:" : ":"} ${places}${unk}`;
}

export interface AddManyResult {
  readonly added: number;
  readonly already: number;
  readonly full: number;
  readonly invalid: number;
}

/**
 * Puts a street's places on the list one at a time through `add`, stopping nothing early so every place
 * gets its own answer. A place that is already listed is counted and left alone; once the list is full
 * the rest are counted as not added. Nothing is removed.
 */
export function addMany(ids: readonly string[], add: (id: string) => "added" | "already" | "full" | "invalid"): AddManyResult {
  const out = { added: 0, already: 0, full: 0, invalid: 0 };
  for (const id of ids) out[add(id)] += 1;
  return out;
}

const plural = (n: number, en: [string, string], fr: [string, string], locale: Locale): string => `${n} ${locale === "fr" ? (n === 1 ? fr[0] : fr[1]) : n === 1 ? en[0] : en[1]}`;

/** One sentence saying what happened, with every count that is not zero and no more. */
export function addManySentence(r: AddManyResult, streetName: string, locale: Locale): string {
  const bits: string[] = [];
  if (r.added > 0) bits.push(t(locale, `${plural(r.added, ["place", "places"], ["lieu", "lieux"], "en")} added`, `${plural(r.added, ["lieu ajouté", "lieux ajoutés"], ["lieu ajouté", "lieux ajoutés"], "fr")}`));
  if (r.already > 0) bits.push(t(locale, `${r.already} already on the list`, `${r.already} déjà dans la liste`));
  if (r.full > 0) bits.push(t(locale, `${r.full} not added because the list is full`, `${r.full} non ${r.full === 1 ? "ajouté" : "ajoutés"} parce que la liste est pleine`));
  if (r.invalid > 0) bits.push(t(locale, `${r.invalid} could not be added`, `${r.invalid} n’${r.invalid === 1 ? "a" : "ont"} pas pu être ${r.invalid === 1 ? "ajouté" : "ajoutés"}`));
  if (bits.length === 0) return t(locale, `No places to add from ${streetName}.`, `Aucun lieu à ajouter depuis ${streetName}.`);
  return t(locale, `${streetName}: ${bits.join(", ")}.`, `${streetName}\u00a0: ${bits.join(", ")}.`);
}

/**
 * The streets where every word typed starts a word of the street's name, ignoring case, accents and the short
 * forms of street types ("yonge st" finds Yonge Street). A single letter must be a whole word, so the
 * direction E is not found inside "street". An empty search keeps every street. The order is not changed.
 */
export function filterStreets(groups: readonly StreetGroup[], query: string): StreetGroup[] {
  const words = foldAddressText(query)
    .split(/[\s'-]+/)
    .filter((w) => w !== "")
    .map(keyWord);
  if (words.length === 0) return [...groups];
  return groups.filter((g) => {
    const parts = foldAddressText(g.key).split(/[\s'-]+/).filter((p) => p !== "");
    return words.every((w) => parts.some((p) => (w.length === 1 ? p === w : p.startsWith(w))));
  });
}
