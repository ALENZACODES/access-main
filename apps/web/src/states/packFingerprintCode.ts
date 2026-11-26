/**
 * The fingerprint as plain text a person can copy to another device and paste back.
 *
 *   PACKFP v1 n=42 ids=<32 hex> all=<32 hex>
 *   0=3:1a2b3c4d 1=2:... (sixteen groups, key=count:hash)
 *   k=<8 hex>
 *
 * `k` is a check on the text itself, so a code cut short or mistyped is refused as a typo rather
 * than compared as if it were a different pack. The code holds counts and hashes. It holds no
 * place names, notes, addresses or anything about the person.
 */
import { BUCKET_HEX, BUCKET_KEYS, type BucketKey, type BucketPrint, type PackFingerprint, WHOLE_HEX } from "./packFingerprint";
import { sha256Hex } from "./sha256";

export const CODE_TAG = "PACKFP";
export const CODE_VERSION = "v1";
export const FINGERPRINT_MAX_CODE_CHARS = 2000;
const MAX_COUNT = 10_000_000;
const CHECK_HEX = 8;

export type CodeProblem = "empty" | "too-long" | "not-a-code" | "unsupported-version" | "malformed" | "incomplete" | "typo";

export type ParsedFingerprintCode =
  | { readonly ok: true; readonly print: PackFingerprint }
  | { readonly ok: false; readonly problem: CodeProblem; /** The part of the text that was refused, when one part can be named. */ readonly token?: string };

const hex = (n: number): RegExp => new RegExp(`^[0-9a-f]{${n}}$`);

function body(print: PackFingerprint): string[] {
  return [CODE_TAG, CODE_VERSION, `n=${print.count}`, `ids=${print.ids}`, `all=${print.all}`, ...print.buckets.map((b) => `${b.key}=${b.count}:${b.hash}`)];
}

const check = (tokens: readonly string[]): string => sha256Hex(tokens.join(" ")).slice(0, CHECK_HEX);

/** The code to copy: three lines, then the check. */
export function printToCode(print: PackFingerprint): string {
  const tokens = body(print);
  const groups = tokens.slice(5);
  const lines = [tokens.slice(0, 5).join(" "), ...[0, 4, 8, 12].map((i) => groups.slice(i, i + 4).join(" ")), `k=${check(tokens)}`];
  return lines.join("\n");
}

/** Read a pasted code. Letter case and spacing do not matter; nothing is guessed or repaired. */
export function parseCode(input: string): ParsedFingerprintCode {
  if (input.trim() === "") return { ok: false, problem: "empty" };
  if (input.length > FINGERPRINT_MAX_CODE_CHARS) return { ok: false, problem: "too-long" };
  const tokens = input.trim().split(/\s+/);
  if (tokens[0]!.toUpperCase() !== CODE_TAG) return { ok: false, problem: "not-a-code", token: tokens[0]!.slice(0, 24) };
  if (tokens[1]?.toLowerCase() !== CODE_VERSION) return { ok: false, problem: "unsupported-version", ...(tokens[1] ? { token: tokens[1].slice(0, 24) } : {}) };

  const fields = new Map<string, string>();
  for (const token of tokens.slice(2)) {
    const eq = token.indexOf("=");
    if (eq < 1) return { ok: false, problem: "malformed", token: token.slice(0, 24) };
    const key = token.slice(0, eq).toLowerCase();
    if (fields.has(key)) return { ok: false, problem: "malformed", token: token.slice(0, 24) };
    fields.set(key, token.slice(eq + 1).toLowerCase());
  }
  const need = ["n", "ids", "all", "k", ...BUCKET_KEYS];
  if (need.some((k) => !fields.has(k))) return { ok: false, problem: "incomplete" };
  if (fields.size !== need.length) {
    const extra = [...fields.keys()].find((k) => !need.includes(k));
    return { ok: false, problem: "malformed", ...(extra ? { token: extra.slice(0, 24) } : {}) };
  }

  const n = fields.get("n")!;
  if (!/^\d{1,8}$/.test(n) || Number(n) > MAX_COUNT) return { ok: false, problem: "malformed", token: `n=${n.slice(0, 12)}` };
  const ids = fields.get("ids")!;
  const all = fields.get("all")!;
  if (!hex(WHOLE_HEX).test(ids)) return { ok: false, problem: "malformed", token: "ids" };
  if (!hex(WHOLE_HEX).test(all)) return { ok: false, problem: "malformed", token: "all" };
  const buckets: BucketPrint[] = [];
  let total = 0;
  for (const key of BUCKET_KEYS) {
    const m = /^(\d{1,8}):([0-9a-f]+)$/.exec(fields.get(key)!);
    if (!m || !hex(BUCKET_HEX).test(m[2]!) || Number(m[1]) > MAX_COUNT) return { ok: false, problem: "malformed", token: key };
    buckets.push({ key: key as BucketKey, count: Number(m[1]), hash: m[2]! });
    total += Number(m[1]);
  }
  const print: PackFingerprint = { count: Number(n), ids, all, buckets };
  if (!hex(CHECK_HEX).test(fields.get("k")!) || check(body(print)) !== fields.get("k")) return { ok: false, problem: "typo" };
  // A code whose own group counts do not add up is not one this App made.
  if (total !== print.count) return { ok: false, problem: "malformed", token: "n" };
  return { ok: true, print };
}
