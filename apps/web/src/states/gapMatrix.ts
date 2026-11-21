/**
 * Which details the pack gives, place by place. A grid of the listed places against the nine
 * details of the place sheet, so gaps can be seen side by side. It counts and lists what is
 * recorded; it never scores, ranks or reorders the places. The order is the list's own.
 */
import { buildPlaceSheet, SHEET_FIELDS, sheetFieldLabel, UNKNOWN, type SheetField } from "./placeSheet";
import type { PackPlaceRecord } from "./packPlaces";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

export interface GapCell {
  readonly field: SheetField;
  readonly known: boolean;
  /** The value as the sheet writes it, or UNKNOWN. */
  readonly value: string;
}

export interface GapRow {
  readonly id: string;
  readonly title: string;
  readonly cells: readonly GapCell[];
  readonly recorded: number;
}

export interface GapColumn {
  readonly field: SheetField;
  readonly label: string;
  /** How many of the listed places have this detail unknown. */
  readonly unknownCount: number;
}

export interface GapMatrix {
  readonly columns: readonly GapColumn[];
  readonly rows: readonly GapRow[];
  /** Fields where every listed place is UNKNOWN. */
  readonly emptyFields: readonly SheetField[];
  /** Ids of listed places that have no UNKNOWN detail at all. */
  readonly fullPlaces: readonly string[];
}

export function buildGapMatrix(places: readonly PackPlaceRecord[], locale: Locale, today: string): GapMatrix {
  const rows: GapRow[] = places.map((p) => {
    const sheet = buildPlaceSheet(p, locale, today);
    const cells = SHEET_FIELDS.map((field): GapCell => {
      const r = sheet.rows.find((x) => x.field === field)!;
      return { field, known: r.known, value: r.value };
    });
    return { id: p.id, title: sheet.title, cells, recorded: sheet.recorded };
  });
  const columns = SHEET_FIELDS.map((field, i): GapColumn => ({ field, label: sheetFieldLabel(field, locale), unknownCount: rows.filter((r) => !r.cells[i]!.known).length }));
  return {
    columns,
    rows,
    emptyFields: rows.length === 0 ? [] : columns.filter((c) => c.unknownCount === rows.length).map((c) => c.field),
    fullPlaces: rows.filter((r) => r.recorded === SHEET_FIELDS.length).map((r) => r.id),
  };
}

/** One sentence over the whole grid. A count of what the pack leaves UNKNOWN, not a comparison of the places. */
export function gapSentence(matrix: GapMatrix, locale: Locale): string {
  const n = matrix.rows.length;
  const unknown = matrix.rows.reduce((sum, r) => sum + r.cells.filter((c) => !c.known).length, 0);
  const cells = n * SHEET_FIELDS.length;
  const head = t(
    locale,
    `${n} places, ${cells} details: the pack leaves ${unknown} UNKNOWN.`,
    `${n} lieux, ${cells} détails\u00a0: le pack en laisse ${unknown} UNKNOWN.`,
  );
  if (matrix.emptyFields.length === 0) return head;
  const labels = matrix.emptyFields.map((f) => sheetFieldLabel(f, locale)).join(", ");
  return `${head} ${t(locale, `UNKNOWN for every listed place: ${labels}.`, `UNKNOWN pour chaque lieu de la liste\u00a0: ${labels}.`)}`;
}

/** The text a cell shows. A short word, not a colour, carries the difference. */
export function cellWord(cell: GapCell, locale: Locale): string {
  return cell.known ? t(locale, "Given", "Donné") : UNKNOWN;
}
