import { BUNDLE_LIMITS } from "../model";
import { SET_LIMITS, SET_SCHEMA, type TransferSet } from "./model";

export const SET_RECEIPT_SCHEMA = "the-app.recovery-transfer-set-receipt.v1" as const;
export const RECEIPT_LIMIT_BYTES = 32_768;

export interface TransferReceiptPart {
  readonly index: number;
  readonly count: number;
  readonly byteLength: number;
  readonly originalByteLength: number;
  readonly digest: string;
  readonly memberCount: number;
}

export interface TransferReceipt {
  readonly schema: typeof SET_RECEIPT_SCHEMA;
  readonly setId: string;
  readonly partCount: number;
  readonly memberCount: number;
  readonly byteLength: number;
  readonly parts: readonly TransferReceiptPart[];
}

export type ReceiptIssue = "size" | "format" | "identity" | "count" | "digest" | "incomplete" | "mismatch";
export type ReceiptResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issue: ReceiptIssue; readonly part?: number };

export interface ReceiptComparison {
  readonly matches: boolean;
  readonly setIdMatches: boolean;
  readonly partsMatch: boolean;
  readonly memberCountMatches: boolean;
  readonly byteLengthMatches: boolean;
  readonly mismatchedParts: readonly number[];
}

const ok = <T>(value: T): ReceiptResult<T> => ({ ok: true, value });
const bad = <T = never>(issue: ReceiptIssue, part?: number): ReceiptResult<T> =>
  part === undefined ? { ok: false, issue } : { ok: false, issue, part };

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function validPart(value: unknown, index: number, count: number): value is TransferReceiptPart {
  if (!object(value) || !exactKeys(value, ["index", "count", "byteLength", "originalByteLength", "digest", "memberCount"])) return false;
  return value.index === index && value.count === count &&
    typeof value.byteLength === "number" && Number.isSafeInteger(value.byteLength) && value.byteLength > 0 &&
    value.byteLength <= SET_LIMITS.partBytes && typeof value.originalByteLength === "number" &&
    Number.isSafeInteger(value.originalByteLength) && value.originalByteLength > 0 && value.originalByteLength <= BUNDLE_LIMITS.totalBytes &&
    typeof value.digest === "string" && /^[a-f0-9]{64}$/u.test(value.digest) &&
    typeof value.memberCount === "number" && Number.isSafeInteger(value.memberCount) &&
    value.memberCount > 0 && value.memberCount <= 12;
}

export function checkTransferReceipt(value: unknown): value is TransferReceipt {
  if (!object(value) || !exactKeys(value, ["schema", "setId", "partCount", "memberCount", "byteLength", "parts"])) return false;
  if (value.schema !== SET_RECEIPT_SCHEMA || typeof value.setId !== "string" || !/^[a-f0-9]{64}$/u.test(value.setId)) return false;
  if (typeof value.partCount !== "number" || !Number.isSafeInteger(value.partCount) ||
      value.partCount < 2 || value.partCount > SET_LIMITS.parts) return false;
  if (typeof value.memberCount !== "number" || !Number.isSafeInteger(value.memberCount) ||
      value.memberCount < 2 || value.memberCount > SET_LIMITS.members) return false;
  if (typeof value.byteLength !== "number" || !Number.isSafeInteger(value.byteLength) ||
      value.byteLength <= 0 || value.byteLength > SET_LIMITS.rawBytes) return false;
  if (!Array.isArray(value.parts) || value.parts.length !== value.partCount) return false;
  let members = 0;
  let bytes = 0;
  let originalBytes = 0;
  const digests = new Set<string>();
  for (let offset = 0; offset < value.parts.length; offset++) {
    const part = value.parts[offset];
    if (!validPart(part, offset + 1, value.partCount)) return false;
    members += part.memberCount;
    bytes += part.byteLength;
    originalBytes += part.originalByteLength;
    if (digests.has(part.digest)) return false;
    digests.add(part.digest);
  }
  return members === value.memberCount && bytes <= value.partCount * SET_LIMITS.partBytes && originalBytes === value.byteLength;
}

export function exportTransferReceipt(set: TransferSet): string {
  const value: TransferReceipt = {
    schema: SET_RECEIPT_SCHEMA,
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
  };
  return JSON.stringify(value, null, 2);
}

export function parseTransferReceipt(text: string): ReceiptResult<TransferReceipt> {
  if (new TextEncoder().encode(text).byteLength > RECEIPT_LIMIT_BYTES) return bad("size");
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    return bad("format");
  }
  return checkTransferReceipt(value) ? ok(value) : bad("format");
}

export function compareTransferReceipt(receipt: TransferReceipt, set: TransferSet): ReceiptComparison {
  const mismatchedParts: number[] = [];
  const partsMatch = receipt.parts.length === set.parts.length && receipt.parts.every((expected, offset) => {
    const actual = set.parts[offset];
    const matches = actual !== undefined && expected.index === actual.index &&
      expected.count === actual.count && expected.byteLength === actual.byteLength &&
      expected.originalByteLength === actual.members.reduce((total, member) => total + member.byteLength, 0) &&
      expected.digest === actual.digest && expected.memberCount === actual.members.length;
    if (!matches) mismatchedParts.push(offset + 1);
    return matches;
  });
  const setIdMatches = receipt.setId === set.setId;
  const memberCountMatches = receipt.memberCount === set.memberCount;
  const byteLengthMatches = receipt.byteLength === set.byteLength;
  return Object.freeze({
    matches: setIdMatches && partsMatch && memberCountMatches && byteLengthMatches,
    setIdMatches,
    partsMatch,
    memberCountMatches,
    byteLengthMatches,
    mismatchedParts: Object.freeze(mismatchedParts),
  });
}

export function compareReceiptText(text: string, set: TransferSet): ReceiptResult<ReceiptComparison> {
  const parsed = parseTransferReceipt(text);
  if (!parsed.ok) return parsed;
  return ok(compareTransferReceipt(parsed.value, set));
}

export function transferReceiptSummary(receipt: TransferReceipt): string {
  return [
    `set:${receipt.setId}`,
    `parts:${receipt.partCount}`,
    `members:${receipt.memberCount}`,
    `bytes:${receipt.byteLength}`,
    ...receipt.parts.map(part => `part:${part.index}:${part.digest}:${part.memberCount}:${part.byteLength}:${part.originalByteLength}`),
  ].join("\n");
}

export function receiptSetSchema(): typeof SET_SCHEMA {
  return SET_SCHEMA;
}
