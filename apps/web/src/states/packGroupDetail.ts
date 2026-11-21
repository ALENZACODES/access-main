/**
 * Narrowing a difference down to places. After two devices find that some groups differ (see
 * packFingerprintCompare.ts), each can copy a detail code for those groups: one short hash per
 * place, next to the place id. Pasting the other device's detail code shows which ids are only on
 * one device and which are on both with different details.
 *
 *   PACKGRP v1 g=3a n=5
 *   <8 hex>=<id> <8 hex>=<id> ... (four to a line)
 *   k=<8 hex>
 *
 * The code holds place ids and hashes. It holds no name, note, address or location. A detail
 * code is made only for the groups that differ, and only up to MAX_DETAIL_ENTRIES places.
 */
import { canonicalLine } from "./packCanonical";
import { BUCKET_KEYS, type BucketKey, bucketOf } from "./packFingerprint";
import type { PackPlaceRecord } from "./packPlaces";
import { sha256Hex } from "./sha256";

export const DETAIL_TAG = "PACKGRP";
export const DETAIL_VERSION = "v1";
export const MAX_DETAIL_ENTRIES = 1000;
export const MAX_DETAIL_CHARS = 80_000;
const ENTRY_HEX = 8;
const CHECK_HEX = 8;
const MAX_ID = 200;

export type DetailProblem = "empty" | "too-long" | "not-a-code" | "unsupported-version" | "malformed" | "incomplete" | "typo";

export interface DetailEntry {
  readonly id: string;
  readonly hash: string;
}

export interface DetailCode {
  readonly groups: readonly BucketKey[];
  readonly entries: readonly DetailEntry[];
}

export type MadeDetail =
  | { readonly ok: true; readonly code: string; readonly entries: number }
  | { readonly ok: false; readonly problem: "no-groups" | "too-many"; readonly entries: number };

export type ParsedDetail =
  | { readonly ok: true; readonly detail: DetailCode }
  | { readonly ok: false; readonly problem: DetailProblem; readonly token?: string };

const sortKeys = (keys: Iterable<BucketKey>): BucketKey[] => [...new Set(keys)].sort((a, b) => BUCKET_KEYS.indexOf(a) - BUCKET_KEYS.indexOf(b));
const check = (tokens: readonly string[]): string => sha256Hex(tokens.join(" ")).slice(0, CHECK_HEX);

