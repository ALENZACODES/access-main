import type { RegionInventory } from "./regionInventory";
import type { RegionManifest, Provenance } from "./regionDownload";

/**
 * A portable, metadata-only record of one explicit offline inventory reading.
 * Its digest detects accidental edits to the receipt payload. It is not a
 * signature, a source attestation, or proof that a historical copy is present.
 */
export type ReceiptCellState = "saved" | "UNKNOWN";
export type ReceiptCellCause = "present" | "missing" | "stale" | "unreadable" | "UNKNOWN";
export type ReceiptStatus = "recorded" | "UNKNOWN";
export type ReceiptChange = "unchanged" | "saved" | "lost" | "source-changed" | "size-changed" | "added" | "removed" | "UNKNOWN";
export type ReceiptFilter = "all" | "changed" | "saved" | "lost" | "UNKNOWN" | "added" | "removed";
export type ReceiptOrder = "listed" | "id" | "largest" | "source" | "change";

export interface PackReceiptCell {
  readonly id: string;
  readonly bytes: number;
  readonly source: Provenance;
  readonly state: ReceiptCellState;
  readonly cause: ReceiptCellCause;
}

export interface PackReceipt {
  readonly schema: "offline-pack-receipt-v1";
  readonly regionId: string;
  readonly capturedAt: string;
  readonly status: ReceiptStatus;
  readonly cells: readonly PackReceiptCell[];
  readonly savedCount: number;
  readonly unknownCount: number;
  readonly totalBytes: number;
  readonly digest: string;
}

export interface ReceiptBook {
  readonly schema: "offline-pack-receipt-book-v1";
  readonly regionId: string;
  readonly receipts: readonly PackReceipt[];
}

export interface ReceiptDiffRow {
  readonly id: string;
  readonly before: PackReceiptCell | null;
  readonly after: PackReceiptCell | null;
  readonly change: ReceiptChange;
}

export interface ReceiptDiff {
  readonly regionId: string;
  readonly from: string;
  readonly to: string;
  readonly status: ReceiptStatus;
  readonly rows: readonly ReceiptDiffRow[];
  readonly counts: Readonly<Record<ReceiptChange, number>>;
}

export interface ReceiptPageQuery {
  readonly search: string;
  readonly filter: ReceiptFilter;
  readonly order: ReceiptOrder;
  readonly offset: number;
  readonly limit: number;
}

export interface ReceiptPage {
  readonly rows: readonly ReceiptDiffRow[];
  readonly total: number;
  readonly offset: number;
  readonly limit: number;
  readonly previous: boolean;
  readonly next: boolean;
}

export interface ReceiptSummary {
  readonly captures: number;
  readonly saved: number;
  readonly unknown: number;
  readonly changed: number;
  readonly latestAt: string | null;
  readonly totalBytes: number | null;
}

export interface ReceiptCrypto {
  readonly subtle: Pick<SubtleCrypto, "digest">;
}

