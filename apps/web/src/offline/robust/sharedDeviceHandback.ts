import type { Language } from "./regionDownload";

/**
 * A person-led checklist for returning a shared device. It records the
 * person's selections only; it cannot sign out of accounts, erase browser
 * data, remove files, or establish that another service has been closed.
 */
export type HandbackCategory =
  | "accounts"
  | "browser"
  | "downloads"
  | "offline"
  | "paper"
  | "preferences";
export type HandbackItemState = "pending" | "done" | "UNKNOWN" | "not-applicable";
export type HandbackFilter = "all" | "open" | "done" | "UNKNOWN" | "not-applicable";
export type HandbackOrder = "listed" | "category" | "status";
export type HandbackOverall = "in-progress" | "ready" | "UNKNOWN";

export interface HandbackItemDefinition {
  readonly id: string;
  readonly category: HandbackCategory;
  readonly required: boolean;
  readonly order: number;
}

export interface HandbackEntry {
  readonly itemId: string;
  readonly state: HandbackItemState;
  readonly updatedAt: string | null;
}

export interface SharedDeviceHandback {
  readonly schema: "shared-device-handback-v1";
  readonly reviewId: string;
  readonly regionId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly entries: readonly HandbackEntry[];
}

export interface HandbackSummary {
  readonly total: number;
  readonly required: number;
  readonly done: number;
  readonly pending: number;
  readonly unknown: number;
  readonly notApplicable: number;
  readonly remainingRequired: number;
  readonly overall: HandbackOverall;
  readonly updatedAt: string;
}

export interface HandbackQuery {
  readonly search: string;
  readonly category: HandbackCategory | "all";
  readonly filter: HandbackFilter;
  readonly order: HandbackOrder;
  readonly offset: number;
  readonly limit: number;
}

export interface HandbackPage {
  readonly entries: readonly HandbackEntry[];
  readonly total: number;
  readonly offset: number;
  readonly limit: number;
  readonly previous: boolean;
  readonly next: boolean;
}

export interface HandbackIssue {
  readonly code:
    | "invalid-schema"
    | "invalid-review-id"
    | "invalid-region"
    | "invalid-timestamp"
    | "invalid-entries"
    | "missing-entry"
    | "duplicate-entry"
    | "unknown-item"
    | "invalid-state"
    | "invalid-entry-time"
    | "future-entry-time";
  readonly itemId: string | null;
}

export const HANDBACK_MAX_BYTES = 64 * 1024;
export const HANDBACK_MAX_ID = 120;
export const HANDBACK_PAGE_SIZE = 12;
export const HANDBACK_CATEGORIES: readonly HandbackCategory[] = [
  "accounts", "browser", "downloads", "offline", "paper", "preferences",
];
export const HANDBACK_STATES: readonly HandbackItemState[] = [
  "pending", "done", "UNKNOWN", "not-applicable",
];
export const HANDBACK_FILTERS: readonly HandbackFilter[] = [
  "all", "open", "done", "UNKNOWN", "not-applicable",
];
export const HANDBACK_ORDERS: readonly HandbackOrder[] = ["listed", "category", "status"];

/** Fixed prompts; no account names, credentials, or free-form personal details are stored. */
export const HANDBACK_ITEMS: readonly HandbackItemDefinition[] = [
  { id: "account-signout", category: "accounts", required: true, order: 0 },
  { id: "account-profile", category: "accounts", required: true, order: 1 },
  { id: "account-sync", category: "accounts", required: false, order: 2 },
  { id: "browser-session", category: "browser", required: true, order: 3 },
  { id: "browser-history", category: "browser", required: false, order: 4 },
  { id: "browser-permissions", category: "browser", required: false, order: 5 },
  { id: "download-folder", category: "downloads", required: true, order: 6 },
  { id: "temporary-files", category: "downloads", required: false, order: 7 },
  { id: "offline-pack-choice", category: "offline", required: true, order: 8 },
  { id: "offline-page-state", category: "offline", required: false, order: 9 },
  { id: "printed-pages", category: "paper", required: true, order: 10 },
  { id: "written-notes", category: "paper", required: false, order: 11 },
  { id: "external-storage", category: "paper", required: false, order: 12 },
  { id: "display-preferences", category: "preferences", required: false, order: 13 },
  { id: "assistive-settings", category: "preferences", required: false, order: 14 },
] as const;

const ITEM_BY_ID = new Map(HANDBACK_ITEMS.map((item) => [item.id, item]));
const ISO_MILLIS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/u;

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_MILLIS.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString() === value;
}

function validId(value: unknown): value is string {
  return typeof value === "string" && SAFE_ID.test(value) && !value.includes("..");
}

