/**
 * A point written out in the forms people use, so it can be read aloud, typed into another
 * program or checked against a pasted one. Every form here can be read back by `readPoint`.
 */
import { geoUri } from "./geo";
import type { Point } from "./packGeo";
import type { Locale } from "./stateCopy";

export const POINT_STYLES = ["decimal", "hemisphere", "dm", "dms", "geo"] as const;
export type PointStyle = (typeof POINT_STYLES)[number];
export const isPointStyle = (v: unknown): v is PointStyle => (POINT_STYLES as readonly unknown[]).includes(v);

const NNBSP = "\u202f";
const DEG = "°";
const MIN = "′";
const SEC = "″";

/** A decimal point in English, a comma in French. */
const num = (n: string, locale: Locale): string => (locale === "fr" ? n.replace(".", ",") : n);

/** Degrees, whole minutes and seconds of a non-negative value; seconds are rounded and carried so none reaches 60. */
export function splitDms(value: number, secondDecimals = 2): { deg: number; min: number; sec: number } {
  const abs = Math.abs(value);
  const scale = 10 ** secondDecimals;
  let total = Math.round(abs * 3600 * scale);
  const sec = (total % (60 * scale)) / scale;
  total = Math.floor(total / (60 * scale));
  return { deg: Math.floor(total / 60), min: total % 60, sec };
}

/** Degrees and minutes of a non-negative value; minutes are rounded and carried so none reaches 60. */
export function splitDm(value: number, minuteDecimals = 4): { deg: number; min: number } {
  const abs = Math.abs(value);
  const scale = 10 ** minuteDecimals;
  const total = Math.round(abs * 60 * scale);
  return { deg: Math.floor(total / (60 * scale)), min: (total % (60 * scale)) / scale };
}

const letters = (p: Point, locale: Locale): { ns: string; ew: string } => ({
  ns: p.lat < 0 ? "S" : "N",
  ew: p.lon < 0 ? (locale === "fr" ? "O" : "W") : "E",
});

/**
 * "43.65000, -79.38000"; "43.65000° N, 79.38000° W"; "43° 39.0000′ N, 79° 22.8000′ W";
 * "43° 39′ 0.00″ N, 79° 22′ 48.00″ W"; "geo:43.65000,-79.38000". French uses a decimal comma,
 * a narrow no-break space before the semicolon and O for ouest.
 */
export function formatPointAs(p: Point, style: PointStyle, locale: Locale): string {
  if (style === "geo") return geoUri(p);
  const sep = locale === "fr" ? `${NNBSP}; ` : ", ";
  if (style === "decimal") return `${num(p.lat.toFixed(5), locale)}${sep}${num(p.lon.toFixed(5), locale)}`;
  const { ns, ew } = letters(p, locale);
  if (style === "hemisphere") return `${num(Math.abs(p.lat).toFixed(5), locale)}${DEG} ${ns}${sep}${num(Math.abs(p.lon).toFixed(5), locale)}${DEG} ${ew}`;
  if (style === "dm") {
    const a = splitDm(p.lat);
    const b = splitDm(p.lon);
    return `${a.deg}${DEG} ${num(a.min.toFixed(4), locale)}${MIN} ${ns}${sep}${b.deg}${DEG} ${num(b.min.toFixed(4), locale)}${MIN} ${ew}`;
  }
  const a = splitDms(p.lat);
  const b = splitDms(p.lon);
  return `${a.deg}${DEG} ${a.min}${MIN} ${num(a.sec.toFixed(2), locale)}${SEC} ${ns}${sep}${b.deg}${DEG} ${b.min}${MIN} ${num(b.sec.toFixed(2), locale)}${SEC} ${ew}`;
}