export const RECEIPT_MAX_CELLS = 10_000;
export const RECEIPT_MAX_CAPTURES = 12;
export const RECEIPT_MAX_BYTES = 512 * 1024;
export const RECEIPT_PAGE_SIZE = 20;
export const RECEIPT_MAX_ID = 160;
export const RECEIPT_MAX_SOURCE = 500;
const HEX_256 = /^[a-f0-9]{64}$/u;
const DAY = /^\d{4}-\d{2}-\d{2}$/u;
const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const STATES: readonly ReceiptCellState[] = ["saved", "UNKNOWN"];
const CAUSES: readonly ReceiptCellCause[] = ["present", "missing", "stale", "unreadable", "UNKNOWN"];
const STATUSES: readonly ReceiptStatus[] = ["recorded", "UNKNOWN"];

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeText(value: unknown, limit: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= limit &&
    !/[\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(value);
}

function validDay(value: unknown): value is string {
  if (typeof value !== "string" || !DAY.test(value)) return false;
  const parsed = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function validTime(value: unknown): value is string {
  if (typeof value !== "string" || !TIME.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString() === value;
}

function safeId(value: unknown): value is string {
  return safeText(value, RECEIPT_MAX_ID) &&
    /^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/u.test(value) && !value.includes("..");
}

function safeBytes(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function validProvenance(value: unknown): value is Provenance {
  return isObject(value) && safeText(value.source, RECEIPT_MAX_SOURCE) &&
    safeText(value.licence, 160) && validDay(value.date);
}

function validateManifest(manifest: RegionManifest): void {
  if (!safeId(manifest.regionId) || !Array.isArray(manifest.cells) ||
    manifest.cells.length > RECEIPT_MAX_CELLS) throw new TypeError("Invalid receipt manifest");
  const seen = new Set<string>();
  for (const cell of manifest.cells) {
    if (!safeId(cell.id) || seen.has(cell.id) ||
      !safeBytes(cell.bytes) || !validProvenance(cell.provenance)) {
      throw new TypeError("Invalid receipt manifest cell");
    }
    seen.add(cell.id);
  }
}

function sourceEqual(a: Provenance, b: Provenance): boolean {
  return a.source === b.source && a.licence === b.licence && a.date === b.date;
}

function inventoryIndex(manifest: RegionManifest, inventory: RegionInventory | null): Map<string, RegionInventory["cells"][number]> | null {
  if (inventory === null || inventory.regionId !== manifest.regionId ||
    !Array.isArray(inventory.cells) || inventory.cells.length !== manifest.cells.length) return null;
  const expected = new Set(manifest.cells.map((cell) => cell.id));
  const index = new Map<string, RegionInventory["cells"][number]>();
  for (const cell of inventory.cells) {
    if (!safeId(cell.id) || !expected.has(cell.id) || index.has(cell.id)) return null;
    index.set(cell.id, cell);
  }
  if (index.size !== expected.size) return null;
  const saved = inventory.cells.filter((cell) => cell.state === "saved");
  const savedBytes = saved.reduce((sum, cell) => sum + cell.expectedBytes, 0);
  const expectedBytes = inventory.cells.reduce((sum, cell) => sum + cell.expectedBytes, 0);
  const unknownCount = inventory.cells.length - saved.length;
  if (!safeBytes(savedBytes) || !safeBytes(expectedBytes) ||
    inventory.savedCount !== saved.length || inventory.unknownCount !== unknownCount ||
    inventory.savedBytes !== savedBytes || inventory.expectedBytes !== expectedBytes ||
    inventory.complete !== (unknownCount === 0)) return null;
  return index;
}

function receiptCell(cell: RegionManifest["cells"][number], observed: RegionInventory["cells"][number] | undefined): PackReceiptCell {
  const source = { source: cell.provenance.source, licence: cell.provenance.licence, date: cell.provenance.date };
  if (!observed || observed.expectedBytes !== cell.bytes || !sourceEqual(observed.provenance, source)) {
    return { id: cell.id, bytes: cell.bytes, source, state: "UNKNOWN", cause: "UNKNOWN" };
  }
  if (observed.cause === "present" && observed.state === "saved") {
    return { id: cell.id, bytes: cell.bytes, source, state: "saved", cause: "present" };
  }
  if (observed.cause === "missing" || observed.cause === "stale" || observed.cause === "unreadable") {
    return { id: cell.id, bytes: cell.bytes, source, state: "UNKNOWN", cause: observed.cause };
  }
  return { id: cell.id, bytes: cell.bytes, source, state: "UNKNOWN", cause: "UNKNOWN" };
}

function orderedCells(cells: readonly PackReceiptCell[]): PackReceiptCell[] {
  return [...cells].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Canonical payload: fixed key order and cell order make the digest reproducible. */
export function receiptCanonicalPayload(receipt: Omit<PackReceipt, "digest"> | PackReceipt): string {
  const cells = orderedCells(receipt.cells).map((cell) => ({
    id: cell.id,
    bytes: cell.bytes,
    source: { source: cell.source.source, licence: cell.source.licence, date: cell.source.date },
    state: cell.state,
    cause: cell.cause,
  }));
  return JSON.stringify({
    schema: "offline-pack-receipt-v1",
    regionId: receipt.regionId,
    capturedAt: receipt.capturedAt,
    status: receipt.status,
    cells,
    savedCount: receipt.savedCount,
    unknownCount: receipt.unknownCount,
    totalBytes: receipt.totalBytes,
  });
}

function cryptoApi(cryptoValue?: ReceiptCrypto): ReceiptCrypto {
  const candidate = cryptoValue ?? globalThis.crypto;
  if (!candidate || !candidate.subtle || typeof candidate.subtle.digest !== "function") {
    throw new Error("SHA-256 is not available in this browser");
  }
  return candidate as ReceiptCrypto;
}

async function digestPayload(payload: string, cryptoValue?: ReceiptCrypto): Promise<string> {
  const api = cryptoApi(cryptoValue);
  const bytes = new TextEncoder().encode(payload);
  const digest = await api.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

/**
 * Capture only manifest metadata and the inventory's explicit local states.
 * An absent, incomplete or contradictory inventory yields UNKNOWN for every
 * cell; a receipt never claims that historical data is currently available.
 */
export async function createPackReceipt(
  manifest: RegionManifest,
  inventory: RegionInventory | null,
  capturedAt: string,
  cryptoValue?: ReceiptCrypto,
): Promise<PackReceipt> {
  validateManifest(manifest);
  if (!validTime(capturedAt)) throw new TypeError("Invalid receipt time");
  const index = inventoryIndex(manifest, inventory);
  const cells = manifest.cells.map((cell) => receiptCell(cell, index?.get(cell.id)));
  const savedCount = cells.filter((cell) => cell.state === "saved").length;
  const unknownCount = cells.length - savedCount;
  const totalBytes = cells.reduce((sum, cell) => sum + cell.bytes, 0);
  if (!Number.isSafeInteger(totalBytes)) throw new RangeError("Receipt byte total overflow");
  const unsigned: Omit<PackReceipt, "digest"> = {
    schema: "offline-pack-receipt-v1",
    regionId: manifest.regionId,
    capturedAt,
    status: unknownCount === 0 ? "recorded" : "UNKNOWN",
    cells,
    savedCount,
    unknownCount,
    totalBytes,
  };
  const digest = await digestPayload(receiptCanonicalPayload(unsigned), cryptoValue);
  return { ...unsigned, digest };
}

export function validatePackReceipt(input: unknown): PackReceipt {
  if (!isObject(input) || input.schema !== "offline-pack-receipt-v1" ||
    !safeId(input.regionId) || !validTime(input.capturedAt) ||
    !STATUSES.includes(input.status as ReceiptStatus) || !Array.isArray(input.cells) ||
    input.cells.length > RECEIPT_MAX_CELLS || !safeBytes(input.savedCount) ||
    !safeBytes(input.unknownCount) || !safeBytes(input.totalBytes) ||
    typeof input.digest !== "string" || !HEX_256.test(input.digest)) {
    throw new TypeError("Invalid receipt");
  }
  const seen = new Set<string>();
  let saved = 0;
  let totalBytes = 0;
  const cells: PackReceiptCell[] = input.cells.map((raw: unknown): PackReceiptCell => {
    if (!isObject(raw) || !safeId(raw.id) || seen.has(raw.id) ||
      !safeBytes(raw.bytes) || !validProvenance(raw.source) ||
      !STATES.includes(raw.state as ReceiptCellState) || !CAUSES.includes(raw.cause as ReceiptCellCause)) {
      throw new TypeError("Invalid receipt cell");
    }
    seen.add(raw.id);
    if ((raw.state === "saved") !== (raw.cause === "present")) throw new TypeError("Contradictory receipt cell");
    if (raw.state === "saved") saved += 1;
    totalBytes += raw.bytes;
    if (!Number.isSafeInteger(totalBytes)) throw new RangeError("Receipt byte total overflow");
    return {
      id: raw.id,
      bytes: raw.bytes,
      source: { source: raw.source.source, licence: raw.source.licence, date: raw.source.date },
      state: raw.state as ReceiptCellState,
      cause: raw.cause as ReceiptCellCause,
    };
  });
  const unknown = cells.length - saved;
  if (input.savedCount !== saved || input.unknownCount !== unknown ||
    input.totalBytes !== totalBytes ||
    input.status !== (unknown === 0 ? "recorded" : "UNKNOWN")) {
    throw new TypeError("Receipt summary does not match its cells");
  }
  return {
    schema: "offline-pack-receipt-v1",
    regionId: input.regionId,
    capturedAt: input.capturedAt,
    status: input.status as ReceiptStatus,
    cells,
    savedCount: saved,
    unknownCount: unknown,
    totalBytes,
    digest: input.digest,
  };
}

/** Recompute the digest. A match detects accidental edits, not who created the file. */
export async function checkPackReceiptDigest(receipt: PackReceipt, cryptoValue?: ReceiptCrypto): Promise<boolean> {
  const checked = validatePackReceipt(receipt);
  const expected = await digestPayload(receiptCanonicalPayload(checked), cryptoValue);
  return expected === checked.digest;
}

export function emptyReceiptBook(regionId: string): ReceiptBook {
  if (!safeId(regionId)) throw new TypeError("Invalid receipt region");
  return { schema: "offline-pack-receipt-book-v1", regionId, receipts: [] };
}

export function validateReceiptBook(input: unknown): ReceiptBook {
  if (!isObject(input) || input.schema !== "offline-pack-receipt-book-v1" ||
    !safeText(input.regionId, RECEIPT_MAX_ID) || !Array.isArray(input.receipts) ||
    input.receipts.length > RECEIPT_MAX_CAPTURES) throw new TypeError("Invalid receipt book");
  const receipts = input.receipts.map((raw) => validatePackReceipt(raw));
  let previous = "";
  const digests = new Set<string>();
  for (const receipt of receipts) {
    if (receipt.regionId !== input.regionId || receipt.capturedAt <= previous || digests.has(receipt.digest)) {
      throw new TypeError("Incompatible receipt history");
    }
    previous = receipt.capturedAt;
    digests.add(receipt.digest);
  }
  return { schema: "offline-pack-receipt-book-v1", regionId: input.regionId, receipts };
}

export function appendPackReceipt(book: ReceiptBook, receipt: PackReceipt): ReceiptBook {
  const checked = validateReceiptBook(book);
  const next = validatePackReceipt(receipt);
  if (checked.receipts.length >= RECEIPT_MAX_CAPTURES) throw new RangeError("Receipt history is full");
  if (next.regionId !== checked.regionId) throw new TypeError("Receipt region mismatch");
  const last = checked.receipts.at(-1);
  if (last && next.capturedAt <= last.capturedAt) throw new RangeError("Receipt time must increase");
  if (checked.receipts.some((item) => item.digest === next.digest)) throw new TypeError("Duplicate receipt");
  return { ...checked, receipts: [...checked.receipts, next] };
}

export function latestReceiptDiff(book: ReceiptBook): ReceiptDiff | null {
  const checked = validateReceiptBook(book);
  if (checked.receipts.length < 2) return null;
  return comparePackReceipts(checked.receipts[checked.receipts.length - 2]!, checked.receipts[checked.receipts.length - 1]!);
}

function sameProvenance(a: Provenance, b: Provenance): boolean {
  return a.source === b.source && a.licence === b.licence && a.date === b.date;
}

function changeFor(before: PackReceiptCell | null, after: PackReceiptCell | null): ReceiptChange {
  if (!before) return after?.state === "UNKNOWN" ? "UNKNOWN" : "added";
  if (!after) return before.state === "UNKNOWN" ? "UNKNOWN" : "removed";
  if (before.state === "saved" && after.state === "UNKNOWN") {
    return after.cause === "missing" || after.cause === "stale" ? "lost" : "UNKNOWN";
  }
  if (before.state === "UNKNOWN" && after.state === "saved") {
    return before.cause === "missing" || before.cause === "stale" ? "saved" : "UNKNOWN";
  }
  if (before.cause === "UNKNOWN" || after.cause === "UNKNOWN") return "UNKNOWN";
  if (!sameProvenance(before.source, after.source)) return "source-changed";
  if (before.bytes !== after.bytes) return "size-changed";
  return "unchanged";
}

/** Compare two historical readings. Imported receipts do not describe current storage. */
export function comparePackReceipts(beforeInput: PackReceipt, afterInput: PackReceipt): ReceiptDiff {
  const before = validatePackReceipt(beforeInput);
  const after = validatePackReceipt(afterInput);
  if (before.regionId !== after.regionId || before.capturedAt > after.capturedAt) {
    throw new TypeError("Receipts cannot be compared");
  }
  const one = new Map(before.cells.map((cell) => [cell.id, cell]));
  const two = new Map(after.cells.map((cell) => [cell.id, cell]));
  const ids = [...new Set([...one.keys(), ...two.keys()])];
  const counts: Record<ReceiptChange, number> = {
    unchanged: 0, saved: 0, lost: 0, "source-changed": 0, "size-changed": 0,
    added: 0, removed: 0, UNKNOWN: 0,
  };
  const rows = ids.map((id): ReceiptDiffRow => {
    const a = one.get(id) ?? null;
    const b = two.get(id) ?? null;
    const change = changeFor(a, b);
    counts[change] += 1;
    return { id, before: a, after: b, change };
  });
  const status: ReceiptStatus = before.status === "UNKNOWN" || after.status === "UNKNOWN" ||
    counts.UNKNOWN > 0 ? "UNKNOWN" : "recorded";
  return { regionId: before.regionId, from: before.capturedAt, to: after.capturedAt, status, rows, counts };
}

export function pageReceiptDiff(diff: ReceiptDiff, query: ReceiptPageQuery): ReceiptPage {
  if (!Number.isSafeInteger(query.offset) || query.offset < 0 ||
    !Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > RECEIPT_PAGE_SIZE ||
    !["all", "changed", "saved", "lost", "UNKNOWN", "added", "removed"].includes(query.filter) ||
    !["listed", "id", "largest", "source", "change"].includes(query.order)) {
    throw new TypeError("Invalid receipt page query");
  }
  const term = query.search.slice(0, 160).normalize("NFKC").trim().toLocaleLowerCase();
  const rows = diff.rows.filter((row) => {
    if (query.filter === "changed" && row.change === "unchanged") return false;
    if (query.filter !== "all" && query.filter !== "changed" && row.change !== query.filter) return false;
    if (!term) return true;
    return [row.id, row.before?.source.source, row.after?.source.source, row.change]
      .some((value) => value?.normalize("NFKC").toLocaleLowerCase().includes(term));
  });
  if (query.order !== "listed") {
    rows.sort((a, b) => {
      if (query.order === "id") return a.id.localeCompare(b.id);
      if (query.order === "source") return (a.after?.source.source ?? a.before?.source.source ?? "").localeCompare(b.after?.source.source ?? b.before?.source.source ?? "") || a.id.localeCompare(b.id);
      if (query.order === "change") return a.change.localeCompare(b.change) || a.id.localeCompare(b.id);
      return (b.after?.bytes ?? b.before?.bytes ?? -1) - (a.after?.bytes ?? a.before?.bytes ?? -1) || a.id.localeCompare(b.id);
    });
  }
  return {
    rows: rows.slice(query.offset, query.offset + query.limit),
    total: rows.length,
    offset: query.offset,
    limit: query.limit,
    previous: query.offset > 0,
    next: query.offset + query.limit < rows.length,
  };
}

export function summarizeReceiptBook(bookInput: ReceiptBook): ReceiptSummary {
  const book = validateReceiptBook(bookInput);
  const latest = book.receipts.at(-1);
  const diff = latestReceiptDiff(book);
  const totalBytes = latest?.totalBytes ?? 0;
  return {
    captures: book.receipts.length,
    saved: latest?.savedCount ?? 0,
    unknown: latest?.unknownCount ?? 0,
    changed: diff?.rows.filter((row) => row.change !== "unchanged").length ?? 0,
    latestAt: latest?.capturedAt ?? null,
    totalBytes: latest ? totalBytes : null,
  };
}

export function encodeReceiptBook(bookInput: ReceiptBook): string {
  const book = validateReceiptBook(bookInput);
  const text = JSON.stringify(book, null, 2) + "\n";
  if (new TextEncoder().encode(text).byteLength > RECEIPT_MAX_BYTES) throw new RangeError("Receipt export is too large");
  return text;
}

export async function parseReceiptBook(
  text: string,
  expectedRegionId: string,
  cryptoValue?: ReceiptCrypto,
): Promise<ReceiptBook> {
  if (new TextEncoder().encode(text).byteLength > RECEIPT_MAX_BYTES) throw new RangeError("Receipt import is too large");
  let raw: unknown;
  try { raw = JSON.parse(text.replace(/^\uFEFF/u, "")); }
  catch { throw new TypeError("Receipt import is not JSON"); }
  const book = validateReceiptBook(raw);
  if (book.regionId !== expectedRegionId) throw new TypeError("Receipt import region mismatch");
  for (const receipt of book.receipts) {
    if (!await checkPackReceiptDigest(receipt, cryptoValue)) throw new TypeError("Receipt digest mismatch");
  }
  return book;
}
