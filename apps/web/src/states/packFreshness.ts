/**
 * How old the retrieval dates of a stored pack's records are, worded so it never claims the data
 * is current. Reading only: it works from the records on this device, offline.
 *
 * Age is counted from each record's own retrieval date to a `today` the caller supplies, so the
 * result is the same on every device for the same inputs. A record with no usable source has no
 * date and is counted apart. A date in the future is reported as such, never as fresh.
 */
import type { PackPlaceRecord } from "./packPlaces";
import { STALE_AFTER_DAYS, daysBetween, formatDate } from "./provenance";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

/** Upper bounds, in days, of the age buckets. The last bucket is everything older. */
export const AGE_BUCKET_LIMITS = [30, 90, STALE_AFTER_DAYS] as const;
export type AgeBucketId = "within-30" | "within-90" | "within-year" | "older" | "future";

export const AGE_BUCKET_IDS: readonly AgeBucketId[] = ["within-30", "within-90", "within-year", "older", "future"];

export function ageBucket(days: number): AgeBucketId {
  if (days < 0) return "future";
  if (days <= AGE_BUCKET_LIMITS[0]) return "within-30";
  if (days <= AGE_BUCKET_LIMITS[1]) return "within-90";
  if (days <= AGE_BUCKET_LIMITS[2]) return "within-year";
  return "older";
}

/**
 * none: nothing to say. aging: some records are older than a quarter. stale: most records are
 * older than the stale limit. no-dates: the pack has records but none has a usable date.
 */
export type FreshnessLevel = "empty" | "no-dates" | "recent" | "aging" | "stale";

export interface Freshness {
  readonly total: number;
  readonly dated: number;
  readonly undated: number;
  readonly buckets: Readonly<Record<AgeBucketId, number>>;
  readonly oldest: string | null;
  readonly newest: string | null;
  readonly oldestDays: number | null;
  readonly newestDays: number | null;
  /** Records older than the stale limit. A future date is not stale. */
  readonly staleRecords: number;
  readonly level: FreshnessLevel;
}

function levelOf(total: number, dated: number, stale: number, olderThanQuarter: number): FreshnessLevel {
  if (total === 0) return "empty";
  if (dated === 0) return "no-dates";
  if (stale * 2 > dated) return "stale";
  if (olderThanQuarter > 0) return "aging";
  return "recent";
}

export function computeFreshness(places: readonly Pick<PackPlaceRecord, "provenance">[], today: string): Freshness {
  const buckets: Record<AgeBucketId, number> = { "within-30": 0, "within-90": 0, "within-year": 0, older: 0, future: 0 };
  let oldest: string | null = null;
  let newest: string | null = null;
  let dated = 0;
  for (const p of places) {
    const prov = p.provenance;
    if (!prov) continue;
    dated += 1;
    buckets[ageBucket(daysBetween(prov.retrievedOn, today))] += 1;
    if (oldest === null || prov.retrievedOn < oldest) oldest = prov.retrievedOn;
    if (newest === null || prov.retrievedOn > newest) newest = prov.retrievedOn;
  }
  const staleRecords = buckets.older;
  return {
    total: places.length,
    dated,
    undated: places.length - dated,
    buckets,
    oldest,
    newest,
    oldestDays: oldest === null ? null : daysBetween(oldest, today),
    newestDays: newest === null ? null : daysBetween(newest, today),
    staleRecords,
    level: levelOf(places.length, dated, staleRecords, buckets["within-year"] + buckets.older),
  };
}

const BUCKET_TEXT: Readonly<Record<AgeBucketId, { en: string; fr: string }>> = {
  "within-30": { en: "retrieved within 30 days", fr: "consultés il y a 30 jours ou moins" },
  "within-90": { en: "retrieved 31 to 90 days ago", fr: "consultés il y a 31 à 90 jours" },
  "within-year": { en: `retrieved 91 to ${STALE_AFTER_DAYS} days ago`, fr: `consultés il y a 91 à ${STALE_AFTER_DAYS} jours` },
  older: { en: `retrieved more than ${STALE_AFTER_DAYS} days ago`, fr: `consultés il y a plus de ${STALE_AFTER_DAYS} jours` },
  future: { en: "with a retrieval date in the future", fr: "dont la date de consultation est dans le futur" },
};

export function bucketLines(f: Freshness, locale: Locale): string[] {
  return AGE_BUCKET_IDS.filter((id) => f.buckets[id] > 0).map((id) => `${f.buckets[id]} ${BUCKET_TEXT[id][locale]}`);
}

/** One sentence the person can read at a glance. It reports dates and does not claim the data is current. */
export function freshnessSummary(f: Freshness, locale: Locale): string {
  switch (f.level) {
    case "empty":
      return t(locale, "No places in the pack on this device.", "Aucun lieu dans le pack sur cet appareil.");
    case "no-dates":
      return t(locale, "None of the places in the pack has a usable retrieval date, so their age is UNKNOWN.", "Aucun lieu du pack n’a de date de consultation utilisable\u00a0: leur ancienneté est UNKNOWN.");
    case "recent":
      return t(locale, `Every dated place was retrieved within the last ${STALE_AFTER_DAYS} days. That says when it was retrieved, not that it is still right.`, `Chaque lieu daté a été consulté au cours des ${STALE_AFTER_DAYS} derniers jours. Cela indique quand il a été consulté, pas qu’il est toujours exact.`);
    case "aging":
      return t(locale, "Some places were retrieved a while ago. Details may have changed since.", "Certains lieux ont été consultés il y a un certain temps. Les renseignements ont pu changer depuis.");
    case "stale":
      return t(locale, `Most places were retrieved more than ${STALE_AFTER_DAYS} days ago and may be out of date.`, `La plupart des lieux ont été consultés il y a plus de ${STALE_AFTER_DAYS} jours et peuvent être périmés.`);
  }
}

/** The range of retrieval dates as one line, or null with no dated record. */
export function rangeLine(f: Freshness, locale: Locale): string | null {
  if (f.oldest === null || f.newest === null) return null;
  return f.oldest === f.newest
    ? t(locale, `All retrieved ${formatDate(f.oldest, locale)}.`, `Tous consultés le ${formatDate(f.oldest, locale)}.`)
    : t(locale, `Retrieved between ${formatDate(f.oldest, locale)} and ${formatDate(f.newest, locale)}.`, `Consultés entre le ${formatDate(f.oldest, locale)} et le ${formatDate(f.newest, locale)}.`);
}

/** The undated records, as one line, or null when every record is dated. */
export function undatedLine(f: Freshness, locale: Locale): string | null {
  if (f.undated === 0 || f.total === 0) return null;
  return t(
    locale,
    `${f.undated} ${f.undated === 1 ? "place has" : "places have"} no usable source, so no date.`,
    `${f.undated} ${f.undated === 1 ? "lieu n’a" : "lieux n’ont"} aucune source utilisable, donc aucune date.`,
  );
}

/** Everything as lines of plain text, in reading order. */
export function freshnessLines(f: Freshness, locale: Locale): string[] {
  const lines = [freshnessSummary(f, locale)];
  const range = rangeLine(f, locale);
  if (range) lines.push(range);
  lines.push(...bucketLines(f, locale));
  const undated = undatedLine(f, locale);
  if (undated) lines.push(undated);
  return lines;
}
