import { byteCap, isRecoveryKind } from "./formats";
import { BUNDLE_LIMITS, type BundleMember } from "./model";

export const LIST_SCHEMA = "the-app.recovery-packing-list.v1";
export const MAX_LIST_BYTES = 16_384;
export type ListEntry = Pick<BundleMember, "digest" | "kind" | "byteLength" | "recordCount">;
type ListIssue = "size" | "format" | "duplicate" | "read";

export type ListResult =
  | { ok: true; entries: readonly ListEntry[] }
  | { ok: false; issue: ListIssue };

function plain(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function validEntry(value: unknown): value is ListEntry {
  if (!plain(value) || !exactKeys(value, ["kind", "digest", "byteLength", "recordCount"])) return false;
  const { kind, byteLength, recordCount, digest } = value;
  return isRecoveryKind(kind)
    && typeof digest === "string" && digest.length === 64 && /^[a-f0-9]+$/u.test(digest)
    && typeof byteLength === "number" && Number.isSafeInteger(byteLength)
    && byteLength > 0 && byteLength <= byteCap(kind)
    && typeof recordCount === "number" && Number.isSafeInteger(recordCount)
    && recordCount >= 0 && recordCount <= byteLength;
}

/** Copy only display metadata; never serialize the file or the original file name. */
export function encodePackingList(members: readonly BundleMember[]): string {
  const entries = members.map(({ kind, digest, byteLength, recordCount }) => ({
    kind, digest, byteLength, recordCount,
  }));
  return JSON.stringify({ schema: LIST_SCHEMA, entries }, null, 2) + "\n";
}

export async function readPackingList(file: Blob): Promise<ListResult> {
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MAX_LIST_BYTES) {
    return { ok: false, issue: "size" };
  }
  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
    if (bytes.byteLength !== file.size) return { ok: false, issue: "read" };
  } catch {
    return { ok: false, issue: "read" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    return { ok: false, issue: "format" };
  }
  if (!plain(parsed) || !exactKeys(parsed, ["schema", "entries"])
    || parsed.schema !== LIST_SCHEMA || !Array.isArray(parsed.entries)
    || parsed.entries.length === 0 || parsed.entries.length > BUNDLE_LIMITS.members) {
    return { ok: false, issue: "format" };
  }
  const entries: ListEntry[] = [];
  const seen = new Set<string>();
  let total = 0;
  for (const row of parsed.entries as unknown[]) {
    if (!validEntry(row)) return { ok: false, issue: "format" };
    if (seen.has(row.digest)) return { ok: false, issue: "duplicate" };
    total += row.byteLength;
    if (total > BUNDLE_LIMITS.totalBytes) return { ok: false, issue: "format" };
    entries.push(row);
    seen.add(row.digest);
  }
  return { ok: true, entries };
}

export interface MatchedFile {
  expectedSlot: number;
  receivedSlot: number;
  metadataChanges: Array<"kind" | "byteLength" | "recordCount">;
  reordered: boolean;
}
export interface PackingComparison {
  complete: boolean;
  missing: number[];
  extra: number[];
  matched: MatchedFile[];
}

/** A missing file shifts later slots without reversing their relative order. */
export function comparePackingList(expected: readonly ListEntry[], received: readonly ListEntry[]): PackingComparison {
  const locations = new Map(received.map((entry, index) => [entry.digest, index]));
  const accounted = new Set<number>();
  const missing: number[] = [];
  const matched: MatchedFile[] = [];
  const fields = ["kind", "byteLength", "recordCount"] as const;
  expected.forEach((entry, index) => {
    const at = locations.get(entry.digest);
    const found = at === undefined ? undefined : received[at];
    if (at === undefined || found === undefined) {
      missing.push(index + 1);
      return;
    }
    accounted.add(at);
    matched.push({
      expectedSlot: index + 1,
      receivedSlot: at + 1,
      metadataChanges: fields.filter(field => found[field] !== entry[field]),
      reordered: false,
    });
  });
  for (const row of matched) {
    row.reordered = matched.some(other =>
      (other.expectedSlot - row.expectedSlot) * (other.receivedSlot - row.receivedSlot) < 0);
  }
  const extra = received.flatMap((_, index) => accounted.has(index) ? [] : [index + 1]);
  return {
    complete: missing.length === 0 && extra.length === 0
      && matched.every(row => !row.reordered && row.metadataChanges.length === 0),
    missing, extra, matched,
  };
}
