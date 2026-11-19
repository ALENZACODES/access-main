/**
 * The shortlist as a comparison table and as plain text.
 *
 * One row per listed place, the same columns for every row, so a screen reader reads each cell
 * with its column header. Nothing is ranked and no row is called better than another: the cells
 * restate what the pack reports and leave out nothing it does not. A missing value is UNKNOWN.
 */
import { ageLabel, formatDate } from "./provenance";
import { message, type MessageId } from "./messages";
import { type ExportRecord, packPlaceToText, packPlacesToCsv } from "./packExport";
import { distanceMetres, formatPackDistance, type Point } from "./packGeo";
import type { PackPlaceRecord } from "./packPlaces";
import type { ResolvedShortlist } from "./shortlist";
import type { Locale } from "./stateCopy";
import { tierLabel } from "./recordTier";
import { t } from "./typography";

export const UNKNOWN_CELL = "UNKNOWN";
/** The "Added to list" column: it records the person's own action, not a fact about the place, so it never counts as a difference. */
export const ADDED_COLUMN = 8;

export interface TableRow {
  readonly id: string;
  readonly name: string;
  readonly cells: readonly string[];
}

export interface ShortlistTable {
  readonly caption: string;
  /** Column headers, the first being the place name. */
  readonly headers: readonly string[];
  readonly rows: readonly TableRow[];
}

const orUnknown = (value: string | null | undefined): string => (value === null || value === undefined || value.trim() === "" ? UNKNOWN_CELL : value);

/** Order of the rows: the order places were added, or by name (UNKNOWN names last). Neither ranks the places. */
export type ShortlistOrder = "added" | "name";
export const SHORTLIST_ORDERS: readonly ShortlistOrder[] = ["added", "name"];

/** The headers of the table. The distance column is present only when a starting point is known. */
export function tableHeaders(locale: Locale, withDistance: boolean): string[] {
  const headers = [
    t(locale, "Place", "Lieu"),
    t(locale, "Wheelchair tag", "Indication pour fauteuil roulant"),
    t(locale, "Kind", "Type"),
    t(locale, "Address", "Adresse"),
    t(locale, "Tier", "Niveau"),
    t(locale, "Retrieved", "Consulté"),
    t(locale, "Source", "Source"),
    t(locale, "Licence", "Licence"),
    t(locale, "Added to list", "Ajouté à la liste"),
  ];
  if (withDistance) headers.push(t(locale, "Distance", "Distance"));
  return headers;
}

function rowFor(p: PackPlaceRecord, added: string | null, locale: Locale, today: string, from: Point | null): TableRow {
  const prov = p.provenance;
  const cells = [
    p.name ?? UNKNOWN_CELL,
    message(`pack.tag.${p.tag}` as MessageId, locale),
    orUnknown(p.category),
    orUnknown(p.address),
    tierLabel(p.tier, locale),
    prov ? ageLabel(prov.retrievedOn, today, locale) : UNKNOWN_CELL,
    orUnknown(prov?.source),
    prov?.licence ?? UNKNOWN_CELL,
    added === null ? UNKNOWN_CELL : formatDate(added, locale),
  ];
  if (from !== null) cells.push(p.location ? formatPackDistance(distanceMetres(from, p.location), locale) : UNKNOWN_CELL);
  return { id: p.id, name: p.name ?? UNKNOWN_CELL, cells };
}

export function buildShortlistTable(resolved: ResolvedShortlist, locale: Locale, today: string, from: Point | null = null, order: ShortlistOrder = "added"): ShortlistTable {
  const n = resolved.found.length;
  const found = order === "name" ? [...resolved.found].sort((a, b) => byName(a.place, b.place)) : resolved.found;
  return {
    caption: t(locale, `Shortlisted places side by side (${n}). Each cell repeats what the pack reports; nothing is ranked.`, `Lieux de la liste côte à côte (${n}). Chaque cellule reprend ce que le pack indique\u202f; rien n’est classé.`),
    headers: tableHeaders(locale, from !== null),
    rows: found.map(({ entry, place }) => rowFor(place, entry.addedOn, locale, today, from)),
  };
}

function byName(a: PackPlaceRecord, b: PackPlaceRecord): number {
  if ((a.name === null) !== (b.name === null)) return a.name === null ? 1 : -1;
  return (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" }) || a.id.localeCompare(b.id);
}

/** The notice for listed ids the pack no longer holds. Empty when there are none. */
export function missingNotice(count: number, locale: Locale): string {
  if (count === 0) return "";
  return t(
    locale,
    count === 1 ? "1 listed place is not in the pack on this device, so nothing about it is known." : `${count} listed places are not in the pack on this device, so nothing about them is known.`,
    count === 1 ? "1 lieu de la liste n’est pas dans le pack sur cet appareil\u00a0: on n’en sait rien." : `${count} lieux de la liste ne sont pas dans le pack sur cet appareil\u00a0: on n’en sait rien.`,
  );
}

/** All listed places as one text, one block each, with the missing count at the end. Empty list gives a one-line note. */
export function shortlistToText(resolved: ResolvedShortlist, locale: Locale, today: string): string {
  const title = t(locale, "Shortlisted places", "Lieux de la liste");
  if (resolved.found.length === 0 && resolved.missing.length === 0) return `${title}\n${t(locale, "No places on the list.", "Aucun lieu dans la liste.")}\n`;
  const blocks = resolved.found.map(({ place }) => {
    const record: ExportRecord = { place, tier: place.tier === null ? null : String(place.tier) };
    return packPlaceToText(record, locale, today).trimEnd();
  });
  const out = [title, "=".repeat(title.length), ...blocks.flatMap((b) => ["", b])];
  const missing = missingNotice(resolved.missing.length, locale);
  if (missing) out.push("", missing);
  return out.join("\n") + "\n";
}

/**
 * Which columns hold different values for the listed places, by position (the place name column
 * is left out, since it always differs). Needs at least two rows. Equal means the same text.
 */
export function differingColumns(table: ShortlistTable): number[] {
  if (table.rows.length < 2) return [];
  const out: number[] = [];
  for (let col = 1; col < table.headers.length; col++) {
    if (col === ADDED_COLUMN) continue;
    const first = table.rows[0]!.cells[col];
    if (table.rows.some((r) => r.cells[col] !== first)) out.push(col);
  }
  return out;
}

/** One sentence naming the columns that differ, or saying none do. Empty with fewer than two places. It points out differences; it does not say which place is better. */
export function differencesLine(table: ShortlistTable, locale: Locale): string {
  if (table.rows.length < 2) return "";
  const cols = differingColumns(table);
  if (cols.length === 0) return t(locale, "The places report the same in every column shown, apart from their names.", "Les lieux indiquent la même chose dans toutes les colonnes affichées, hormis leurs noms.");
  const names = cols.map((c) => table.headers[c]!).join(", ");
  return t(locale, `These columns differ between the places: ${names}.`, `Ces colonnes diffèrent d’un lieu à l’autre\u00a0: ${names}.`);
}

/** The listed places as CSV, the same columns and tokens as the pack export, in the order they were added. */
export function shortlistToCsv(resolved: ResolvedShortlist, opts: { readonly bom?: boolean } = {}): string {
  const records: ExportRecord[] = resolved.found.map(({ place }) => ({ place, tier: place.tier === null ? null : String(place.tier) }));
  return packPlacesToCsv(records, opts);
}
