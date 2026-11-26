/**
 * The elevator notices a person sees for a search, an age filter and a sort, grouped by station.
 * Everything is worked out from the notices on this device and a `today` the caller supplies.
 */
import { type NoticeAge, type ElevatorAgeBand, ELEVATOR_AGE_BANDS, noticeAge } from "./elevatorAge";
import { type NoticeReading, readNotice } from "./elevatorRead";
import type { ElevatorNotice } from "./packElevators";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

export type ElevatorSort = "station" | "oldest" | "newest";
export const ELEVATOR_SORTS: readonly ElevatorSort[] = ["station", "oldest", "newest"];
export function isElevatorSort(v: unknown): v is ElevatorSort {
  return typeof v === "string" && (ELEVATOR_SORTS as readonly string[]).includes(v);
}

export interface ElevatorQuery {
  readonly text: string;
  /** "all" or one age band. */
  readonly band: ElevatorAgeBand | "all";
  readonly sort: ElevatorSort;
}

export const EMPTY_ELEVATOR_QUERY: ElevatorQuery = { text: "", band: "all", sort: "station" };

export interface NoticeRow {
  readonly notice: ElevatorNotice;
  readonly reading: NoticeReading;
  readonly age: NoticeAge;
}

export interface StationGroup {
  /** The name to show: the first spelling seen. "" when the pack gives no station name. */
  readonly station: string;
  readonly rows: readonly NoticeRow[];
}

export interface ElevatorView {
  readonly groups: readonly StationGroup[];
  readonly shown: number;
  readonly total: number;
  /** How many notices of the total fall in each age band, before any search or filter. */
  readonly bandCounts: Readonly<Record<ElevatorAgeBand, number>>;
  readonly announcement: string;
}

/** Lower case, no accents, single spaces: so "Édifice" is found by "edifice" and "PAPE  ave" by "pape ave". */
export function foldNoticeText(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function haystack(row: NoticeRow): string {
  const n = row.notice;
  return foldNoticeText([n.station ?? "", n.text ?? "", n.id, n.stopIds.join(" "), row.reading.elevator ?? "", row.reading.between ?? ""].join(" "));
}

/** Every word of the search must be somewhere in the notice. */
export function matchesSearch(row: NoticeRow, text: string): boolean {
  const words = foldNoticeText(text).split(" ").filter((w) => w !== "");
  if (words.length === 0) return true;
  const h = haystack(row);
  return words.every((w) => h.includes(w));
}

export function rowsFor(notices: readonly ElevatorNotice[], today: string): NoticeRow[] {
  return notices.map((notice) => ({ notice, reading: readNotice(notice), age: noticeAge(notice, today) }));
}

const collator = (locale: Locale): Intl.Collator => new Intl.Collator(locale === "fr" ? "fr-CA" : "en-CA", { numeric: true, sensitivity: "base" });

/** Day of the check as a sortable number, or null. */
const checkedMs = (r: NoticeRow): number | null => {
  if (r.notice.checkedAt === null) return null;
  const ms = Date.parse(r.notice.checkedAt);
  return Number.isFinite(ms) ? ms : null;
};

function groupKey(station: string | null): string {
  return station === null ? "" : foldNoticeText(station);
}

export function viewElevators(notices: readonly ElevatorNotice[], query: ElevatorQuery, today: string, locale: Locale): ElevatorView {
  const all = rowsFor(notices, today);
  const bandCounts = Object.fromEntries(ELEVATOR_AGE_BANDS.map((b) => [b, 0])) as Record<ElevatorAgeBand, number>;
  for (const r of all) bandCounts[r.age.band]++;
  const kept = all.filter((r) => (query.band === "all" || r.age.band === query.band) && matchesSearch(r, query.text));

  const byStation = new Map<string, { station: string; rows: NoticeRow[] }>();
  for (const r of kept) {
    const key = groupKey(r.notice.station);
    const g = byStation.get(key);
    if (g) g.rows.push(r);
    else byStation.set(key, { station: r.notice.station ?? "", rows: [r] });
  }
  const c = collator(locale);
  const inGroup = (a: NoticeRow, b: NoticeRow): number => {
    const ma = checkedMs(a);
    const mb = checkedMs(b);
    if (ma !== null && mb !== null && ma !== mb) return query.sort === "newest" ? mb - ma : ma - mb;
    if ((ma === null) !== (mb === null)) return ma === null ? 1 : -1;
    return c.compare(a.notice.id, b.notice.id);
  };
  const groups = [...byStation.values()].map((g) => ({ station: g.station, rows: [...g.rows].sort(inGroup) }));
  const edge = (g: StationGroup): number | null => (g.rows.length === 0 ? null : checkedMs(g.rows[0]!));
  groups.sort((a, b) => {
    if (query.sort !== "station") {
      const ea = query.sort === "newest" ? newestMs(a) : edge(a);
      const eb = query.sort === "newest" ? newestMs(b) : edge(b);
      if (ea !== null && eb !== null && ea !== eb) return query.sort === "newest" ? eb - ea : ea - eb;
      if ((ea === null) !== (eb === null)) return ea === null ? 1 : -1;
    }
    if (a.station === "" || b.station === "") return a.station === "" ? (b.station === "" ? 0 : 1) : -1;
    return c.compare(a.station, b.station);
  });
  const shown = kept.length;
  return { groups, shown, total: all.length, bandCounts, announcement: announce(shown, all.length, locale) };
}

function newestMs(g: StationGroup): number | null {
  let best: number | null = null;
  for (const r of g.rows) {
    const ms = checkedMs(r);
    if (ms !== null && (best === null || ms > best)) best = ms;
  }
  return best;
}

export function announce(shown: number, total: number, locale: Locale): string {
  if (total === 0) return t(locale, "No elevator notices are saved.", "Aucun avis d’ascenseur n’est enregistré.");
  if (shown === 0) return t(locale, `No notices match. ${total} saved.`, `Aucun avis ne correspond. ${total} enregistré${total === 1 ? "" : "s"}.`);
  if (shown === total) return t(locale, `${total} ${total === 1 ? "notice" : "notices"} shown.`, `${total} ${total === 1 ? "avis affiché" : "avis affichés"}.`);
  return t(locale, `${shown} of ${total} notices shown.`, `${shown} avis affichés sur ${total}.`);
}
