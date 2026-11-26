import { browserSha256 } from "../../packIntegrity";
import { BUNDLE_LIMITS, encodeBundle, openBundle, type BundleMember } from "../model";

/** A transfer set is a bounded envelope containing independently valid native bundles. */
export const SET_SCHEMA = "the-app.recovery-transfer-set.v1" as const;
export const SET_LIMITS = Object.freeze({
  parts: 4,
  members: BUNDLE_LIMITS.members * 4,
  rawBytes: BUNDLE_LIMITS.totalBytes * 4,
  partBytes: BUNDLE_LIMITS.envelopeBytes,
  envelopeBytes: 16_000_000,
});

export type SetProblemCode =
  | "empty" | "part-count" | "member-count" | "member-size" | "total-size"
  | "part-size" | "set-size" | "read" | "encoding" | "envelope"
  | "version" | "payload" | "digest" | "identity" | "duplicate"
  | "incomplete" | "crypto" | "native-bundle"
  | "invalid-candidate" | "duplicate-digest" | "record-count";

export interface SetProblem {
  readonly code: SetProblemCode;
  readonly part?: number;
}

export type SetResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problem: SetProblem };

export interface TransferPart {
  readonly index: number;
  readonly count: number;
  /** Encoded byte length of the ordinary bundle file for this part. */
  readonly byteLength: number;
  readonly digest: string;
  readonly members: readonly BundleMember[];
  /** The ordinary bundle is retained so the user can save one part independently. */
  readonly file: Blob;
}

export interface TransferSet {
  readonly schema: typeof SET_SCHEMA;
  readonly setId: string;
  readonly parts: readonly TransferPart[];
  readonly memberCount: number;
  readonly byteLength: number;
}

interface WirePart {
  readonly index: number;
  readonly count: number;
  readonly byteLength: number;
  readonly digest: string;
  readonly payload: string;
}

interface WireSet {
  readonly schema: typeof SET_SCHEMA;
  readonly setId: string;
  readonly parts: readonly WirePart[];
}

const success = <T>(value: T): SetResult<T> => ({ ok: true, value });
const failure = <T = never>(code: SetProblemCode, part?: number): SetResult<T> => ({
  ok: false,
  problem: part === undefined ? { code } : { code, part },
});

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every(key => Object.hasOwn(value, key));
}

function encodeBase64(bytes: Uint8Array): string {
  const pieces: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 8_192) {
    pieces.push(String.fromCharCode(...bytes.subarray(offset, offset + 8_192)));
  }
  return btoa(pieces.join(""));
}

function decodeBase64(payload: string, expectedBytes: number): SetResult<Uint8Array<ArrayBuffer>> {
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes <= 0) return failure("payload");
  if (payload.length !== 4 * Math.ceil(expectedBytes / 3)) return failure("payload");
  let binary: string;
  try {
    binary = atob(payload);
  } catch {
    return failure("payload");
  }
  if (binary.length !== expectedBytes || btoa(binary) !== payload) return failure("payload");
  return success(Uint8Array.from(binary, character => character.charCodeAt(0)));
}

async function readBlob(blob: Blob, cap: number): Promise<SetResult<Uint8Array<ArrayBuffer>>> {
  if (!Number.isSafeInteger(blob.size) || blob.size <= 0) return failure(blob.size === 0 ? "empty" : "read");
  if (blob.size > cap) return failure("set-size");
  try {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.byteLength !== blob.size) return failure("read");
    return success(bytes);
  } catch {
    return failure("read");
  }
}

