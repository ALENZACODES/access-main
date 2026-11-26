import { browserSha256 } from "../packIntegrity";
import { byteCap, classifyRecoveryText, type RecoveryKind } from "./formats";

export const BUNDLE_SCHEMA = "the-app.recovery-transfer-bundle.v1";
export const BUNDLE_LIMITS = Object.freeze({
  members: 12,
  totalBytes: 2_000_000,
  envelopeBytes: 2_800_000,
});

export type BundleProblemCode =
  | "empty" | "member-count" | "member-size" | "total-size" | "bundle-size"
  | "read" | "encoding" | "native-format" | "crypto" | "duplicate"
  | "envelope" | "version" | "payload" | "integrity";

export interface BundleProblem {
  readonly code: BundleProblemCode;
  /** One-based position in the bundle or draft, when a particular entry failed. */
  readonly slot?: number;
}

export type BundleResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problem: BundleProblem };

export interface BundleMember {
  readonly kind: RecoveryKind;
  readonly byteLength: number;
  readonly digest: string;
  readonly recordCount: number;
  /** A new, nameless Blob of the original bytes, including any UTF-8 BOM. */
  readonly file: Blob;
}

interface PackedEntry {
  readonly kind: string;
  readonly byteLength: number;
  readonly digest: string;
  readonly payload: string;
}

// Only entries created by this reader may be written. The cache is released
// with the member when a draft is cleared, and reordering requires no new I/O.
const payloads = new WeakMap<BundleMember, string>();

function ok<T>(value: T): BundleResult<T> {
  return { ok: true, value };
}

function fail(code: BundleProblemCode, slot?: number): { ok: false; problem: BundleProblem } {
  return { ok: false, problem: slot === undefined ? { code } : { code, slot } };
}

async function readBytes(
  file: Blob,
  limit: number,
  sizeProblem: "member-size" | "bundle-size",
): Promise<BundleResult<Uint8Array<ArrayBuffer>>> {
  if (!Number.isSafeInteger(file.size) || file.size < 0) return fail("read");
  if (file.size === 0) return fail("empty");
  if (file.size > limit) return fail(sizeProblem);
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength !== file.size) return fail("read");
    return ok(bytes);
  } catch {
    return fail("read");
  }
}

function decodeText(bytes: Uint8Array, preserveBom = false): BundleResult<string> {
  try {
    // A decoding replacement would change the native record while the user is
    // deciding whether to keep it. Reject malformed UTF-8 before inspecting it.
    return ok(new TextDecoder("utf-8", { fatal: true, ignoreBOM: preserveBom }).decode(bytes));
  } catch {
    return fail("encoding");
  }
}

function toBase64(bytes: Uint8Array): string {
  // Spreading one large array into fromCharCode exceeds browser stack limits.
  const parts: string[] = [];
  const chunkSize = 8_192;
  for (let start = 0; start < bytes.length; start += chunkSize) {
    parts.push(String.fromCharCode(...bytes.subarray(start, start + chunkSize)));
  }
  return btoa(parts.join(""));
}

function decodePayload(entry: PackedEntry): BundleResult<Uint8Array<ArrayBuffer>> {
  const canonicalLength = 4 * Math.ceil(entry.byteLength / 3);
  if (entry.payload.length !== canonicalLength) return fail("payload");
  let binary: string;
  try {
    binary = atob(entry.payload);
  } catch {
    return fail("payload");
  }
  if (binary.length !== entry.byteLength) return fail("integrity");
  // atob also accepts whitespace and non-zero padding bits. Only the canonical
  // spelling will round-trip through other readers without ambiguity.
  if (btoa(binary) !== entry.payload) return fail("payload");
  return ok(Uint8Array.from(binary, character => character.charCodeAt(0)));
}

async function inspectBytes(
  bytes: Uint8Array<ArrayBuffer>,
  expected?: PackedEntry,
): Promise<BundleResult<BundleMember>> {
  let digest: string;
  try {
    digest = await browserSha256(bytes);
  } catch {
    return fail("crypto");
  }
  if (expected && expected.digest !== digest) return fail("integrity");

  const decoded = decodeText(bytes, true);
  if (!decoded.ok) return decoded;
  const info = classifyRecoveryText(decoded.value, bytes.byteLength);
  if (info === "member-size") return fail("member-size");
  if (!info) return fail("native-format");
  if (expected && expected.kind !== info.kind) return fail("integrity");

  const member: BundleMember = Object.freeze({
    kind: info.kind,
    byteLength: bytes.byteLength,
    digest,
    recordCount: info.recordCount,
    file: new Blob([bytes], { type: "application/json" }),
  });
  payloads.set(member, expected?.payload ?? toBase64(bytes));
  return ok(member);
}

