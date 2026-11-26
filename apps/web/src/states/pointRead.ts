/**
 * Reads one pasted location into a point. Nothing is fetched and nothing is sent: it only reads
 * the text. It understands decimal degrees (43.65, -79.38), degrees with N S E W (or O for the
 * French "ouest"), degrees and minutes, degrees minutes and seconds, a geo: link, and a web map
 * link that carries a point. It never guesses between two readings: where a reading is unclear
 * it says what is wrong.
 */
import { type Point, isPoint } from "./packGeo";

export const MAX_POINT_TEXT = 300;

export type PointFormat = "decimal" | "hemisphere" | "dm" | "dms" | "geo-link" | "map-link";

export type PointProblem =
  | "too-long"
  | "no-numbers"
  | "one-number"
  | "number-count"
  | "out-of-range"
  | "bad-minutes"
  | "bad-letters"
  | "sign-and-letter"
  | "mixed-parts"
  | "link-no-point"
  | "stray-text";

export type PointRead =
  | { readonly status: "none" }
  | { readonly status: "invalid"; readonly problem: PointProblem }
  | {
      readonly status: "ok";
      readonly point: Point;
      readonly format: PointFormat;
      /** True when the first number was over 90 and so was read as the longitude. */
      readonly swapped: boolean;
    };

const invalid = (problem: PointProblem): PointRead => ({ status: "invalid", problem });
// Five decimals (about 1 m): the app never writes a coordinate finer than that.
const round5 = (n: number): number => Number(n.toFixed(5));

function ok(lat: number, lon: number, format: PointFormat, swapped = false): PointRead {
  const point = { lat: round5(lat), lon: round5(lon) };
  return isPoint(point) ? { status: "ok", point, format, swapped } : invalid("out-of-range");
}

const NUM = "[+-]?\\d+(?:\\.\\d+)?";

