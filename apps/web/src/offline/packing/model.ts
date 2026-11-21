export const PACKING_LIMITS = {
  title: 120,
  name: 100,
  note: 500,
  id: 64,
  bags: 24,
  items: 240,
  quantity: 999,
} as const;

export interface PackingItem {
  id: string;
  name: string;
  quantity: number;
  packed: number | null;
  returned: number | null;
  note: string;
}

export interface Bag {
  id: string;
  name: string;
  items: PackingItem[];
}

export interface PackingList {
  schema: "offline-packing-list-v1";
  title: string;
  bags: Bag[];
}

export type PackingStage = "packing" | "return";
export type StageStatus = "UNKNOWN" | "pending" | "partial" | "complete";
export type PackingFilter = StageStatus | "outstanding" | "all";

export interface PackingSummary {
  items: number;
  unknown: number;
  pending: number;
  partial: number;
  complete: number;
  /** Sum of the counts the person actually entered for this stage. */
  knownCount: number;
  /** Return-stage expectations require an outbound count for every item. */
  expectedCount: number | null;
  /** A total remaining quantity requires both counts for every item. */
  remainingCount: number | null;
}

type PackingErrorCode =
  | "shape" | "schema" | "name" | "title" | "note" | "id" | "duplicate-id"
  | "bag-limit" | "item-limit" | "quantity" | "packed" | "returned"
  | "bag-not-found" | "item-not-found";

export class PackingError extends Error {
  readonly code: PackingErrorCode;

  constructor(code: PackingErrorCode) {
    super(code);
    this.name = "PackingError";
    this.code = code;
  }
}

const bagKeys = ["id", "name", "items"] as const;
const itemFields = ["name", "quantity", "packed", "returned", "note"] as const;
const itemKeys = ["id", ...itemFields] as const;

function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new PackingError("shape");
  }
  if (Reflect.ownKeys(value).length !== keys.length || !keys.every((key) => Object.hasOwn(value, key))) {
    throw new PackingError("shape");
  }
  return value as Record<string, unknown>;
}

function validText(value: unknown, field: "name" | "title" | "note"): string {
  if (typeof value !== "string" || value.length > PACKING_LIMITS[field]) {
    throw new PackingError(field);
  }
  if (field !== "note" && !value.trim()) throw new PackingError(field);
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (field === "note" && (char === "\n" || char === "\r" || char === "\t")) continue;
    const control = code < 32 || (code >= 127 && code <= 159);
    const lineSeparator = code === 0x2028 || code === 0x2029;
    if (control || (lineSeparator && field !== "note")) throw new PackingError(field);
  }
  return value;
}

function validId(value: unknown): string {
  if (typeof value !== "string" || value.length > PACKING_LIMITS.id ||
      !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value)) {
    throw new PackingError("id");
  }
  return value;
}

function validCount(value: unknown, maximum: number, field: "quantity" | "packed" | "returned"): number {
  const minimum = field === "quantity" ? 1 : 0;
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum || value > maximum) {
    throw new PackingError(field);
  }
  return value === 0 ? 0 : value;
}

function parseItem(value: unknown): PackingItem {
  const row = record(value, itemKeys);
  const quantity = validCount(row.quantity, PACKING_LIMITS.quantity, "quantity");
  const packed = row.packed === null ? null : validCount(row.packed, quantity, "packed");
  if (packed === null && row.returned !== null) throw new PackingError("returned");
  const returned = row.returned === null ? null : validCount(row.returned, packed ?? 0, "returned");
  return {
    id: validId(row.id),
    name: validText(row.name, "name"),
    quantity,
    packed,
    returned,
    note: validText(row.note, "note"),
  };
}

function claimId(seen: Set<string>, id: string): void {
  if (seen.has(id)) throw new PackingError("duplicate-id");
  seen.add(id);
}

/** Decode one complete list. All returned bags and items belong to the new copy. */
export function parsePackingList(value: unknown): PackingList {
  const input = record(value, ["schema", "title", "bags"]);
  if (input.schema !== "offline-packing-list-v1") throw new PackingError("schema");
  const title = validText(input.title, "title");
  if (!Array.isArray(input.bags)) throw new PackingError("shape");
  if (input.bags.length > PACKING_LIMITS.bags) throw new PackingError("bag-limit");
  const ids = new Set<string>();
  let itemCount = 0;
  const bags = Array.from(input.bags, (entry: unknown): Bag => {
    const bag = record(entry, bagKeys);
    const id = validId(bag.id);
    claimId(ids, id);
    const name = validText(bag.name, "name");
    if (!Array.isArray(bag.items)) throw new PackingError("shape");
    itemCount += bag.items.length;
    if (itemCount > PACKING_LIMITS.items) throw new PackingError("item-limit");
    const items = Array.from(bag.items, (item: unknown) => {
      const parsed = parseItem(item);
      claimId(ids, parsed.id);
      return parsed;
    });
    return { id, name, items };
  });
  return { schema: "offline-packing-list-v1", title, bags };
}

export function createPackingList(title: string): PackingList {
  return { schema: "offline-packing-list-v1", title: validText(title, "title"), bags: [] };
}

export function renameList(list: PackingList, title: string): PackingList {
  return { ...list, title: validText(title, "title") };
}

function usedIds(list: PackingList): Set<string> {
  const ids = new Set<string>();
  for (const bag of list.bags) {
    ids.add(bag.id);
    for (const item of bag.items) ids.add(item.id);
  }
  return ids;
}

export function nextId(list: PackingList, kind: "bag" | "item"): string {
  const ids = usedIds(list);
  let serial = 1;
  while (ids.has(kind + "-" + serial)) serial++;
  return kind + "-" + serial;
}