function decodeUtf8(bytes: Uint8Array): SetResult<string> {
  try {
    return success(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return failure("encoding");
  }
}

function validateWirePart(value: unknown, expectedIndex: number, expectedCount: number): SetResult<WirePart> {
  if (!isObject(value) || !exactKeys(value, ["index", "count", "byteLength", "digest", "payload"])) {
    return failure("envelope", expectedIndex);
  }
  const { index, count, byteLength, digest, payload } = value;
  if (index !== expectedIndex || count !== expectedCount) return failure("incomplete", expectedIndex);
  if (!Number.isSafeInteger(byteLength) || typeof byteLength !== "number" || byteLength <= 0) {
    return failure("envelope", expectedIndex);
  }
  if (byteLength > SET_LIMITS.partBytes) return failure("part-size", expectedIndex);
  if (typeof digest !== "string" || !/^[a-f0-9]{64}$/u.test(digest)) return failure("envelope", expectedIndex);
  if (typeof payload !== "string") return failure("envelope", expectedIndex);
  return success({ index, count, byteLength, digest, payload });
}

function parseWireSet(value: unknown): SetResult<WireSet> {
  if (!isObject(value) || !exactKeys(value, ["schema", "setId", "parts"])) return failure("envelope");
  if (value.schema !== SET_SCHEMA) return failure("version");
  if (typeof value.setId !== "string" || !/^[a-f0-9]{64}$/u.test(value.setId)) return failure("identity");
  if (!Array.isArray(value.parts)) return failure("envelope");
  if (value.parts.length < 2) return failure("part-count");
  if (value.parts.length > SET_LIMITS.parts) return failure("part-count");
  const count = value.parts.length;
  const parts: WirePart[] = [];
  let total = 0;
  for (let offset = 0; offset < value.parts.length; offset++) {
    const checked = validateWirePart(value.parts[offset], offset + 1, count);
    if (!checked.ok) return checked;
    total += checked.value.byteLength;
    if (total > SET_LIMITS.parts * SET_LIMITS.partBytes) return failure("total-size", offset + 1);
    parts.push(checked.value);
  }
  return success({ schema: SET_SCHEMA, setId: value.setId, parts });
}

async function setIdentity(digests: readonly string[]): Promise<string> {
  return browserSha256(new TextEncoder().encode(digests.join("\n")));
}

function splitIntoParts(members: readonly BundleMember[]): SetResult<readonly (readonly BundleMember[])[]> {
  if (members.length === 0) return failure("empty");
  if (members.length > SET_LIMITS.members) return failure("member-count");
  const parts: BundleMember[][] = [];
  let current: BundleMember[] = [];
  let currentBytes = 0;
  let allBytes = 0;
  const seen = new Set<string>();
  for (const [offset, member] of members.entries()) {
    if (seen.has(member.digest)) return failure("duplicate", offset + 1);
    seen.add(member.digest);
    if (!Number.isSafeInteger(member.byteLength) || member.byteLength <= 0) return failure("member-size");
    if (member.byteLength > BUNDLE_LIMITS.totalBytes) return failure("member-size");
    allBytes += member.byteLength;
    if (allBytes > SET_LIMITS.rawBytes) return failure("total-size");
    const wouldOverflow = current.length >= BUNDLE_LIMITS.members || currentBytes + member.byteLength > BUNDLE_LIMITS.totalBytes;
    if (wouldOverflow) {
      parts.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(member);
    currentBytes += member.byteLength;
  }
  if (current.length > 0) parts.push(current);
  if (parts.length < 2) return failure("part-count");
  if (parts.length > SET_LIMITS.parts) return failure("part-count");
  return success(parts);
}

/**
 * Create a multi-part transfer set without changing the original exports.
 * Each part remains a regular bundle and can be opened independently.
 */
export async function createTransferSet(members: readonly BundleMember[]): Promise<SetResult<Blob>> {
  const groups = splitIntoParts(members);
  if (!groups.ok) return groups;
  const wire: WirePart[] = [];
  for (let offset = 0; offset < groups.value.length; offset++) {
    const index = offset + 1;
    const encoded = encodeBundle(groups.value[offset]!);
    if (!encoded.ok) return failure("native-bundle", index);
    if (encoded.value.size > SET_LIMITS.partBytes) return failure("part-size", index);
    let bytes: Uint8Array<ArrayBuffer>;
    try {
      bytes = new Uint8Array(await encoded.value.arrayBuffer());
    } catch {
      return failure("read", index);
    }
    let digest: string;
    try {
      digest = await browserSha256(bytes);
    } catch {
      return failure("crypto", index);
    }
    wire.push({
      index,
      count: groups.value.length,
      byteLength: bytes.byteLength,
      digest,
      payload: encodeBase64(bytes),
    });
  }
  let identity: string;
  try {
    identity = await setIdentity(wire.map(part => part.digest));
  } catch {
    return failure("crypto");
  }
  const envelope = new Blob([JSON.stringify({ schema: SET_SCHEMA, setId: identity, parts: wire })], {
    type: "application/json",
  });
  if (envelope.size > SET_LIMITS.envelopeBytes) return failure("set-size");
  return success(envelope);
}

/**
 * Open the entire set atomically. No member is returned until every part,
 * every ordinary bundle and the cross-part identity have passed validation.
 */
export async function openTransferSet(file: Blob): Promise<SetResult<TransferSet>> {
  const bytes = await readBlob(file, SET_LIMITS.envelopeBytes);
  if (!bytes.ok) return bytes;
  const decoded = decodeUtf8(bytes.value);
  if (!decoded.ok) return decoded;
  let raw: unknown;
  try {
    raw = JSON.parse(decoded.value) as unknown;
  } catch {
    return failure("envelope");
  }
  const parsed = parseWireSet(raw);
  if (!parsed.ok) return parsed;
  const parts: TransferPart[] = [];
  const allMembers: BundleMember[] = [];
  const seen = new Set<string>();
  let totalRaw = 0;
  for (const part of parsed.value.parts) {
    const payload = decodeBase64(part.payload, part.byteLength);
    if (!payload.ok) return failure(payload.problem.code, part.index);
    let digest: string;
    try {
      digest = await browserSha256(payload.value);
    } catch {
      return failure("crypto", part.index);
    }
    if (digest !== part.digest) return failure("digest", part.index);
    const ordinary = new Blob([payload.value], { type: "application/json" });
    const opened = await openBundle(ordinary);
    if (!opened.ok) return failure("native-bundle", part.index);
    for (const member of opened.value) {
      if (seen.has(member.digest)) return failure("duplicate", part.index);
      seen.add(member.digest);
      allMembers.push(member);
      totalRaw += member.byteLength;
      if (totalRaw > SET_LIMITS.rawBytes) return failure("total-size", part.index);
    }
    parts.push(Object.freeze({
      index: part.index,
      count: part.count,
      byteLength: part.byteLength,
      digest,
      members: opened.value,
      file: ordinary,
    }));
  }
  if (allMembers.length === 0) return failure("empty");
  if (allMembers.length > SET_LIMITS.members) return failure("member-count");
  let identity: string;
  try {
    identity = await setIdentity(parts.map(part => part.digest));
  } catch {
    return failure("crypto");
  }
  if (identity !== parsed.value.setId) return failure("identity");
  return success(Object.freeze({
    schema: SET_SCHEMA,
    setId: identity,
    parts: Object.freeze(parts),
    memberCount: allMembers.length,
    byteLength: totalRaw,
  }));
}

/** Return a flat, immutable view in the original part/member order. */
export function transferSetMembers(set: TransferSet): readonly BundleMember[] {
  return Object.freeze(set.parts.flatMap(part => [...part.members]));
}

/** A compact receipt contains counts and digests, never source notes or payloads. */
export function transferSetReceipt(set: TransferSet): string {
  return JSON.stringify({
    schema: "the-app.recovery-transfer-set-receipt.v1",
    setId: set.setId,
    partCount: set.parts.length,
    memberCount: set.memberCount,
    byteLength: set.byteLength,
    parts: set.parts.map(part => ({
      index: part.index,
      count: part.count,
      byteLength: part.byteLength,
      originalByteLength: part.members.reduce((total, member) => total + member.byteLength, 0),
      digest: part.digest,
      memberCount: part.members.length,
    })),
  }, null, 2);
}
