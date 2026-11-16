// A copy of the App's local data that needs a passphrase to open.
// PBKDF2 (SHA-256) turns the passphrase into an AES-GCM key. The header fields
// are covered by the cipher's integrity check, so changing the iteration count
// or the prefix in the file makes it fail to open. The passphrase is never
// stored, logged or returned. If it is forgotten, the copy cannot be opened.

import { MAX_IMPORT_BYTES } from "./importData";

export const FORMAT = "app-protected-data";
export const VERSION = 1;
export const DEFAULT_ITERATIONS = 310_000;
export const MIN_ITERATIONS = 100_000;
export const MAX_ITERATIONS = 2_000_000;
export const MIN_PASSPHRASE_LENGTH = 10;
export const MAX_PROTECTED_BYTES = 1_500_000;

export type CryptoLike = Pick<Crypto, "subtle" | "getRandomValues">;

export type PassphraseProblem = "empty" | "too-short" | "repeated" | "common";
export type OpenProblem =
  | "not-json"
  | "wrong-format"
  | "wrong-version"
  | "bad-fields"
  | "wrong-prefix"
  | "too-large"
  | "cannot-open"
  | "unsupported";

const COMMON = new Set(["password12", "password123", "1234567890", "qwertyuiop", "0123456789", "passwordpassword", "motdepasse", "motdepasse1"]);

const normalize = (p: string): string => p.normalize("NFKC");

/** Length counts characters a person sees, not UTF-16 units. */
export function passphraseProblem(p: string): PassphraseProblem | null {
  const chars = [...normalize(p)];
  if (chars.length === 0) return "empty";
  if (chars.length < MIN_PASSPHRASE_LENGTH) return "too-short";
  if (new Set(chars).size === 1) return "repeated";
  if (COMMON.has(normalize(p).toLowerCase())) return "common";
  return null;
}

function toB64(u: Uint8Array): string {
  let s = "";
  for (const b of u) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(s: string): Uint8Array {
  if (s.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw new RangeError("bad base64");
  const bin = atob(s);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) u[i] = bin.charCodeAt(i);
  return u;
}

const enc = new TextEncoder();
const aadFor = (prefix: string, iterations: number): Uint8Array => enc.encode(`${FORMAT}|${VERSION}|${prefix}|${iterations}`);

async function deriveKey(c: CryptoLike, passphrase: string, salt: Uint8Array, iterations: number, usage: KeyUsage): Promise<CryptoKey> {
  const base = await c.subtle.importKey("raw", enc.encode(normalize(passphrase)) as BufferSource, "PBKDF2", false, ["deriveKey"]);
  return c.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    [usage],
  );
}

export interface ProtectOptions {
  iterations?: number;
}

export type ProtectResult = { ok: true; text: string } | { ok: false; code: PassphraseProblem | "too-large" | "unsupported" };

export async function protect(
  plaintext: string,
  passphrase: string,
  prefix: string,
  c: CryptoLike | undefined,
  o: ProtectOptions = {},
): Promise<ProtectResult> {
  if (c === undefined || c.subtle === undefined) return { ok: false, code: "unsupported" };
  const problem = passphraseProblem(passphrase);
  if (problem !== null) return { ok: false, code: problem };
  const body = enc.encode(plaintext);
  if (body.length > MAX_IMPORT_BYTES) return { ok: false, code: "too-large" };
  const iterations = o.iterations ?? DEFAULT_ITERATIONS;
  const salt = c.getRandomValues(new Uint8Array(16));
  const iv = c.getRandomValues(new Uint8Array(12));
  try {
    const key = await deriveKey(c, passphrase, salt, iterations, "encrypt");
    const data = new Uint8Array(
      await c.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource, additionalData: aadFor(prefix, iterations) as BufferSource }, key, body as BufferSource),
    );
    const file = { format: FORMAT, version: VERSION, prefix, kdf: "PBKDF2-SHA-256", iterations, cipher: "AES-GCM-256", salt: toB64(salt), iv: toB64(iv), data: toB64(data) };
    return { ok: true, text: `${JSON.stringify(file, null, 2)}\n` };
  } catch {
    return { ok: false, code: "unsupported" };
  }
}

export interface UnprotectOptions {
  /** Lowest iteration count accepted. Default 100,000, so a file cannot ask for a weak key. */
  minIterations?: number;
}

export type UnprotectResult = { ok: true; plaintext: string } | { ok: false; code: OpenProblem };

export async function unprotect(
  text: string,
  passphrase: string,
  prefix: string,
  c: CryptoLike | undefined,
  o: UnprotectOptions = {},
): Promise<UnprotectResult> {
  if (c === undefined || c.subtle === undefined) return { ok: false, code: "unsupported" };
  if (text.length > MAX_PROTECTED_BYTES) return { ok: false, code: "too-large" };
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return { ok: false, code: "not-json" };
  }
  if (v === null || typeof v !== "object" || Array.isArray(v)) return { ok: false, code: "wrong-format" };
  const f = v as Record<string, unknown>;
  if (f.format !== FORMAT) return { ok: false, code: "wrong-format" };
  if (f.version !== VERSION) return { ok: false, code: "wrong-version" };
  if (f.kdf !== "PBKDF2-SHA-256" || f.cipher !== "AES-GCM-256") return { ok: false, code: "bad-fields" };
  if (f.prefix !== prefix) return { ok: false, code: "wrong-prefix" };
  const it = f.iterations;
  if (typeof it !== "number" || !Number.isInteger(it) || it < (o.minIterations ?? MIN_ITERATIONS) || it > MAX_ITERATIONS) {
    return { ok: false, code: "bad-fields" };
  }
  let salt: Uint8Array, iv: Uint8Array, data: Uint8Array;
  try {
    if (typeof f.salt !== "string" || typeof f.iv !== "string" || typeof f.data !== "string") throw new RangeError("fields");
    salt = fromB64(f.salt);
    iv = fromB64(f.iv);
    data = fromB64(f.data);
  } catch {
    return { ok: false, code: "bad-fields" };
  }
  if (salt.length !== 16 || iv.length !== 12 || data.length < 16) return { ok: false, code: "bad-fields" };
  try {
    const key = await deriveKey(c, passphrase, salt, it, "decrypt");
    const plain = await c.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource, additionalData: aadFor(prefix, it) as BufferSource }, key, data as BufferSource);
    return { ok: true, plaintext: new TextDecoder("utf-8", { fatal: true }).decode(plain) };
  } catch {
    return { ok: false, code: "cannot-open" };
  }
}
