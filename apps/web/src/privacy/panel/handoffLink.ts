// Reads a link that opens another app and says, in plain fields, what it carries: who an email is for and how long
// its text is, which digits a phone link dials, which place a map link points at and how precisely. It is how the
// audits check that the text the App really builds matches what handoffRegister.ts says it passes on, and it can
// be used to show a person what a link will hand over before they tap it. It reads the link as written; it never
// opens it, and it keeps the text of an email only as a length and a line count.

export const MAX_LINK_LENGTH = 2000;

export type LinkProblem = "empty" | "too-long" | "bad-character" | "no-scheme" | "unknown-scheme" | "bad-encoding" | "bad-address" | "bad-number" | "out-of-range" | "bad-parameter";

export type LinkDescription =
  | { kind: "mailto"; to: string[]; cc: string[]; bcc: string[]; subject: string | null; bodyChars: number; bodyLines: number; otherFields: string[] }
  | { kind: "tel"; digits: string; plus: boolean; extension: string | null }
  | { kind: "geo"; lat: number; lon: number; decimals: number; altitude: number | null; uncertainty: number | null }
  | { kind: "sms"; to: string[]; bodyChars: number };

export type LinkResult = { ok: true; link: LinkDescription } | { ok: false; problem: LinkProblem; detail?: string };

const fail = (problem: LinkProblem, detail?: string): LinkResult => (detail === undefined ? { ok: false, problem } : { ok: false, problem, detail });

/** The link's own text, percent-decoded, or null when the encoding is broken. A plus sign stays a plus sign. */
function decode(text: string): string | null {
  try {
    return decodeURIComponent(text);
  } catch {
    return null;
  }
}

/** Splits "a=b&c=d" into pairs with the names in lower case and the values decoded. Null when a value cannot be decoded. */
function pairs(query: string): Array<[string, string]> | null {
  const out: Array<[string, string]> = [];
  for (const part of query.split("&")) {
    if (part === "") continue;
    const i = part.indexOf("=");
    const name = decode(i === -1 ? part : part.slice(0, i));
    const value = decode(i === -1 ? "" : part.slice(i + 1));
    if (name === null || value === null) return null;
    out.push([name.toLowerCase(), value]);
  }
  return out;
}

const ADDRESS_RE = /^[^\s@,;<>()[\]\\"]+@[^\s@,;<>()[\]\\"]+$/;

/** Addresses in a comma-separated list, or the first address that is not well formed. */
function addresses(list: string): { ok: true; list: string[] } | { ok: false; bad: string } {
  const out: string[] = [];
  for (const raw of list.split(",")) {
    const a = raw.trim();
    if (a === "") continue;
    if (!ADDRESS_RE.test(a)) return { ok: false, bad: a };
    out.push(a);
  }
  return { ok: true, list: out };
}

const countLines = (text: string): number => (text === "" ? 0 : text.split(/\r\n|\r|\n/).length);
const chars = (text: string): number => [...text].length;

function mailto(rest: string): LinkResult {
  const q = rest.indexOf("?");
  const addr = decode(q === -1 ? rest : rest.slice(0, q));
  if (addr === null) return fail("bad-encoding");
  const to = addresses(addr);
  if (!to.ok) return fail("bad-address", to.bad);
  const fields = q === -1 ? [] : pairs(rest.slice(q + 1));
  if (fields === null) return fail("bad-encoding");
  const link: Extract<LinkDescription, { kind: "mailto" }> = { kind: "mailto", to: to.list, cc: [], bcc: [], subject: null, bodyChars: 0, bodyLines: 0, otherFields: [] };
  for (const [name, value] of fields) {
    if (name === "to" || name === "cc" || name === "bcc") {
      const a = addresses(value);
      if (!a.ok) return fail("bad-address", a.bad);
      link[name].push(...a.list);
    } else if (name === "subject") link.subject = value;
    else if (name === "body") {
      link.bodyChars += chars(value);
      link.bodyLines += countLines(value);
    } else if (!link.otherFields.includes(name)) link.otherFields.push(name);
  }
  return { ok: true, link };
}

function tel(rest: string): LinkResult {
  const [number = "", ...params] = rest.split(";");
  if (!/^\+?[0-9().-]+$/.test(number)) return fail("bad-number", number);
  const digits = number.replace(/\D/g, "");
  if (digits.length < 3 || digits.length > 15) return fail("bad-number", String(digits.length));
  let extension: string | null = null;
  for (const p of params) {
    const m = /^(?:ext|postd)=([0-9*#.()-]+)$/i.exec(p);
    if (m !== null) extension = (m[1] ?? "").replace(/[^0-9*#]/g, "");
    else if (p !== "") return fail("bad-parameter", p);
  }
  return { ok: true, link: { kind: "tel", digits, plus: number.startsWith("+"), extension } };
}

const NUMBER_RE = /^-?\d+(?:\.\d+)?$/;
const decimalsOf = (text: string): number => (text.split(".")[1] ?? "").length;

function geo(rest: string): LinkResult {
  const [coords = "", ...params] = rest.split(";");
  const parts = coords.split(",");
  if (parts.length < 2 || parts.length > 3 || !parts.every((p) => NUMBER_RE.test(p))) return fail("bad-number", coords);
  const [latText = "", lonText = "", altText] = parts;
  const lat = Number(latText);
  const lon = Number(lonText);
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return fail("out-of-range", coords);
  let uncertainty: number | null = null;
  for (const p of params) {
    const m = /^u=(\d+(?:\.\d+)?)$/i.exec(p);
    if (m !== null) uncertainty = Number(m[1]);
    else if (!/^crs=[A-Za-z0-9-]+$/i.test(p)) return fail("bad-parameter", p);
  }
  return { ok: true, link: { kind: "geo", lat, lon, decimals: Math.max(decimalsOf(latText), decimalsOf(lonText)), altitude: altText === undefined ? null : Number(altText), uncertainty } };
}

function sms(rest: string): LinkResult {
  const q = rest.indexOf("?");
  const numbers = decode(q === -1 ? rest : rest.slice(0, q));
  if (numbers === null) return fail("bad-encoding");
  const to: string[] = [];
  for (const n of numbers.split(/[,;]/)) {
    const t = n.trim();
    if (t === "") continue;
    if (!/^\+?[0-9().-]{3,}$/.test(t)) return fail("bad-number", t);
    to.push(t.replace(/[^0-9+]/g, ""));
  }
  const fields = q === -1 ? [] : pairs(rest.slice(q + 1));
  if (fields === null) return fail("bad-encoding");
  const body = fields.filter(([n]) => n === "body").reduce((sum, [, v]) => sum + chars(v), 0);
  return { ok: true, link: { kind: "sms", to, bodyChars: body } };
}

/** What a link carries, or why it cannot be read. Only mail, phone, text and map links are read. */
export function describeLink(href: string): LinkResult {
  if (href === "") return fail("empty");
  if (href.length > MAX_LINK_LENGTH) return fail("too-long", String(href.length));
  if (/[^\x21-\x7e]/.test(href)) return fail("bad-character");
  const m = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(href);
  if (m === null) return fail("no-scheme");
  const scheme = (m[1] ?? "").toLowerCase();
  const rest = href.slice(m[0].length);
  switch (scheme) {
    case "mailto":
      return mailto(rest);
    case "tel":
      return tel(rest);
    case "geo":
      return geo(rest);
    case "sms":
      return sms(rest);
    default:
      return fail("unknown-scheme", scheme);
  }
}
