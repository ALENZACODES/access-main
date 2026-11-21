/**
 * The value each place was ordered by, as a table row: its position, its name and the field the
 * order used. It lets a person (or a screen reader, row by row) check that the order is what it says.
 * A field the pack does not state is written UNKNOWN. Nothing here ranks, scores or judges.
 */
import { kindKey, UNKNOWN_KIND } from "./packCategories";
import type { PackPlaceRecord } from "./packPlaces";
import type { PackSort } from "./packSort";
import { tagValue } from "./placeSheet";
import { formatDate } from "./provenance";
import type { Locale } from "./stateCopy";
import { parseAddress } from "./streetAddress";
import { t } from "./typography";

/** The most rows the page shows. The files hold every place. */
export const MAX_ORDER_ROWS = 200;
const UNKNOWN = "UNKNOWN";

export interface OrderRow {
  /** 1, 2, 3, … in the order shown. */
  readonly position: number;
  readonly id: string;
  readonly name: string;
  /** The value the order used, as written for a reader. */
  readonly key: string;
  /** The value of the second order, or null when there is none. */
  readonly thenKey: string | null;
}

export interface OrderTable {
  readonly rows: readonly OrderRow[];
  readonly total: number;
  readonly truncated: boolean;
  /** The column heading for the value. */
  readonly keyHeading: string;
  /** The heading for the second order's column, or null when there is none. */
  readonly thenHeading: string | null;
}

/** The heading of the column that shows the value an order used. */
export function sortKeyHeading(sort: PackSort, locale: Locale): string {
  switch (sort) {
    case "default":
      return t(locale, "Name", "Nom");
    case "name":
    case "name-desc":
      return t(locale, "Name", "Nom");
    case "kind":
      return t(locale, "Kind", "Type");
    case "street":
      return t(locale, "Street and number", "Rue et numéro");
    case "tag":
      return t(locale, "Wheelchair tag", "Étiquette fauteuil roulant");
    case "oldest":
    case "newest":
      return t(locale, "Retrieved", "Consulté");
  }
}

/** The value of the order's field for one place. */
export function sortKeyText(sort: PackSort, p: PackPlaceRecord, locale: Locale): string {
  switch (sort) {
    case "default":
    case "name":
    case "name-desc":
      return p.name ?? UNKNOWN;
    case "kind": {
      const k = kindKey(p.category);
      return k === UNKNOWN_KIND ? UNKNOWN : (p.category ?? "").trim().replace(/[_\s]+/g, " ");
    }
    case "street": {
      const a = parseAddress(p.address);
      if (a.street === null) return UNKNOWN;
      return a.number === null ? a.street : `${a.number} ${a.street}`;
    }
    case "tag":
      return tagValue(p.tag, locale);
    case "oldest":
    case "newest":
      return p.provenance === null ? UNKNOWN : formatDate(p.provenance.retrievedOn, locale);
  }
}

/** The rows of the order table: at most `limit` places, in the order given. */
export function buildOrderTable(ordered: readonly PackPlaceRecord[], sort: PackSort, locale: Locale, limit: number = MAX_ORDER_ROWS, then: PackSort | null = null): OrderTable {
  const cap = Math.max(0, Math.floor(limit));
  const rows = ordered.slice(0, cap).map((p, i) => ({ position: i + 1, id: p.id, name: p.name ?? UNKNOWN, key: sortKeyText(sort, p, locale), thenKey: then === null ? null : sortKeyText(then, p, locale) }));
  return { rows, total: ordered.length, truncated: ordered.length > cap, keyHeading: sortKeyHeading(sort, locale), thenHeading: then === null ? null : sortKeyHeading(then, locale) };
}

/** "Showing the first 200 of 350 places. The saved files hold all of them." Empty when nothing is cut. */
export function orderTableNote(table: OrderTable, locale: Locale): string {
  if (!table.truncated) return "";
  return t(
    locale,
    `Showing the first ${table.rows.length} of ${table.total} places. The saved files hold all of them.`,
    `Affichage des ${table.rows.length} premiers lieux sur ${table.total}. Les fichiers enregistrés les contiennent tous.`,
  );
}
