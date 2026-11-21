import type { RegionManifest } from "./regionDownload";
import type { RegionInventory } from "./regionInventory";

/** Personal notes are not evidence of physical accessibility. */
export type SheetCategory = "arrival" | "entrance" | "route" | "washroom" | "rest" | "communication" | "departure" | "other";
export type SheetPriority = "essential" | "helpful" | "optional";
export type SheetReply = "not-asked" | "asked" | "reply-noted";
export type SheetFilter = "all" | "UNKNOWN" | "saved" | "needs-reply" | "essential";
export type SheetSort = "ordered" | "priority" | "category" | "cell";
export const SHEET_VERSION = "offline-question-sheet-v1" as const;
export const SHEET_MAX_ITEMS = 120;
export const SHEET_MAX_BYTES = 131072;
export const SHEET_MAX_NOTE = 1200;
export const SHEET_MAX_TEXT = 400;
export const SHEET_PAGE_SIZE = 10;
export const SHEET_CATEGORIES: readonly SheetCategory[] = ["arrival", "entrance", "route", "washroom", "rest", "communication", "departure", "other"];
export const SHEET_PRIORITIES: readonly SheetPriority[] = ["essential", "helpful", "optional"];
export const SHEET_REPLIES: readonly SheetReply[] = ["not-asked", "asked", "reply-noted"];

