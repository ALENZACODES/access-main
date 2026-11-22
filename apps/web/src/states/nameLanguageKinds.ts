/**
 * A table of the kinds of place (library, cafe, park...) against what their names point to. It counts only; it does
 * not say that a kind "should" have names in one language. UNKNOWN, the places with no kind, is always last.
 */
import { csvCell } from "./exportData";
import type { SavedFile } from "./downloadFile";
import { NAME_READINGS, type NameReading } from "./nameLanguage";
import type { NameRow } from "./nameLanguageReport";

export interface NameKindSummary {
  readonly kind: string;
  /** Places of this kind that have a name. */
  readonly total: number;
  readonly byReading: Readonly<Record<NameReading, number>>;
  /** Places of this kind whose name and address point to different languages. */
  readonly differs: number;
}

/** The readings that get a column: every reading but "no-name", since a place with no name is not counted. */
export const KIND_COLUMNS: readonly NameReading[] = NAME_READINGS.filter((r) => r !== "no-name");

const emptyByReading = (): Record<NameReading, number> => Object.fromEntries(NAME_READINGS.map((r) => [r, 0])) as Record<NameReading, number>;

export function summariseNameKinds(rows: readonly NameRow[]): NameKindSummary[] {
  const by = new Map<string, { kind: string; total: number; byReading: Record<NameReading, number>; differs: number }>();
  for (const r of rows) {
    if (r.language.reading === "no-name") continue;
    const key = r.kind.toLowerCase();
    const e = by.get(key) ?? { kind: r.kind, total: 0, byReading: emptyByReading(), differs: 0 };
    e.total += 1;
    e.byReading[r.language.reading] += 1;
    if (r.match === "differs") e.differs += 1;
    by.set(key, e);
  }
  return [...by.values()].sort((a, b) => {
    if ((a.kind === "UNKNOWN") !== (b.kind === "UNKNOWN")) return a.kind === "UNKNOWN" ? 1 : -1;
    return b.total - a.total || a.kind.localeCompare(b.kind, "en", { sensitivity: "base" });
  });
}

/** The first `limit` kinds and how many were left out. */
export function topKinds(kinds: readonly NameKindSummary[], limit: number): { shown: NameKindSummary[]; more: number } {
  const n = Math.max(0, Math.floor(limit));
  return { shown: kinds.slice(0, n), more: Math.max(0, kinds.length - n) };
}

export const NAME_KIND_CSV_HEADER = ["kind", "named_places", ...KIND_COLUMNS.map((c) => c.replace("-", "_")), "name_and_address_differ"] as const;

export function nameKindsToCsv(kinds: readonly NameKindSummary[], opts: { bom?: boolean } = {}): string {
  const lines: string[][] = [[...NAME_KIND_CSV_HEADER]];
  for (const k of kinds) lines.push([k.kind, String(k.total), ...KIND_COLUMNS.map((c) => String(k.byReading[c])), String(k.differs)]);
  return (opts.bom ? "\uFEFF" : "") + lines.map((l) => l.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export const nameKindsCsvFile = (kinds: readonly NameKindSummary[], name: string): SavedFile => ({ name, mime: "text/csv;charset=utf-8", content: nameKindsToCsv(kinds, { bom: true }) });