/** One hash per place in the given groups, ordered by id, so the same places give the same entries on any device. */
export function detailEntries(places: readonly PackPlaceRecord[], groups: readonly BucketKey[]): DetailEntry[] {
  const keep = new Set(groups);
  return places
    .filter((p) => keep.has(bucketOf(p.id)))
    .map((p) => ({ id: p.id, hash: sha256Hex(canonicalLine(p)).slice(0, ENTRY_HEX) }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function bodyTokens(groups: readonly BucketKey[], entries: readonly DetailEntry[]): string[] {
  return [DETAIL_TAG, DETAIL_VERSION, `g=${groups.join("")}`, `n=${entries.length}`, ...entries.map((e) => `${e.hash}=${e.id}`)];
}

/** The code for the groups. Refused, with the count, when there are no groups or too many places to list. */
export function makeDetailCode(places: readonly PackPlaceRecord[], groups: readonly BucketKey[]): MadeDetail {
  const keys = sortKeys(groups);
  if (keys.length === 0) return { ok: false, problem: "no-groups", entries: 0 };
  const entries = detailEntries(places, keys);
  if (entries.length > MAX_DETAIL_ENTRIES) return { ok: false, problem: "too-many", entries: entries.length };
  const tokens = bodyTokens(keys, entries);
  const lines = [tokens.slice(0, 4).join(" ")];
  const rows = tokens.slice(4);
  for (let i = 0; i < rows.length; i += 4) lines.push(rows.slice(i, i + 4).join(" "));
  lines.push(`k=${check(tokens)}`);
  return { ok: true, code: lines.join("\n"), entries: entries.length };
}

/** Read a pasted detail code. Letter case and spacing do not matter; nothing is repaired. */
export function parseDetailCode(input: string): ParsedDetail {
  if (input.trim() === "") return { ok: false, problem: "empty" };
  if (input.length > MAX_DETAIL_CHARS) return { ok: false, problem: "too-long" };
  const tokens = input.trim().split(/\s+/);
  if (tokens[0]!.toUpperCase() !== DETAIL_TAG) return { ok: false, problem: "not-a-code", token: tokens[0]!.slice(0, 24) };
  if (tokens[1]?.toLowerCase() !== DETAIL_VERSION) return { ok: false, problem: "unsupported-version", ...(tokens[1] ? { token: tokens[1].slice(0, 24) } : {}) };

  let g: string | null = null;
  let n: string | null = null;
  let k: string | null = null;
  const entries: DetailEntry[] = [];
  for (const raw of tokens.slice(2)) {
    const eq = raw.indexOf("=");
    if (eq < 1) return { ok: false, problem: "malformed", token: raw.slice(0, 24) };
    const key = raw.slice(0, eq);
    const value = raw.slice(eq + 1);
    const lower = key.toLowerCase();
    if (lower === "g" || lower === "n" || lower === "k") {
      const seen = lower === "g" ? g : lower === "n" ? n : k;
      if (seen !== null) return { ok: false, problem: "malformed", token: lower };
      if (lower === "g") g = value.toLowerCase();
      else if (lower === "n") n = value;
      else k = value.toLowerCase();
    } else if (/^[0-9a-f]{8}$/i.test(key) && value.length > 0 && value.length <= MAX_ID) {
      entries.push({ hash: key.toLowerCase(), id: value });
    } else return { ok: false, problem: "malformed", token: raw.slice(0, 24) };
  }
  if (g === null || n === null || k === null) return { ok: false, problem: "incomplete" };
  if (!/^[0-9a-f]{1,16}$/.test(g)) return { ok: false, problem: "malformed", token: "g" };
  const groups = [...g] as BucketKey[];
  if (new Set(groups).size !== groups.length || sortKeys(groups).join("") !== g) return { ok: false, problem: "malformed", token: "g" };
  if (!/^\d{1,5}$/.test(n) || Number(n) > MAX_DETAIL_ENTRIES) return { ok: false, problem: "malformed", token: `n=${n.slice(0, 8)}` };
  if (!/^[0-9a-f]{8}$/.test(k) || check(bodyTokens(groups, entries).map((t, i) => (i === 3 ? `n=${n}` : t))) !== k) return { ok: false, problem: "typo" };
  // Past a correct check, a code this App did not make can still be wrong in its own terms.
  if (entries.length !== Number(n)) return { ok: false, problem: "malformed", token: "n" };
  const ids = new Set<string>();
  for (const e of entries) {
    if (ids.has(e.id)) return { ok: false, problem: "malformed", token: e.id.slice(0, 24) };
    ids.add(e.id);
    if (!groups.includes(bucketOf(e.id))) return { ok: false, problem: "malformed", token: e.id.slice(0, 24) };
  }
  return { ok: true, detail: { groups, entries } };
}

export interface DetailComparison {
  readonly groups: readonly BucketKey[];
  /** Places on both devices with the same details. */
  readonly same: number;
  /** Ids on this device and not in the other code. */
  readonly onlyHere: readonly string[];
  /** Ids in the other code and not on this device. */
  readonly onlyThere: readonly string[];
  /** Ids on both devices whose details differ. */
  readonly changed: readonly string[];
}

/** Compare this device's places, in the groups the other code covers, with that code. */
export function compareDetail(places: readonly PackPlaceRecord[], there: DetailCode): DetailComparison {
  const here = new Map(detailEntries(places, there.groups).map((e) => [e.id, e.hash] as const));
  const other = new Map(there.entries.map((e) => [e.id, e.hash] as const));
  const onlyHere: string[] = [];
  const onlyThere: string[] = [];
  const changed: string[] = [];
  let same = 0;
  for (const [id, hash] of here) {
    const o = other.get(id);
    if (o === undefined) onlyHere.push(id);
    else if (o !== hash) changed.push(id);
    else same += 1;
  }
  for (const id of other.keys()) if (!here.has(id)) onlyThere.push(id);
  const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return { groups: there.groups, same, onlyHere: onlyHere.sort(order), onlyThere: onlyThere.sort(order), changed: changed.sort(order) };
}