export async function inspectMember(file: Blob): Promise<BundleResult<BundleMember>> {
  const bytes = await readBytes(file, byteCap(), "member-size");
  if (!bytes.ok) return bytes;
  return inspectBytes(bytes.value);
}

export function appendMembers(
  existing: readonly BundleMember[],
  added: readonly BundleMember[],
): BundleResult<readonly BundleMember[]> {
  if (existing.length + added.length > BUNDLE_LIMITS.members) return fail("member-count");
  const members = [...existing, ...added];
  const seen = new Set<string>();
  let total = 0;
  for (const [index, member] of members.entries()) {
    if (!payloads.has(member)) return fail("payload", index + 1);
    if (seen.has(member.digest)) return fail("duplicate", index + 1);
    seen.add(member.digest);
    total += member.byteLength;
    if (total > BUNDLE_LIMITS.totalBytes) return fail("total-size", index + 1);
  }
  return ok(Object.freeze(members));
}

export function encodeBundle(members: readonly BundleMember[]): BundleResult<Blob> {
  if (members.length === 0) return fail("empty");
  const checked = appendMembers([], members);
  if (!checked.ok) return checked;
  const entries = checked.value.map(member => ({
    kind: member.kind,
    byteLength: member.byteLength,
    digest: member.digest,
    payload: payloads.get(member),
  }));
  const file = new Blob([JSON.stringify({ schema: BUNDLE_SCHEMA, entries })], {
    type: "application/json",
  });
  return file.size <= BUNDLE_LIMITS.envelopeBytes ? ok(file) : fail("bundle-size");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readEntry(value: unknown): BundleResult<PackedEntry> {
  if (!isRecord(value) || Object.keys(value).length !== 4) return fail("envelope");
  const { kind, byteLength, digest, payload } = value;
  if (typeof kind !== "string" || typeof digest !== "string" || typeof payload !== "string") {
    return fail("envelope");
  }
  if (!/^[a-f0-9]{64}$/u.test(digest)) return fail("envelope");
  if (typeof byteLength !== "number" || !Number.isSafeInteger(byteLength) || byteLength <= 0) {
    return fail("envelope");
  }
  if (byteLength > byteCap()) return fail("member-size");
  return ok({ kind, byteLength, digest, payload });
}

function parseEnvelope(text: string): BundleResult<readonly PackedEntry[]> {
  let document: unknown;
  try {
    document = JSON.parse(text) as unknown;
  } catch {
    return fail("envelope");
  }
  if (!isRecord(document) || typeof document.schema !== "string") return fail("envelope");
  if (document.schema !== BUNDLE_SCHEMA) return fail("version");
  if (Object.keys(document).length !== 2 || !Array.isArray(document.entries)) return fail("envelope");
  if (document.entries.length === 0) return fail("empty");
  if (document.entries.length > BUNDLE_LIMITS.members) return fail("member-count");

  // Check the claimed sizes for the entire file before expanding the first member.
  const entries: PackedEntry[] = [];
  let total = 0;
  for (const [index, raw] of document.entries.entries()) {
    const entry = readEntry(raw);
    if (!entry.ok) return fail(entry.problem.code, index + 1);
    total += entry.value.byteLength;
    if (total > BUNDLE_LIMITS.totalBytes) return fail("total-size", index + 1);
    entries.push(entry.value);
  }
  return ok(entries);
}

export async function openBundle(file: Blob): Promise<BundleResult<readonly BundleMember[]>> {
  const bytes = await readBytes(file, BUNDLE_LIMITS.envelopeBytes, "bundle-size");
  if (!bytes.ok) return bytes;
  const decoded = decodeText(bytes.value);
  if (!decoded.ok) return decoded;
  const entries = parseEnvelope(decoded.value);
  if (!entries.ok) return entries;
  const members: BundleMember[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of entries.value.entries()) {
    const slot = index + 1;
    const payload = decodePayload(entry);
    if (!payload.ok) return fail(payload.problem.code, slot);
    const member = await inspectBytes(payload.value, entry);
    if (!member.ok) return fail(member.problem.code, slot);
    if (seen.has(member.value.digest)) return fail("duplicate", slot);
    seen.add(member.value.digest);
    members.push(member.value);
  }
  // Expose the files only after every entry passes its native and byte checks.
  return ok(Object.freeze(members));
}
