/** Runs the name reader over a list of places and sorts and filters the results for the page and the saved files. */
import { kindKey, kindLabel } from "./packCategories";
import type { PackPlaceRecord } from "./packPlaces";
import { NAME_ADDRESS_MATCHES, compareNameAndAddress, readAddressLanguage, type AddressLanguage, type NameAddressMatch } from "./addressLanguage";
import { NAME_READINGS, readNameLanguage, type NameLanguage, type NameReading } from "./nameLanguage";

export interface NameRow {
  readonly id: string;
  readonly name: string | null;
  readonly address: string | null;
  readonly kind: string;
  readonly language: NameLanguage;
  readonly addressLanguage: AddressLanguage;
  /** What the name and the address point to, compared. */
  readonly match: NameAddressMatch;
}

export interface NameLanguageReport {
  readonly rows: readonly NameRow[];
  readonly byReading: Readonly<Record<NameReading, number>>;
  /** Places the reader looked at: those with a name. */
  readonly named: number;
  /** Names read as "neither" that still have a letter only French uses. */
  readonly accentedOnly: number;
  /** Names that read as a French half and an English half. */
  readonly pairs: number;
  readonly byMatch: Readonly<Record<NameAddressMatch, number>>;
}

const emptyCounts = (): Record<NameReading, number> => Object.fromEntries(NAME_READINGS.map((r) => [r, 0])) as Record<NameReading, number>;

const emptyMatches = (): Record<NameAddressMatch, number> => Object.fromEntries(NAME_ADDRESS_MATCHES.map((m) => [m, 0])) as Record<NameAddressMatch, number>;

const kindOf = (p: PackPlaceRecord): string => {
  const k = kindKey(p.category);
  return k === "unknown" || p.category === null ? "UNKNOWN" : kindLabel({ key: k, spelling: p.category });
};

export function buildNameReport(places: readonly PackPlaceRecord[]): NameLanguageReport {
  const byReading = emptyCounts();
  const byMatch = emptyMatches();
  const rows: NameRow[] = [];
  let accentedOnly = 0;
  let pairs = 0;
  for (const p of places) {
    const language = readNameLanguage(p.name);
    byReading[language.reading] += 1;
    if (language.reading === "neither" && language.accents > 0) accentedOnly += 1;
    if (language.pair) pairs += 1;
    const addressLanguage = readAddressLanguage(p.address);
    const match = compareNameAndAddress(language.reading, addressLanguage.reading);
    byMatch[match] += 1;
    rows.push({ id: p.id, name: p.name, address: p.address, kind: kindOf(p), language, addressLanguage, match });
  }
  return { rows, byReading, named: places.length - byReading["no-name"], accentedOnly, pairs, byMatch };
}

export type NameFilter = "all" | NameReading | "pairs" | "accented" | "differs";
export const NAME_FILTERS: readonly NameFilter[] = ["all", "french", "english", "both", "neither", "other-script", "pairs", "accented", "differs"];
export const isNameFilter = (v: unknown): v is NameFilter => typeof v === "string" && (NAME_FILTERS as readonly string[]).includes(v);

export function filterNames(rows: readonly NameRow[], filter: NameFilter): NameRow[] {
  switch (filter) {
    case "all":
      return rows.filter((r) => r.language.reading !== "no-name");
    case "pairs":
      return rows.filter((r) => r.language.pair);
    case "differs":
      return rows.filter((r) => r.match === "differs");
    case "accented":
      return rows.filter((r) => r.language.reading === "neither" && r.language.accents > 0);
    default:
      return rows.filter((r) => r.language.reading === filter);
  }
}

export type NameOrder = "pack" | "name" | "reading";
export const NAME_ORDERS: readonly NameOrder[] = ["pack", "name", "reading"];
export const DEFAULT_NAME_ORDER: NameOrder = "pack";
export const isNameOrder = (v: unknown): v is NameOrder => typeof v === "string" && (NAME_ORDERS as readonly string[]).includes(v);

export function orderNames(rows: readonly NameRow[], order: NameOrder): NameRow[] {
  const out = [...rows];
  if (order === "pack") return out;
  const byName = (a: NameRow, b: NameRow) => (a.name ?? "").localeCompare(b.name ?? "", "en", { sensitivity: "base" }) || a.id.localeCompare(b.id);
  if (order === "name") return out.sort(byName);
  const rank = (r: NameRow) => NAME_READINGS.indexOf(r.language.reading);
  return out.sort((a, b) => rank(a) - rank(b) || byName(a, b));
}

/** The kinds of place whose names read as the given language, most first then by kind, up to `limit`. */
export function kindsFor(rows: readonly NameRow[], reading: NameReading, limit = 3): { kind: string; count: number }[] {
  const m = new Map<string, number>();
  for (const r of rows) if (r.language.reading === reading) m.set(r.kind, (m.get(r.kind) ?? 0) + 1);
  return [...m.entries()]
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind, "en"))
    .slice(0, limit);
}

/** Share of the named places with each reading, as whole percents that add up to 100 when anything is named. */
export function sharesOf(report: Pick<NameLanguageReport, "byReading" | "named">): Record<NameReading, number> {
  const out = emptyCounts();
  if (report.named === 0) return out;
  const order = NAME_READINGS.filter((r) => r !== "no-name");
  const exact = order.map((r) => (report.byReading[r] * 100) / report.named);
  const floors = exact.map(Math.floor);
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  const byRemainder = exact.map((e, i) => ({ i, rem: e - floors[i]! })).sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const { i } of byRemainder) {
    if (left <= 0) break;
    floors[i]! += 1;
    left -= 1;
  }
  order.forEach((r, i) => (out[r] = floors[i]!));
  return out;
}
