import type { RegionManifest } from "./regionDownload";
import type { RegionInventory } from "./regionInventory";

/** A saved data file is NOT a statement about accessibility at a physical location. */
export type DependencyCategory = "arrival" | "entrance" | "indoor" | "washroom" | "transit" | "communication" | "other";
export type DependencyPriority = "essential" | "useful" | "optional";
export type DependencyProgress = "not-reviewed" | "asked" | "response-recorded" | "follow-up";
export type DataAvailability = "saved" | "UNKNOWN";
export type DependencySort = "added" | "priority" | "name" | "availability";
export type DependencyFilter = "all" | "essential" | "UNKNOWN" | "saved" | "follow-up";
export interface DependencyItem {
  readonly id: string;
  readonly category: DependencyCategory;
  readonly title: string;
  readonly purpose: string;
  readonly cellIds: readonly string[];
  readonly priority: DependencyPriority;
  readonly progress: DependencyProgress;
  readonly note: string;
  readonly createdOn: string;
  readonly changedOn: string;
}
export interface DependencyBook {
  readonly schema: "offline-dependency-book-v1";
  readonly regionId: string;
  readonly outingLabel: string;
  readonly createdOn: string;
  readonly changedOn: string;
  readonly items: readonly DependencyItem[];
}
export interface DependencyUpdate {
  readonly title?: string;
  readonly purpose?: string;
  readonly cellIds?: readonly string[];
  readonly category?: DependencyCategory;
  readonly priority?: DependencyPriority;
  readonly progress?: DependencyProgress;
  readonly note?: string;
}
export interface DependencySource {
  readonly source: string;
  readonly licence: string;
  readonly date: string;
}
export interface DependencyCell {
  readonly cellId: string;
  readonly availability: DataAvailability;
  readonly reason: string;
  readonly expectedBytes: number | null;
  readonly source: DependencySource | null;
}
export interface DependencyAssessment {
  readonly itemId: string;
  readonly title: string;
  readonly priority: DependencyPriority;
  readonly progress: DependencyProgress;
  readonly cells: readonly DependencyCell[];
  readonly availability: DataAvailability;
  readonly physicalAccess: "UNKNOWN";
  readonly missingCount: number;
  readonly savedCount: number;
  readonly followUp: boolean;
}
export interface DependencySummary {
  readonly total: number;
  readonly essentials: number;
  readonly savedInformation: number;
  readonly unknownInformation: number;
  readonly essentialUnknown: number;
  readonly requireFollowUp: number;
  readonly dataStatus: DataAvailability;
  readonly physicalAccess: "UNKNOWN";
}
export interface DependencyPage {
  readonly rows: readonly DependencyAssessment[];
  readonly total: number;
  readonly previous: boolean;
  readonly next: boolean;
}
export const DEPENDENCY_MAX_ITEMS = 120;
export const DEPENDENCY_MAX_CELLS = 32;
export const DEPENDENCY_MAX_IMPORT_BYTES = 196608;
export const DEPENDENCY_MAX_TEXT = 1200;
export const DEPENDENCY_MAX_LABEL = 140;
const categories: readonly DependencyCategory[] = ["arrival", "entrance", "indoor", "washroom", "transit", "communication", "other"];
const priorities: readonly DependencyPriority[] = ["essential", "useful", "optional"];
const progresses: readonly DependencyProgress[] = ["not-reviewed", "asked", "response-recorded", "follow-up"];
const rank: Record<DependencyPriority, number> = { essential: 0, useful: 1, optional: 2 };
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function limited(value: unknown, max: number, empty = false): value is string {
  return typeof value === "string" && value.length <= max && (empty || value.trim().length > 0) && !Array.from(value).some((ch) => { const point = ch.codePointAt(0) ?? 0; return point < 32 && point !== 9 && point !== 10 && point !== 13 || point === 127; });
}
export function validDependencyDate(value: unknown): value is string {
  if (typeof value !== "string" || !datePattern.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (y === undefined || m === undefined || d === undefined || y < 1 || y > 9999) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}
function requireDate(date: string): void {
  if (!validDependencyDate(date)) throw new TypeError("Invalid date");
}
function requireText(text: string, max: number, empty = false): void {
  if (!limited(text, max, empty)) throw new TypeError("Invalid text");
}
function normalizedCells(ids: readonly string[]): string[] {
  if (!Array.isArray(ids) || ids.length > DEPENDENCY_MAX_CELLS) throw new RangeError("Too many cell references");
  const result: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    requireText(id, DEPENDENCY_MAX_LABEL);
    if (seen.has(id)) throw new TypeError("Duplicate cell reference");
    seen.add(id);
    result.push(id);
  }
  return result;
}
function checkedItem(item: DependencyItem): DependencyItem {
  requireText(item.id, DEPENDENCY_MAX_LABEL);
  requireText(item.title, DEPENDENCY_MAX_LABEL);
  requireText(item.purpose, DEPENDENCY_MAX_TEXT, true);
  requireText(item.note, DEPENDENCY_MAX_TEXT, true);
  requireDate(item.createdOn);
  requireDate(item.changedOn);
  if (item.changedOn < item.createdOn) throw new TypeError("Changed date predates creation");
  if (!categories.includes(item.category) || !priorities.includes(item.priority) || !progresses.includes(item.progress)) throw new TypeError("Unsupported item state");
  return { ...item, cellIds: normalizedCells(item.cellIds) };
}
export function createDependencyBook(regionId: string, outingLabel: string, date: string): DependencyBook {
  requireText(regionId, DEPENDENCY_MAX_LABEL);
  requireText(outingLabel, DEPENDENCY_MAX_LABEL);
  requireDate(date);
  return { schema: "offline-dependency-book-v1", regionId, outingLabel, createdOn: date, changedOn: date, items: [] };
}
export function addDependency(book: DependencyBook, item: Omit<DependencyItem, "createdOn" | "changedOn">, date: string): DependencyBook {
  validateDependencyBook(book);
  requireDate(date);
  if (date < book.createdOn) throw new TypeError("Date predates book");
  if (book.items.length >= DEPENDENCY_MAX_ITEMS) throw new RangeError("Book is full");
  if (book.items.some((value) => value.id === item.id)) throw new TypeError("Duplicate dependency ID");
  const next = checkedItem({ ...item, createdOn: date, changedOn: date });
  return { ...book, items: [...book.items, next], changedOn: date };
}
export function editDependency(book: DependencyBook, id: string, patch: DependencyUpdate, date: string): DependencyBook {
  validateDependencyBook(book);
  requireDate(date);
  const current = book.items.find((item) => item.id === id);
  if (!current) throw new RangeError("Unknown dependency");
  if (date < current.changedOn || date < book.changedOn) throw new TypeError("Out-of-order edit");
  const allowed = new Set(["title", "purpose", "cellIds", "category", "priority", "progress", "note"]);
  if (Object.keys(patch).some((key) => !allowed.has(key))) throw new TypeError("Unsupported edit field");
  const next = checkedItem({ ...current, ...patch, changedOn: date });
  return { ...book, changedOn: date, items: book.items.map((item) => item.id === id ? next : item) };
}
export function removeDependency(book: DependencyBook, id: string, date: string): DependencyBook {
  validateDependencyBook(book);
  requireDate(date);
  if (date < book.changedOn) throw new TypeError("Out-of-order removal");
  if (!book.items.some((item) => item.id === id)) throw new RangeError("Unknown dependency");
  return { ...book, changedOn: date, items: book.items.filter((item) => item.id !== id) };
}
export function renameOuting(book: DependencyBook, title: string, date: string): DependencyBook {
  validateDependencyBook(book);
  requireText(title, DEPENDENCY_MAX_LABEL);
  requireDate(date);
  if (date < book.changedOn) throw new TypeError("Out-of-order change");
  return { ...book, outingLabel: title, changedOn: date };
}
export function validateDependencyBook(value: unknown): asserts value is DependencyBook {
  if (!record(value) || value.schema !== "offline-dependency-book-v1") throw new TypeError("Unsupported dependency book");
  requireText(value.regionId as string, DEPENDENCY_MAX_LABEL);
  requireText(value.outingLabel as string, DEPENDENCY_MAX_LABEL);
  requireDate(value.createdOn as string);
  requireDate(value.changedOn as string);
  if ((value.changedOn as string) < (value.createdOn as string)) throw new TypeError("Book chronology invalid");
  if (!Array.isArray(value.items) || value.items.length > DEPENDENCY_MAX_ITEMS) throw new RangeError("Invalid item list");
  const seen = new Set<string>();
  for (const raw of value.items) {
    if (!record(raw)) throw new TypeError("Invalid item");
    const expected = ["id", "title", "purpose", "note", "cellIds", "category", "priority", "progress", "createdOn", "changedOn"];
    if (expected.some((key) => !(key in raw)) || Object.keys(raw).some((key) => !expected.includes(key))) throw new TypeError("Unexpected item field");
    const item = checkedItem(raw as unknown as DependencyItem);
    if (item.createdOn < (value.createdOn as string) || item.changedOn > (value.changedOn as string)) throw new TypeError("Item chronology invalid");
    if (seen.has(item.id)) throw new TypeError("Duplicate item");
    seen.add(item.id);
  }
}
export function serializeDependencyBook(book: DependencyBook): string {
  validateDependencyBook(book);
  const encoded = `${JSON.stringify(book, null, 2)}\n`;
  if (new TextEncoder().encode(encoded).byteLength > DEPENDENCY_MAX_IMPORT_BYTES) throw new RangeError("Book too large");
  return encoded;
}
export function parseDependencyBook(raw: string, expectedRegionId: string): DependencyBook {
  if (typeof raw !== "string" || new TextEncoder().encode(raw).byteLength > DEPENDENCY_MAX_IMPORT_BYTES) throw new RangeError("Import exceeds size limit");
  let parsed: unknown;
  try { parsed = JSON.parse(raw) as unknown; } catch { throw new TypeError("Malformed JSON"); }
  validateDependencyBook(parsed);
  if (parsed.regionId !== expectedRegionId) throw new TypeError("Different region");
  const book = parsed;
  return { ...book, items: book.items.map((item) => ({ ...item, cellIds: [...item.cellIds] })) };
}
function sourceForCell(manifest: RegionManifest, cellId: string): DependencyCell {
  const listed = manifest.cells.find((cell) => cell.id === cellId);
  if (!listed) return { cellId, availability: "UNKNOWN", expectedBytes: null, source: null, reason: "not-listed" };
  if (!limited(listed.provenance.source, DEPENDENCY_MAX_LABEL) || !limited(listed.provenance.licence, DEPENDENCY_MAX_LABEL) ||
    !validDependencyDate(listed.provenance.date) || !Number.isSafeInteger(listed.bytes) || listed.bytes < 0)
    return { cellId, availability: "UNKNOWN", expectedBytes: null, source: null, reason: "source-invalid" };
  return { cellId, availability: "UNKNOWN", expectedBytes: Number.isSafeInteger(listed.bytes) && listed.bytes >= 0 ? listed.bytes : null,
    source: { source: listed.provenance.source, licence: listed.provenance.licence, date: listed.provenance.date }, reason: "inventory-unavailable" };
}
export function assessDependency(book: DependencyBook, manifest: RegionManifest, inventory: RegionInventory | null): readonly DependencyAssessment[] {
  validateDependencyBook(book);
  const consistent = manifest.regionId === book.regionId && inventory?.regionId === manifest.regionId &&
    inventory.cells.length === manifest.cells.length && new Set(inventory.cells.map((cell) => cell.id)).size === inventory.cells.length;
  const observed = consistent && inventory !== null ? new Map(inventory.cells.map((cell) => [cell.id, cell])) : new Map();
  return book.items.map((item): DependencyAssessment => {
    const cells = item.cellIds.map((id): DependencyCell => {
      const base = sourceForCell(manifest, id);
      const record = observed.get(id);
      if (!record || !base.source || base.expectedBytes === null) return base;
      const aligned = record.expectedBytes === base.expectedBytes && record.provenance.source === base.source.source &&
        record.provenance.licence === base.source.licence && record.provenance.date === base.source.date;
      if (!aligned) return { ...base, reason: "source-conflict" };
      return record.state === "saved" && record.cause === "present"
        ? { ...base, availability: "saved", reason: "present" }
        : { ...base, reason: record.cause || "UNKNOWN" };
    });
    const savedCount = cells.filter((cell) => cell.availability === "saved").length;
    const missingCount = cells.length - savedCount;
    return { itemId: item.id, title: item.title, priority: item.priority, progress: item.progress,
      cells, availability: cells.length > 0 && missingCount === 0 ? "saved" : "UNKNOWN",
      physicalAccess: "UNKNOWN", savedCount, missingCount, followUp: item.progress === "follow-up" || (item.priority === "essential" && missingCount > 0) };
  });
}
export function summarizeDependencies(rows: readonly DependencyAssessment[]): DependencySummary {
  const essential = rows.filter((row) => row.priority === "essential");
  const unknown = rows.filter((row) => row.availability === "UNKNOWN");
  return { total: rows.length, essentials: essential.length, savedInformation: rows.length - unknown.length,
    unknownInformation: unknown.length, essentialUnknown: essential.filter((row) => row.availability === "UNKNOWN").length,
    requireFollowUp: rows.filter((row) => row.followUp).length, dataStatus: unknown.length === 0 && rows.length > 0 ? "saved" : "UNKNOWN",
    physicalAccess: "UNKNOWN" };
}
export function pageDependencies(rows: readonly DependencyAssessment[], options: {
  readonly filter: DependencyFilter; readonly sort: DependencySort; readonly query: string; readonly offset: number; readonly limit: number;
}): DependencyPage {
  if (!Number.isSafeInteger(options.offset) || options.offset < 0 || !Number.isSafeInteger(options.limit) || options.limit < 1 || options.limit > 50) throw new RangeError("Invalid page");
  if (options.query.length > 160) throw new RangeError("Search too long");
  const query = options.query.toLocaleLowerCase();
  const filtered = rows.filter((row) => row.title.toLocaleLowerCase().includes(query) &&
    (options.filter === "all" || options.filter === "essential" && row.priority === "essential" ||
      options.filter === "UNKNOWN" && row.availability === "UNKNOWN" || options.filter === "saved" && row.availability === "saved" ||
      options.filter === "follow-up" && row.followUp));
  const indexed = filtered.map((row, index) => ({ row, index }));
  if (options.sort === "name") indexed.sort((a, b) => a.row.title.localeCompare(b.row.title) || a.index - b.index);
  else if (options.sort === "priority") indexed.sort((a, b) => rank[a.row.priority] - rank[b.row.priority] || a.index - b.index);
  else if (options.sort === "availability") indexed.sort((a, b) => (a.row.availability === "UNKNOWN" ? 0 : 1) - (b.row.availability === "UNKNOWN" ? 0 : 1) || a.index - b.index);
  else if (options.sort !== "added") throw new TypeError("Unsupported order");
  return { rows: indexed.slice(options.offset, options.offset + options.limit).map((entry) => entry.row),
    total: indexed.length, previous: options.offset > 0, next: options.offset + options.limit < indexed.length };
}