/** A geo: link carries "geo:lat,lon" then optional altitude and parameters. */
function readGeoLink(text: string): PointRead {
  const m = new RegExp(`^geo:\\s*(${NUM})\\s*,\\s*(${NUM})\\s*(?:[,;?].*)?$`, "i").exec(text);
  return m ? ok(Number(m[1]), Number(m[2]), "geo-link") : invalid("link-no-point");
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** A web map link that names a point: "#map=17/lat/lon", "mlat=...&mlon=...", "/@lat,lon,17z", "q=lat,lon" and the like. */
function readMapLink(text: string): PointRead {
  const s = safeDecode(text);
  const patterns: RegExp[] = [
    new RegExp(`[?&#]mlat=(${NUM})&(?:amp;)?mlon=(${NUM})`),
    new RegExp(`[#&?]map=\\d+(?:\\.\\d+)?/(${NUM})/(${NUM})`),
    new RegExp(`/@(${NUM}),(${NUM})`),
    new RegExp(`[?&](?:q|ll|query|center|loc)=(${NUM})\\s*,\\s*(${NUM})(?:[&#]|$)`),
  ];
  for (const p of patterns) {
    const m = p.exec(s);
    if (m) return ok(Number(m[1]), Number(m[2]), "map-link");
  }
  const lonFirst = new RegExp(`[?&#]mlon=(${NUM})&(?:amp;)?mlat=(${NUM})`).exec(s);
  return lonFirst ? ok(Number(lonFirst[2]), Number(lonFirst[1]), "map-link") : invalid("link-no-point");
}

/** Minus signs, degree and minute marks and spaces written in their many forms, as one form each. */
export function normalisePointText(text: string): string {
  return text
    .replace(/[\u2212\u2012\u2013\u2014\ufe63\uff0d]/g, "-")
    .replace(/[\u00b0\u00ba\u02da\u2070]/g, "\u00b0")
    .replace(/[\u2032\u2019\u2018\u02b9\u00b4`']{2}|[\u2033\u201d\u201c\u02ba"]/g, "\u2033")
    .replace(/[\u2032\u2019\u2018\u02b9\u00b4`']/g, "\u2032")
    .replace(/[\s\u00a0\u202f\u2007\u2009\u200b]+/g, " ")
    .trim();
}

const WORDS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(?:NORTH|NORD)\b/g, " N "],
  [/\bSOUTH\b|\bSUD\b/g, " S "],
  [/\bEAST\b|\bEST\b/g, " E "],
  [/\bWEST\b|\bOUEST\b/g, " W "],
];

interface Item {
  readonly kind: "num" | "letter";
  readonly text: string;
}

const TOKEN = /([+-]?\d+(?:[.,]\d+)?)|([NSEWO])|[\u00b0\u2032\u2033 ,;:=()/]/g;

function tokenise(upper: string): Item[] | null {
  const out: Item[] = [];
  let last = 0;
  for (const m of upper.matchAll(TOKEN)) {
    if (m.index !== last) return null;
    last = m.index + m[0].length;
    if (m[1] !== undefined) out.push({ kind: "num", text: m[1] });
    else if (m[2] !== undefined) out.push({ kind: "letter", text: m[2] });
  }
  return last === upper.length ? out : null;
}

const toNumber = (t: string): number => Number(t.replace(",", "."));
const intDigitsOk = (t: string): boolean => t.replace(/^[+-]/, "").split(/[.,]/)[0]!.length <= 3;

/** Degrees, minutes, seconds of one coordinate to a number, or a problem. */
function parts(nums: readonly string[]): { value: number; count: number } | PointProblem {
  if (nums.length < 1 || nums.length > 3) return "number-count";
  if (nums.some((n) => !intDigitsOk(n))) return "out-of-range";
  const [d, m, s] = nums.map((n) => Math.abs(toNumber(n))) as [number, number | undefined, number | undefined];
  if (nums.length > 1) {
    if (!/^[+-]?\d+$/.test(nums[0]!)) return "bad-minutes";
    if (m! >= 60) return "bad-minutes";
    if (nums.length === 3) {
      if (!/^[+-]?\d+$/.test(nums[1]!) || s! >= 60) return "bad-minutes";
    }
  }
  return { value: d + (m ?? 0) / 60 + (s ?? 0) / 3600, count: nums.length };
}

const formatOf = (count: number, withLetters: boolean): PointFormat => (count === 1 ? (withLetters ? "hemisphere" : "decimal") : count === 2 ? "dm" : "dms");

function readLetters(items: readonly Item[]): PointRead {
  const letters = items.filter((i) => i.kind === "letter").map((i) => i.text);
  if (letters.length !== 2) return invalid("bad-letters");
  const axis = (l: string): "lat" | "lon" => (l === "N" || l === "S" ? "lat" : "lon");
  if (axis(letters[0]!) === axis(letters[1]!)) return invalid("bad-letters");
  const before = items[0]!.kind === "letter";
  const chunks: { letter: string; nums: string[] }[] = [];
  let pending: string[] = [];
  let current: { letter: string; nums: string[] } | null = null;
  for (const it of items) {
    if (before) {
      if (it.kind === "letter") {
        current = { letter: it.text, nums: [] };
        chunks.push(current);
      } else current!.nums.push(it.text);
    } else if (it.kind === "num") pending.push(it.text);
    else {
      chunks.push({ letter: it.text, nums: pending });
      pending = [];
    }
  }
  if (pending.length > 0) return invalid("bad-letters");
  if (chunks.some((c) => c.nums.length === 0)) return invalid("bad-letters");
  if (chunks.some((c) => c.nums.some((n) => n.startsWith("-")))) return invalid("sign-and-letter");
  const read = chunks.map((c) => ({ c, p: parts(c.nums) }));
  for (const r of read) if (typeof r.p === "string") return invalid(r.p);
  const [a, b] = read as { c: { letter: string }; p: { value: number; count: number } }[];
  if (a!.p.count !== b!.p.count) return invalid("mixed-parts");
  const signed = (r: { c: { letter: string }; p: { value: number } }): number => (r.c.letter === "S" || r.c.letter === "W" || r.c.letter === "O" ? -r.p.value : r.p.value);
  const [latR, lonR] = axis(a!.c.letter) === "lat" ? [a!, b!] : [b!, a!];
  return ok(signed(latR), signed(lonR), formatOf(a!.p.count, true));
}

function readNumbers(items: readonly Item[], lonFirst: boolean | null): PointRead {
  const nums = items.map((i) => i.text);
  if (nums.length === 0) return invalid("no-numbers");
  if (nums.length === 1) return invalid("one-number");
  if (nums.length !== 2 && nums.length !== 4 && nums.length !== 6) return invalid("number-count");
  const half = nums.length / 2;
  const first = nums.slice(0, half);
  const second = nums.slice(half);
  const pa = parts(first);
  const pb = parts(second);
  if (typeof pa === "string") return invalid(pa);
  if (typeof pb === "string") return invalid(pb);
  // A minus sign belongs to the whole coordinate, so -79 22 is -79 degrees 22 minutes, not -78 38.
  const sign = (n: readonly string[]): number => (n[0]!.startsWith("-") ? -1 : 1);
  const a = sign(first) * pa.value;
  const b = sign(second) * pb.value;
  const format = formatOf(pa.count, false);
  if (lonFirst === true) return ok(b, a, format);
  if (lonFirst === null && Math.abs(a) > 90 && Math.abs(b) <= 90) return ok(b, a, format, true);
  return ok(a, b, format);
}

/** Words such as "latitude" and "lon" say which number is which, whichever comes first. */
function stripLabels(text: string): { text: string; lonFirst: boolean | null } {
  const re = /\b(LAT(?:ITUDE)?|LON(?:G(?:ITUDE)?)?|LNG)\b/g;
  const found = [...text.matchAll(re)].map((m) => (m[1]!.startsWith("LA") ? "lat" : "lon"));
  if (found.length === 0) return { text, lonFirst: null };
  const stripped = text.replace(re, " ");
  if (found.length !== 2 || found[0] === found[1]) return { text: stripped, lonFirst: null };
  return { text: stripped, lonFirst: found[0] === "lon" };
}

/** Reads one pasted location. An empty text is "none"; anything unclear is invalid with the reason. */
export function readPoint(input: string): PointRead {
  const raw = input.trim();
  if (raw === "") return { status: "none" };
  if (raw.length > MAX_POINT_TEXT) return invalid("too-long");
  if (/^geo:/i.test(raw)) return readGeoLink(raw);
  if (/^https?:\/\//i.test(raw)) return readMapLink(raw);
  let upper = normalisePointText(raw).toUpperCase();
  for (const [re, letter] of WORDS) upper = upper.replace(re, letter);
  const labelled = stripLabels(upper);
  const items = tokenise(labelled.text);
  if (items === null) return invalid("stray-text");
  if (items.some((i) => i.kind === "letter")) {
    if (labelled.lonFirst !== null) return invalid("bad-letters");
    return readLetters(items);
  }
  return readNumbers(items, labelled.lonFirst);
}