export interface SheetItem {
  readonly id: string;
  readonly cellId: string | null;
  readonly category: SheetCategory;
  readonly priority: SheetPriority;
  readonly question: string;
  readonly note: string;
  readonly reply: SheetReply;
  readonly replyText: string;
  readonly position: number;
}
export interface QuestionSheet {
  readonly schema: typeof SHEET_VERSION;
  readonly regionId: string;
  readonly title: string;
  readonly items: readonly SheetItem[];
}
export interface ItemInput {
  readonly cellId?: string | null;
  readonly category: SheetCategory;
  readonly priority: SheetPriority;
  readonly question: string;
  readonly note?: string;
}
export interface SheetAssessment {
  readonly id: string;
  readonly cellId: string | null;
  readonly storage: "saved" | "UNKNOWN";
  readonly source: string;
  readonly licence: string;
  readonly date: string;
  readonly physical: "UNKNOWN";
  readonly reason: "present" | "missing" | "stale" | "unreadable" | "unlisted" | "inventory-unavailable" | "source-conflict";
  readonly reply: SheetReply;
  readonly priority: SheetPriority;
  readonly category: SheetCategory;
  readonly position: number;
  readonly question: string;
  readonly note: string;
  readonly replyText: string;
}
export interface SheetSummary {
  readonly total: number;
  readonly savedData: number;
  readonly unknownData: number;
  readonly essential: number;
  readonly unanswered: number;
  readonly repliesNoted: number;
  readonly physical: "UNKNOWN";
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
  const keys = Object.keys(value);
  return required.every((key) => Object.hasOwn(value, key)) && keys.every((key) => required.includes(key) || optional.includes(key));
}
function clean(value: string, limit: number): string {
  const result = [...value].map((char) => {
    const code = char.charCodeAt(0);
    return code < 32 && code !== 9 && code !== 10 && code !== 13 || code >= 0x202a && code <= 0x202e || code >= 0x2066 && code <= 0x2069 ? " " : char;
  }).join("").replace(/\s+/gu, " ").trim();
  if (!result || result.length > limit) throw new RangeError("Invalid sheet text");
  return result;
}
function optionalText(value: string, limit: number): string {
  return value.trim() ? clean(value, limit) : "";
}
function validId(value: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(value);
}
function validCategory(value: unknown): value is SheetCategory { return typeof value === "string" && SHEET_CATEGORIES.some((c) => c === value); }
function validPriority(value: unknown): value is SheetPriority { return typeof value === "string" && SHEET_PRIORITIES.some((c) => c === value); }
function validReply(value: unknown): value is SheetReply { return typeof value === "string" && SHEET_REPLIES.some((c) => c === value); }
function validPosition(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) < SHEET_MAX_ITEMS; }
function knownCell(manifest: RegionManifest, cellId: string | null): boolean {
  return cellId === null || manifest.cells.some((cell) => cell.id === cellId);
}
function checkRegion(manifest: RegionManifest): void {
  if (!manifest.regionId || manifest.regionId.length > 256) throw new TypeError("Invalid region");
  const ids = new Set<string>();
  for (const cell of manifest.cells) {
    if (!cell.id || ids.has(cell.id)) throw new TypeError("Invalid manifest cells");
    ids.add(cell.id);
  }
}
export function emptyQuestionSheet(manifest: RegionManifest, title = "Personal offline questions"): QuestionSheet {
  checkRegion(manifest);
  return { schema: SHEET_VERSION, regionId: manifest.regionId, title: clean(title, SHEET_MAX_TEXT), items: [] };
}
export function changeSheetTitle(sheet: QuestionSheet, title: string): QuestionSheet {
  return { ...sheet, title: clean(title, SHEET_MAX_TEXT) };
}
export function addSheetItem(sheet: QuestionSheet, manifest: RegionManifest, input: ItemInput): QuestionSheet {
  if (sheet.regionId !== manifest.regionId) throw new TypeError("Region mismatch");
  if (sheet.items.length >= SHEET_MAX_ITEMS) throw new RangeError("Sheet capacity reached");
  if (!validCategory(input.category) || !validPriority(input.priority) || !knownCell(manifest, input.cellId ?? null)) throw new TypeError("Invalid question");
  const used = new Set(sheet.items.map((item) => item.id));
  let next = 1;
  while (used.has(`q-${next}`)) next++;
  const item: SheetItem = { id: `q-${next}`, cellId: input.cellId ?? null, category: input.category,
    priority: input.priority, question: clean(input.question, SHEET_MAX_TEXT), note: optionalText(input.note ?? "", SHEET_MAX_NOTE),
    reply: "not-asked", replyText: "", position: sheet.items.length };
  return { ...sheet, items: [...sheet.items, item] };
}
export function updateSheetItem(sheet: QuestionSheet, id: string, update: Partial<Pick<SheetItem, "category" | "priority" | "question" | "note" | "reply" | "replyText">>): QuestionSheet {
  if (!sheet.items.some((item) => item.id === id)) throw new RangeError("Unknown question");
  if (update.category !== undefined && !validCategory(update.category)) throw new TypeError("Invalid category");
  if (update.priority !== undefined && !validPriority(update.priority)) throw new TypeError("Invalid priority");
  if (update.reply !== undefined && !validReply(update.reply)) throw new TypeError("Invalid reply state");
  const items = sheet.items.map((item): SheetItem => {
    if (item.id !== id) return item;
    const reply = update.reply ?? item.reply;
    const replyText = update.replyText === undefined ? item.replyText : optionalText(update.replyText, SHEET_MAX_NOTE);
    if (reply !== "reply-noted" && replyText) throw new TypeError("Reply text requires a recorded reply");
    if (reply === "reply-noted" && !replyText) throw new TypeError("Recorded reply requires text");
    return { ...item, category: update.category ?? item.category, priority: update.priority ?? item.priority,
      question: update.question === undefined ? item.question : clean(update.question, SHEET_MAX_TEXT),
      note: update.note === undefined ? item.note : optionalText(update.note, SHEET_MAX_NOTE), reply, replyText };
  });
  return { ...sheet, items };
}
export function removeSheetItem(sheet: QuestionSheet, id: string): QuestionSheet {
  if (!sheet.items.some((item) => item.id === id)) throw new RangeError("Unknown question");
  return { ...sheet, items: sheet.items.filter((item) => item.id !== id).map((item, position) => ({ ...item, position })) };
}
export function moveSheetItem(sheet: QuestionSheet, id: string, direction: "up" | "down"): QuestionSheet {
  const index = sheet.items.findIndex((item) => item.id === id);
  if (index < 0) throw new RangeError("Unknown question");
  const target = index + (direction === "up" ? -1 : 1);
  if (target < 0 || target >= sheet.items.length) return sheet;
  const items = [...sheet.items];
  const [item] = items.splice(index, 1);
  if (!item) throw new Error("Invalid sheet order");
  items.splice(target, 0, item);
  return { ...sheet, items: items.map((row, position) => ({ ...row, position })) };
}
function validImportedItem(value: unknown, position: number, manifest: RegionManifest): value is SheetItem {
  if (!record(value) || !exactKeys(value, ["id", "cellId", "category", "priority", "question", "note", "reply", "replyText", "position"])) return false;
  if (typeof value.id !== "string" || !validId(value.id) || !validPosition(value.position) || value.position !== position) return false;
  if (!(value.cellId === null || typeof value.cellId === "string") || !knownCell(manifest, value.cellId)) return false;
  if (!validCategory(value.category) || !validPriority(value.priority) || !validReply(value.reply)) return false;
  if (typeof value.question !== "string" || typeof value.note !== "string" || typeof value.replyText !== "string") return false;
  try {
    if (clean(value.question, SHEET_MAX_TEXT) !== value.question) return false;
    if (optionalText(value.note, SHEET_MAX_NOTE) !== value.note) return false;
    if (optionalText(value.replyText, SHEET_MAX_NOTE) !== value.replyText) return false;
    return value.reply === "reply-noted" ? value.replyText.length > 0 : value.replyText.length === 0;
  } catch { return false; }
}
export function parseQuestionSheet(json: string, manifest: RegionManifest): QuestionSheet {
  if (new TextEncoder().encode(json).byteLength > SHEET_MAX_BYTES) throw new RangeError("Sheet too large");
  checkRegion(manifest);
  const value: unknown = JSON.parse(json);
  if (!record(value) || !exactKeys(value, ["schema", "regionId", "title", "items"]) ||
    value.schema !== SHEET_VERSION || value.regionId !== manifest.regionId || typeof value.title !== "string" ||
    !Array.isArray(value.items) || value.items.length > SHEET_MAX_ITEMS) throw new TypeError("Invalid sheet structure");
  if (clean(value.title, SHEET_MAX_TEXT) !== value.title) throw new TypeError("Invalid sheet title");
  const used = new Set<string>();
  for (const [position, item] of value.items.entries()) {
    if (!validImportedItem(item, position, manifest) || used.has(item.id)) throw new TypeError("Invalid sheet item");
    used.add(item.id);
  }
  return value as unknown as QuestionSheet;
}
export function encodeQuestionSheet(sheet: QuestionSheet, manifest: RegionManifest): string {
  return JSON.stringify(parseQuestionSheet(JSON.stringify(sheet), manifest), null, 2) + "\n";
}
export function assessQuestionSheet(sheet: QuestionSheet, manifest: RegionManifest, inventory: RegionInventory | null): readonly SheetAssessment[] {
  if (sheet.regionId !== manifest.regionId) throw new TypeError("Region mismatch");
  const listed = new Map(manifest.cells.map((cell) => [cell.id, cell]));
  const observations = inventory?.regionId === manifest.regionId ? new Map(inventory.cells.map((cell) => [cell.id, cell])) : null;
  return sheet.items.map((item): SheetAssessment => {
    const declared = item.cellId === null ? undefined : listed.get(item.cellId);
    const observed = item.cellId === null ? undefined : observations?.get(item.cellId);
    const meta = declared?.provenance;
    let reason: SheetAssessment["reason"] = !declared ? "unlisted" : !observations ? "inventory-unavailable" : !observed ? "missing" : observed.cause;
    if (declared && observed && (observed.expectedBytes !== declared.bytes || observed.provenance.source !== meta?.source ||
      observed.provenance.licence !== meta?.licence || observed.provenance.date !== meta?.date)) reason = "source-conflict";
    const storage = reason === "present" && observed?.state === "saved" ? "saved" as const : "UNKNOWN" as const;
    return { ...item, storage, source: meta?.source ?? "UNKNOWN", licence: meta?.licence ?? "UNKNOWN",
      date: meta?.date ?? "UNKNOWN", physical: "UNKNOWN", reason };
  });
}
export function summarizeQuestionSheet(rows: readonly SheetAssessment[]): SheetSummary {
  return { total: rows.length, savedData: rows.filter((r) => r.storage === "saved").length,
    unknownData: rows.filter((r) => r.storage === "UNKNOWN").length,
    essential: rows.filter((r) => r.priority === "essential").length,
    unanswered: rows.filter((r) => r.reply !== "reply-noted").length,
    repliesNoted: rows.filter((r) => r.reply === "reply-noted").length, physical: "UNKNOWN" };
}
export function pageQuestionSheet(rows: readonly SheetAssessment[], options: { readonly filter: SheetFilter; readonly sort: SheetSort; readonly query: string; readonly offset: number; readonly limit: number }): { readonly rows: readonly SheetAssessment[]; readonly total: number; readonly next: boolean; readonly previous: boolean } {
  if (!Number.isSafeInteger(options.offset) || options.offset < 0 || !Number.isSafeInteger(options.limit) || options.limit < 1 || options.limit > 100 || options.query.length > 200) throw new RangeError("Invalid page");
  const q = options.query.trim().toLocaleLowerCase();
  const filtered = rows.filter((r) => {
    const matches = !q || [r.question, r.note, r.replyText, r.cellId ?? "", r.category].some((v) => v.toLocaleLowerCase().includes(q));
    if (!matches) return false;
    if (options.filter === "UNKNOWN") return r.storage === "UNKNOWN";
    if (options.filter === "saved") return r.storage === "saved";
    if (options.filter === "needs-reply") return r.reply !== "reply-noted";
    if (options.filter === "essential") return r.priority === "essential";
    return options.filter === "all";
  });
  const weight = (priority: SheetPriority): number => SHEET_PRIORITIES.indexOf(priority);
  if (options.sort === "priority") filtered.sort((a, b) => weight(a.priority) - weight(b.priority) || a.position - b.position);
  if (options.sort === "category") filtered.sort((a, b) => a.category.localeCompare(b.category) || a.position - b.position);
  if (options.sort === "cell") filtered.sort((a, b) => (a.cellId ?? "").localeCompare(b.cellId ?? "") || a.position - b.position);
  return { rows: filtered.slice(options.offset, options.offset + options.limit), total: filtered.length,
    previous: options.offset > 0, next: options.offset + options.limit < filtered.length };
}