function validRegion(value: unknown): value is string | null {
  return value === null || (validId(value) && value.length <= HANDBACK_MAX_ID);
}

function assertTime(at: string): void {
  if (!validTimestamp(at)) throw new TypeError("Invalid handback timestamp");
}

function checkedEntries(entries: readonly HandbackEntry[]): HandbackEntry[] {
  if (!Array.isArray(entries) || entries.length !== HANDBACK_ITEMS.length) {
    throw new TypeError("Handback entries do not match the checklist");
  }
  const seen = new Set<string>();
  const normalized: HandbackEntry[] = [];
  for (const entry of entries) {
    if (!isObject(entry) || typeof entry.itemId !== "string" ||
      !ITEM_BY_ID.has(entry.itemId) || seen.has(entry.itemId)) {
      throw new TypeError("Invalid or duplicate handback item");
    }
    if (!HANDBACK_STATES.includes(entry.state)) throw new TypeError("Invalid handback state");
    if (entry.updatedAt !== null && !validTimestamp(entry.updatedAt)) {
      throw new TypeError("Invalid handback item timestamp");
    }
    seen.add(entry.itemId);
    normalized.push({
      itemId: entry.itemId,
      state: entry.state,
      updatedAt: entry.updatedAt,
    });
  }
  for (const item of HANDBACK_ITEMS) {
    if (!seen.has(item.id)) throw new TypeError("Missing handback item");
  }
  return HANDBACK_ITEMS.map((item) => normalized.find((entry) => entry.itemId === item.id)!);
}

export function createSharedDeviceHandback(
  reviewId: string,
  regionId: string | null,
  createdAt: string,
): SharedDeviceHandback {
  if (!validId(reviewId)) throw new TypeError("Invalid handback review ID");
  if (!validRegion(regionId)) throw new TypeError("Invalid handback region");
  assertTime(createdAt);
  return {
    schema: "shared-device-handback-v1",
    reviewId,
    regionId,
    createdAt,
    updatedAt: createdAt,
    entries: HANDBACK_ITEMS.map((item) => ({
      itemId: item.id,
      state: "pending",
      updatedAt: null,
    })),
  };
}

/** Validate the portable checklist without trusting its counts or item order. */
export function validateSharedDeviceHandback(value: unknown): SharedDeviceHandback {
  if (!isObject(value) || value.schema !== "shared-device-handback-v1") {
    throw new TypeError("Unsupported handback format");
  }
  if (!validId(value.reviewId)) throw new TypeError("Invalid handback review ID");
  if (!validRegion(value.regionId)) throw new TypeError("Invalid handback region");
  if (!validTimestamp(value.createdAt) || !validTimestamp(value.updatedAt) ||
    value.updatedAt < value.createdAt) throw new TypeError("Invalid handback timestamps");
  if (!Array.isArray(value.entries)) throw new TypeError("Invalid handback entries");
  const entries = checkedEntries(value.entries as HandbackEntry[]);
  for (const entry of entries) {
    if (entry.updatedAt !== null && entry.updatedAt < value.createdAt) {
      throw new TypeError("Handback item predates its review");
    }
    if (entry.updatedAt !== null && entry.updatedAt > value.updatedAt) {
      throw new TypeError("Handback item is newer than its review");
    }
  }
  return {
    schema: "shared-device-handback-v1",
    reviewId: value.reviewId,
    regionId: value.regionId,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    entries,
  };
}

export function updateHandbackEntry(
  reviewInput: SharedDeviceHandback,
  itemId: string,
  state: HandbackItemState,
  at: string,
): SharedDeviceHandback {
  const review = validateSharedDeviceHandback(reviewInput);
  assertTime(at);
  if (!ITEM_BY_ID.has(itemId)) throw new TypeError("Unknown handback item");
  if (!HANDBACK_STATES.includes(state)) throw new TypeError("Invalid handback state");
  if (at < review.updatedAt) throw new RangeError("Handback time must not move backwards");
  return {
    ...review,
    updatedAt: at,
    entries: review.entries.map((entry) => entry.itemId === itemId
      ? { ...entry, state, updatedAt: at }
      : entry),
  };
}

export function resetHandbackEntry(
  reviewInput: SharedDeviceHandback,
  itemId: string,
  at: string,
): SharedDeviceHandback {
  return updateHandbackEntry(reviewInput, itemId, "pending", at);
}