function findBag(list: PackingList, bagId: string): Bag {
  const bag = list.bags.find((entry) => entry.id === bagId);
  if (!bag) throw new PackingError("bag-not-found");
  return bag;
}

function locateItem(list: PackingList, itemId: string): { bag: Bag; item: PackingItem } {
  for (const bag of list.bags) {
    const item = bag.items.find((entry) => entry.id === itemId);
    if (item) return { bag, item };
  }
  throw new PackingError("item-not-found");
}

function replaceBag(list: PackingList, updated: Bag): PackingList {
  return { ...list, bags: list.bags.map((bag) => bag.id === updated.id ? updated : bag) };
}

export function addBag(list: PackingList, id: string, name: string): PackingList {
  if (list.bags.length >= PACKING_LIMITS.bags) throw new PackingError("bag-limit");
  claimId(usedIds(list), validId(id));
  return { ...list, bags: [...list.bags, { id, name: validText(name, "name"), items: [] }] };
}

export function renameBag(list: PackingList, bagId: string, name: string): PackingList {
  const bag = findBag(list, bagId);
  return replaceBag(list, { ...bag, name: validText(name, "name") });
}

export function removeBag(list: PackingList, bagId: string): PackingList {
  const bag = findBag(list, bagId);
  return { ...list, bags: list.bags.filter((entry) => entry.id !== bag.id) };
}

/** Move a selected entry one place. Reaching the end keeps the original array. */
function reorder<T>(entries: T[], entry: T, direction: -1 | 1): T[] {
  if (direction !== -1 && direction !== 1) throw new PackingError("shape");
  const from = entries.indexOf(entry);
  const to = from + direction;
  if (to < 0 || to >= entries.length) return entries;
  const updated = entries.slice();
  updated.splice(from, 1);
  updated.splice(to, 0, entry);
  return updated;
}

export function reorderBag(list: PackingList, bagId: string, direction: -1 | 1): PackingList {
  const bags = reorder(list.bags, findBag(list, bagId), direction);
  return bags === list.bags ? list : { ...list, bags };
}

export function addItem(list: PackingList, bagId: string, item: PackingItem): PackingList {
  const bag = findBag(list, bagId);
  const total = list.bags.reduce((sum, entry) => sum + entry.items.length, 0);
  if (total >= PACKING_LIMITS.items) throw new PackingError("item-limit");
  const parsed = parseItem(item);
  claimId(usedIds(list), parsed.id);
  return replaceBag(list, { ...bag, items: [...bag.items, parsed] });
}

export function updateItem(
  list: PackingList,
  itemId: string,
  patch: Partial<Omit<PackingItem, "id">>,
): PackingList {
  const { bag, item } = locateItem(list, itemId);
  if (!Reflect.ownKeys(patch).every((key) => itemFields.some((field) => field === key))) {
    throw new PackingError("shape");
  }
  const updated = parseItem({ ...item, ...patch });
  return replaceBag(list, { ...bag, items: bag.items.map((row) => row.id === itemId ? updated : row) });
}

export function removeItem(list: PackingList, itemId: string): PackingList {
  const { bag } = locateItem(list, itemId);
  return replaceBag(list, { ...bag, items: bag.items.filter((entry) => entry.id !== itemId) });
}

export function moveItem(list: PackingList, itemId: string, destinationBagId: string): PackingList {
  const { bag: source, item } = locateItem(list, itemId);
  const destination = findBag(list, destinationBagId);
  if (source === destination) return list;
  return {
    ...list,
    bags: list.bags.map((bag) => {
      if (bag === source) return { ...bag, items: bag.items.filter((entry) => entry.id !== itemId) };
      if (bag === destination) return { ...bag, items: [...bag.items, item] };
      return bag;
    }),
  };
}

export function reorderItem(list: PackingList, itemId: string, direction: -1 | 1): PackingList {
  const { bag, item } = locateItem(list, itemId);
  const items = reorder(bag.items, item, direction);
  return items === bag.items ? list : replaceBag(list, { ...bag, items });
}

export function stageStatus(item: PackingItem, stage: PackingStage): StageStatus {
  const expected = stage === "packing" ? item.quantity : item.packed;
  const entered = stage === "packing" ? item.packed : item.returned;
  if (entered === null || expected === null) return "UNKNOWN";
  if (entered === expected) return "complete";
  return entered === 0 ? "pending" : "partial";
}

export function filterItems(bag: Bag, stage: PackingStage, filter: PackingFilter): PackingItem[] {
  return bag.items.filter((item) => {
    const status = stageStatus(item, stage);
    if (filter === "outstanding") return status !== "complete";
    return filter === "all" || status === filter;
  });
}

function summarize(items: PackingItem[], stage: PackingStage): PackingSummary {
  const result: PackingSummary = {
    items: items.length, unknown: 0, pending: 0, partial: 0, complete: 0,
    knownCount: 0, expectedCount: 0, remainingCount: 0,
  };
  for (const item of items) {
    const status = stageStatus(item, stage);
    if (status === "UNKNOWN") result.unknown++;
    else result[status]++;
    const expected = stage === "packing" ? item.quantity : item.packed;
    const entered = stage === "packing" ? item.packed : item.returned;
    if (entered !== null) result.knownCount += entered;
    if (expected === null) result.expectedCount = null;
    else if (result.expectedCount !== null) result.expectedCount += expected;
    if (expected === null || entered === null) result.remainingCount = null;
    else if (result.remainingCount !== null) result.remainingCount += expected - entered;
  }
  return result;
}

export function summarizeBag(bag: Bag, stage: PackingStage): PackingSummary {
  return summarize(bag.items, stage);
}

export function summarizeList(list: PackingList, stage: PackingStage): PackingSummary {
  return summarize(list.bags.flatMap((bag) => bag.items), stage);
}
