// Finds times written in a text, such as an exported file, and says how exact each one is and whether it names a time
// zone. It reads text only. It finds the common written forms (an ISO date and time, a date with a time after a space,
// a date alone, a count of milliseconds since 1970); a time in another form is not found, and a number that only
// looks like a count of milliseconds is counted as one.

export type TmPrecision = "millisecond" | "second" | "minute" | "date";
export type TmZone = "utc" | "offset" | "none";

export interface TimeMention {
  text: string;
  index: number;
  precision: TmPrecision;
  zone: TmZone;
  /** The offset written, such as +05:30, for zone "offset". */
  offset?: string;
  form: "iso" | "spaced" | "date" | "epoch";
}

const ISO = /\b(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:?\d{2})?/g;
const SPACED = /\b(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?\b/g;
const DATE = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
const EPOCH = /(?<![\d.])(\d{13})(?![\d.])/g;
// Counts of milliseconds from 2001 to 2100.
const EPOCH_MIN = 978_307_200_000;
const EPOCH_MAX = 4_102_444_800_000;

const validDate = (y: string, m: string, d: string): boolean => {
  const month = Number(m);
  const day = Number(d);
  const year = Number(y);
  if (month < 1 || month > 12 || day < 1) return false;
  const dim = [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 31;
  return day <= dim;
};

/** Every time written in the text, in the order it appears. A time inside a longer time is found once. */
export function findTimes(text: string): TimeMention[] {
  const out: TimeMention[] = [];
  const taken: Array<[number, number]> = [];
  const free = (a: number, b: number): boolean => !taken.some(([x, y]) => a < y && b > x);
  const take = (m: TimeMention): void => {
    out.push(m);
    taken.push([m.index, m.index + m.text.length]);
  };
  for (const m of text.matchAll(ISO)) {
    const [whole, y, mo, d, h, mi, s, frac, zone] = m as unknown as string[];
    if (!validDate(y as string, mo as string, d as string) || Number(h) > 23 || Number(mi) > 59 || (s !== undefined && Number(s) > 59)) continue;
    const precision: TmPrecision = frac !== undefined ? "millisecond" : s !== undefined ? "second" : "minute";
    const z: TmZone = zone === undefined ? "none" : zone === "Z" ? "utc" : "offset";
    take({ text: whole as string, index: m.index ?? 0, precision, zone: z, ...(z === "offset" ? { offset: zone as string } : {}), form: "iso" });
  }
  for (const m of text.matchAll(SPACED)) {
    const [whole, y, mo, d, h, mi, s] = m as unknown as string[];
    const at = m.index ?? 0;
    if (!free(at, at + (whole as string).length)) continue;
    if (!validDate(y as string, mo as string, d as string) || Number(h) > 23 || Number(mi) > 59 || (s !== undefined && Number(s) > 59)) continue;
    take({ text: whole as string, index: at, precision: s !== undefined ? "second" : "minute", zone: "none", form: "spaced" });
  }
  for (const m of text.matchAll(DATE)) {
    const [whole, y, mo, d] = m as unknown as string[];
    const at = m.index ?? 0;
    if (!free(at, at + (whole as string).length)) continue;
    if (!validDate(y as string, mo as string, d as string)) continue;
    take({ text: whole as string, index: at, precision: "date", zone: "none", form: "date" });
  }
  for (const m of text.matchAll(EPOCH)) {
    const at = m.index ?? 0;
    const n = Number(m[1]);
    if (n < EPOCH_MIN || n > EPOCH_MAX || !free(at, at + 13)) continue;
    take({ text: m[1] as string, index: at, precision: "millisecond", zone: "utc", form: "epoch" });
  }
  return out.sort((a, b) => a.index - b.index);
}

const ORDER: readonly TmPrecision[] = ["date", "minute", "second", "millisecond"];

/** The finest precision among the times, or null when there are none. */
export function finestPrecision(mentions: readonly TimeMention[]): TmPrecision | null {
  let best = -1;
  for (const m of mentions) best = Math.max(best, ORDER.indexOf(m.precision));
  return best < 0 ? null : (ORDER[best] as TmPrecision);
}

/** The offsets written in the times, such as +05:30. A time with Z, or with no zone, gives none. */
export function offsetsIn(mentions: readonly TimeMention[]): string[] {
  return [...new Set(mentions.flatMap((m) => (m.offset === undefined ? [] : [m.offset])))].sort();
}

/** How many times there are of each precision. */
export function tallyPrecision(mentions: readonly TimeMention[]): Record<TmPrecision, number> {
  const out: Record<TmPrecision, number> = { millisecond: 0, second: 0, minute: 0, date: 0 };
  for (const m of mentions) out[m.precision]++;
  return out;
}

/** Whether every time in the text that has a time of day is written in UTC (with Z or as a count since 1970). */
export function timesOfDayAreUtc(mentions: readonly TimeMention[]): boolean {
  return mentions.filter((m) => m.precision !== "date").every((m) => m.zone === "utc");
}