export function summarizeHandback(reviewInput: SharedDeviceHandback): HandbackSummary {
  const review = validateSharedDeviceHandback(reviewInput);
  const requiredIds = new Set(HANDBACK_ITEMS.filter((item) => item.required).map((item) => item.id));
  const done = review.entries.filter((entry) => entry.state === "done").length;
  const pending = review.entries.filter((entry) => entry.state === "pending").length;
  const unknown = review.entries.filter((entry) => entry.state === "UNKNOWN").length;
  const notApplicable = review.entries.filter((entry) => entry.state === "not-applicable").length;
  const remainingRequired = review.entries.filter((entry) =>
    requiredIds.has(entry.itemId) && entry.state !== "done" && entry.state !== "not-applicable",
  ).length;
  const overall: HandbackOverall = unknown > 0 ? "UNKNOWN" : remainingRequired === 0 ? "ready" : "in-progress";
  return {
    total: review.entries.length,
    required: requiredIds.size,
    done,
    pending,
    unknown,
    notApplicable,
    remainingRequired,
    overall,
    updatedAt: review.updatedAt,
  };
}

export function handbackEntry(
  reviewInput: SharedDeviceHandback,
  itemId: string,
): HandbackEntry | null {
  const review = validateSharedDeviceHandback(reviewInput);
  return review.entries.find((entry) => entry.itemId === itemId) ?? null;
}

export function pageHandback(
  reviewInput: SharedDeviceHandback,
  query: HandbackQuery,
): HandbackPage {
  const review = validateSharedDeviceHandback(reviewInput);
  if (!Number.isSafeInteger(query.offset) || query.offset < 0 ||
    !Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > HANDBACK_PAGE_SIZE ||
    !HANDBACK_FILTERS.includes(query.filter) ||
    (query.category !== "all" && !HANDBACK_CATEGORIES.includes(query.category)) ||
    !HANDBACK_ORDERS.includes(query.order)) {
    throw new TypeError("Invalid handback page query");
  }
  const term = query.search.slice(0, 120).normalize("NFKC").toLocaleLowerCase();
  const entries = review.entries.filter((entry) => {
    const definition = ITEM_BY_ID.get(entry.itemId)!;
    if (query.category !== "all" && definition.category !== query.category) return false;
    if (query.filter === "open" && entry.state !== "pending") return false;
    if (query.filter !== "all" && query.filter !== "open" && entry.state !== query.filter) return false;
    if (!term) return true;
    return entry.itemId.includes(term) || definition.category.includes(term);
  });
  if (query.order !== "listed") {
    entries.sort((a, b) => {
      const left = ITEM_BY_ID.get(a.itemId)!;
      const right = ITEM_BY_ID.get(b.itemId)!;
      if (query.order === "category") return left.category.localeCompare(right.category) || left.order - right.order;
      return a.state.localeCompare(b.state) || left.order - right.order;
    });
  }
  return {
    entries: entries.slice(query.offset, query.offset + query.limit),
    total: entries.length,
    offset: query.offset,
    limit: query.limit,
    previous: query.offset > 0,
    next: query.offset + query.limit < entries.length,
  };
}

export function encodeSharedDeviceHandback(reviewInput: SharedDeviceHandback): string {
  const review = validateSharedDeviceHandback(reviewInput);
  const text = JSON.stringify(review, null, 2) + "\n";
  if (new TextEncoder().encode(text).byteLength > HANDBACK_MAX_BYTES) {
    throw new RangeError("Handback export is too large");
  }
  return text;
}

export function parseSharedDeviceHandback(text: string, expectedRegionId: string | null): SharedDeviceHandback {
  if (new TextEncoder().encode(text).byteLength > HANDBACK_MAX_BYTES) {
    throw new RangeError("Handback import is too large");
  }
  let raw: unknown;
  try { raw = JSON.parse(text.replace(/^\uFEFF/u, "")); }
  catch { throw new TypeError("Handback import is not JSON"); }
  const review = validateSharedDeviceHandback(raw);
  if (review.regionId !== expectedRegionId) throw new TypeError("Handback region does not match this page");
  return review;
}

export function handbackCategoryFor(itemId: string): HandbackCategory | null {
  return ITEM_BY_ID.get(itemId)?.category ?? null;
}

export function handbackRequired(itemId: string): boolean {
  return ITEM_BY_ID.get(itemId)?.required ?? false;
}

export function handbackStatusText(state: HandbackItemState, language: Language): string {
  const en: Record<HandbackItemState, string> = {
    pending: "Not reviewed",
    done: "Marked complete",
    UNKNOWN: "UNKNOWN",
    "not-applicable": "Not applicable",
  };
  const fr: Record<HandbackItemState, string> = {
    pending: "À examiner",
    done: "Indiqué comme terminé",
    UNKNOWN: "UNKNOWN",
    "not-applicable": "Sans objet",
  };
  return language === "fr" ? fr[state] : en[state];
}
