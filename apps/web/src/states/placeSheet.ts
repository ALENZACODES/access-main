/**
 * Everything the pack says about one place, field by field, and what it leaves out.
 *
 * A field the pack does not give is UNKNOWN, with the reason in words. Counting how many details
 * are recorded says how much the pack holds about the place. It is not a score, and it does not
 * say the place is easier or harder to use. Nothing is guessed to fill a gap.
 */
import { geoUri } from "./geo";
import { message, type MessageId } from "./messages";
import type { PackPlaceRecord, TagUnknownReason } from "./packPlaces";
import { OPEN_LICENCES, ageLabel, formatDate, isStale } from "./provenance";
import { tierLabel } from "./recordTier";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

export const SHEET_FIELDS = ["name", "tag", "kind", "address", "position", "source", "licence", "retrieved", "tier"] as const;
export type SheetField = (typeof SHEET_FIELDS)[number];

export const UNKNOWN = "UNKNOWN";

export interface SheetRow {
  readonly field: SheetField | "note";
  readonly label: string;
  /** What the pack gives, or UNKNOWN. */
  readonly value: string;
  readonly known: boolean;
  /** Why it is UNKNOWN, in a sentence; null when it is known. */
  readonly reason: string | null;
}

export interface PlaceSheet {
  readonly id: string;
  readonly title: string;
  readonly rows: readonly SheetRow[];
  /** How many of the nine details the pack gives. The note is extra and is not counted. */
  readonly recorded: number;
  readonly total: number;
  /** The labels of the details that are UNKNOWN, in table order. */
  readonly gaps: readonly string[];
  /** A `geo:` link for the person's own maps app, or null with no map point. */
  readonly geoHref: string | null;
  readonly staleNotice: string | null;
}

export function sheetFieldLabel(field: SheetField | "note", locale: Locale): string {
  switch (field) {
    case "name":
      return t(locale, "Name", "Nom");
    case "tag":
      return t(locale, "Wheelchair tag", "Indication pour fauteuil roulant");
    case "kind":
      return t(locale, "Kind", "Type");
    case "address":
      return t(locale, "Address", "Adresse");
    case "position":
      return t(locale, "Map point", "Point de carte");
    case "source":
      return t(locale, "Source", "Source");
    case "licence":
      return t(locale, "Licence", "Licence");
    case "retrieved":
      return t(locale, "Retrieved", "Consulté");
    case "tier":
      return t(locale, "Tier", "Niveau");
    case "note":
      return t(locale, "Note", "Note");
  }
}

function tagReason(reason: TagUnknownReason | null, locale: Locale): string {
  switch (reason) {
    case "unrecognised-value":
      return t(locale, "The pack gives a tag value this App does not recognise.", "Le pack donne une valeur d’indication que l’application ne reconnaît pas.");
    case "missing-provenance":
      return t(locale, "The tag has no usable source, so it is not shown as known.", "L’indication n’a pas de source utilisable\u00a0: elle n’est donc pas présentée comme connue.");
    default:
      return t(locale, "The pack gives no wheelchair tag for this place.", "Le pack ne donne aucune indication pour fauteuil roulant pour ce lieu.");
  }
}

const GAP_PHRASES: Record<SheetField, { en: string; fr: string }> = {
  name: { en: "a name", fr: "aucun nom" },
  tag: { en: "a wheelchair tag", fr: "aucune indication pour fauteuil roulant" },
  kind: { en: "a kind of place", fr: "aucun type de lieu" },
  address: { en: "an address", fr: "aucune adresse" },
  position: { en: "a map point", fr: "aucun point de carte" },
  source: { en: "a source", fr: "aucune source" },
  licence: { en: "a licence", fr: "aucune licence" },
  retrieved: { en: "a retrieval date", fr: "aucune date de récupération" },
  tier: { en: "a tier", fr: "aucun niveau" },
};

const gapReason = (field: SheetField, locale: Locale): string =>
  t(locale, `The pack does not give ${GAP_PHRASES[field].en} for this place.`, `Le pack ne donne ${GAP_PHRASES[field].fr} pour ce lieu.`);

/** Coordinates as a technical token: a decimal point and five places in both languages, so it matches the CSV and the map link. */
export function positionText(p: { readonly lat: number; readonly lon: number }): string {
  return `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`;
}

export function tagValue(tag: PackPlaceRecord["tag"], locale: Locale): string {
  return tag === "unknown" ? UNKNOWN : message(`pack.tag.${tag}` as MessageId, locale);
}

export function buildPlaceSheet(place: PackPlaceRecord, locale: Locale, today: string): PlaceSheet {
  const prov = place.provenance;
  const known = (field: SheetField, value: string | null | undefined, reason?: string): SheetRow =>
    value === null || value === undefined || value === ""
      ? { field, label: sheetFieldLabel(field, locale), value: UNKNOWN, known: false, reason: reason ?? gapReason(field, locale) }
      : { field, label: sheetFieldLabel(field, locale), value, known: true, reason: null };

  const rows: SheetRow[] = [
    known("name", place.name),
    place.tag === "unknown"
      ? { field: "tag", label: sheetFieldLabel("tag", locale), value: UNKNOWN, known: false, reason: tagReason(place.tagUnknownReason, locale) }
      : { field: "tag", label: sheetFieldLabel("tag", locale), value: tagValue(place.tag, locale), known: true, reason: null },
    known("kind", place.category),
    known("address", place.address),
    known("position", place.location ? positionText(place.location) : null),
    known("source", prov?.source),
    known("licence", prov ? OPEN_LICENCES[prov.licence] : null),
    known("retrieved", prov ? `${formatDate(prov.retrievedOn, locale)} (${ageLabel(prov.retrievedOn, today, locale)})` : null),
    // A tier is a stated level of the record, never a default: no tier is UNKNOWN.
    place.tier === null ? known("tier", null) : known("tier", tierLabel(place.tier, locale)),
  ];
  if (place.note) rows.push({ field: "note", label: sheetFieldLabel("note", locale), value: place.note, known: true, reason: null });
  const core = rows.filter((r) => r.field !== "note");
  return {
    id: place.id,
    title: place.name ?? t(locale, `Name ${UNKNOWN}`, `Nom ${UNKNOWN}`),
    rows,
    recorded: core.filter((r) => r.known).length,
    total: SHEET_FIELDS.length,
    gaps: core.filter((r) => !r.known).map((r) => r.label),
    geoHref: place.location ? geoUri(place.location) : null,
    staleNotice: prov && isStale(prov.retrievedOn, today) ? message("pack.stale", locale) : null,
  };
}

/** One sentence: how many details the pack gives and which are UNKNOWN. A count of what is recorded, not a rating. */
export function sheetSummary(sheet: PlaceSheet, locale: Locale): string {
  const head = t(locale, `The pack gives ${sheet.recorded} of ${sheet.total} details for this place.`, `Le pack donne ${sheet.recorded} détails sur ${sheet.total} pour ce lieu.`);
  if (sheet.gaps.length === 0) return head;
  const list = sheet.gaps.join(", ");
  return `${head} ${t(locale, `UNKNOWN: ${list}.`, `UNKNOWN\u00a0: ${list}.`)}`;
}
