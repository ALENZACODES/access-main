// Finds coordinates written in a text, such as an exported file, and says how many decimals each has and how fine
// that is on the ground. It reads text only. It finds the common written forms: a GPX point (lat="…" lon="…"), a geo
// link (geo:lat,lon), a vCard line (GEO:lat;lon), and two decimal numbers next to each other with a comma or a
// semicolon between them, with a point or a comma as the decimal mark. Two numbers next to each other are a pair
// when each has at least two decimals and they fit as latitude and longitude in either order; the order of a
// generic pair is not decided. A coordinate in another form is not found.

export type CoordForm = "gpx" | "geo-uri" | "vcard" | "pair";

export interface CoordMention {
  text: string;
  index: number;
  /** The first and the second number as written. For gpx, geo-uri and vcard the first is the latitude. */
  first: number;
  second: number;
  /** The most decimals in either number. */
  digits: number;
  form: CoordForm;
}

const NUM = String.raw`[+-]?\d{1,3}(?:[.,]\d+)?`;
const GPX = new RegExp(String.raw`\blat="(${NUM})"\s+lon="(${NUM})"`, "g");
const GEO_URI = new RegExp(String.raw`\bgeo:(${NUM}),(${NUM})`, "g");
const VCARD = new RegExp(String.raw`\bGEO:(${NUM});(${NUM})`, "g");
const PAIR = new RegExp(String.raw`(?<![\d.])(?=((${NUM})(?:\s*;\s*|,\s*)(${NUM}))(?!\.\d))`, "g");

const toNumber = (s: string): number => Number(s.replace(",", "."));
const decimals = (s: string): number => (/[.,](\d+)$/.exec(s)?.[1] ?? "").length;

const fits = (a: number, b: number): boolean => (Math.abs(a) <= 90 && Math.abs(b) <= 180) || (Math.abs(a) <= 180 && Math.abs(b) <= 90);

/** Every coordinate in the text, in the order it appears. A number inside a longer match is found once. */
export function findCoordinates(text: string): CoordMention[] {
  const out: CoordMention[] = [];
  const taken: Array<[number, number]> = [];
  const free = (a: number, b: number): boolean => !taken.some(([x, y]) => a < y && b > x);
  const add = (at: number, whole: string, a: string, b: string, form: CoordForm, needTwo: boolean): void => {
    if (!free(at, at + whole.length)) return;
    if (needTwo && (decimals(a) < 2 || decimals(b) < 2)) return;
    const first = toNumber(a);
    const second = toNumber(b);
    if (!fits(first, second)) return;
    out.push({ text: whole, index: at, first, second, digits: Math.max(decimals(a), decimals(b)), form });
    taken.push([at, at + whole.length]);
  };
  const forms: Array<[RegExp, CoordForm]> = [[GPX, "gpx"], [GEO_URI, "geo-uri"], [VCARD, "vcard"]];
  for (const [re, form] of forms) for (const m of text.matchAll(re)) add(m.index ?? 0, m[0], m[1] as string, m[2] as string, form, false);
  for (const m of text.matchAll(PAIR)) add(m.index ?? 0, m[1] as string, m[2] as string, m[3] as string, "pair", true);
  return out.sort((x, y) => x.index - y.index);
}

/** How fine a coordinate with this many decimals is, in metres of latitude. */
export function resolutionMetres(digits: number): number {
  return 111_320 / 10 ** digits;
}

/** The most decimals among the coordinates, or 0 when there are none. */
export function maxDigits(mentions: readonly CoordMention[]): number {
  return mentions.reduce((n, m) => Math.max(n, m.digits), 0);
}

/** How many coordinates have each number of decimals. */
export function tallyDigits(mentions: readonly CoordMention[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const m of mentions) out.set(m.digits, (out.get(m.digits) ?? 0) + 1);
  return new Map([...out.entries()].sort((a, b) => a[0] - b[0]));
}

/** Whether any coordinate in the text is within `metres` of the point, in either order of the pair. */
export function hasPointNear(mentions: readonly CoordMention[], lat: number, lon: number, metres: number): boolean {
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dist = (aLat: number, aLon: number): number => {
    const dLat = toRad(aLat - lat);
    const dLon = (toRad(aLon - lon) * Math.cos(toRad(lat)));
    return 6_371_008.8 * Math.hypot(dLat, dLon);
  };
  return mentions.some((m) => dist(m.first, m.second) <= metres || (m.form === "pair" && dist(m.second, m.first) <= metres));
}
