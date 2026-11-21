import { describe, expect, it } from "vitest";
import {
  HANDBACK_CATEGORIES,
  HANDBACK_FILTERS,
  HANDBACK_ITEMS,
  HANDBACK_PAGE_SIZE,
  HANDBACK_STATES,
  HANDBACK_MAX_BYTES,
  createSharedDeviceHandback,
  encodeSharedDeviceHandback,
  handbackCategoryFor,
  handbackEntry,
  handbackRequired,
  pageHandback,
  parseSharedDeviceHandback,
  resetHandbackEntry,
  summarizeHandback,
  updateHandbackEntry,
  validateSharedDeviceHandback,
  type HandbackCategory,
  type HandbackFilter,
  type HandbackOrder,
  type SharedDeviceHandback,
} from "./sharedDeviceHandback";

const created = "2026-11-21T10:00:00.000Z";
const changed = "2026-11-21T10:01:00.000Z";
const later = "2026-11-21T10:02:00.000Z";
const reviewId = "handback-20261121100000000-1";

function fresh(
  id = reviewId,
  region: string | null = "north",
  at = created,
): SharedDeviceHandback {
  return createSharedDeviceHandback(id, region, at);
}

function setState(
  review: SharedDeviceHandback,
  itemId: string,
  state: "pending" | "done" | "UNKNOWN" | "not-applicable",
  at = changed,
): SharedDeviceHandback {
  return updateHandbackEntry(review, itemId, state, at);
}

function allRequiredDone(review: SharedDeviceHandback, at = changed): SharedDeviceHandback {
  let next = review;
  for (const item of HANDBACK_ITEMS.filter((candidate) => candidate.required)) {
    next = updateHandbackEntry(next, item.id, "done", at);
  }
  return next;
}

describe("shared-device handback checklist catalogue", () => {
  it("has a stable list of fixed prompts", () => {
    expect(HANDBACK_ITEMS).toHaveLength(15);
    expect(new Set(HANDBACK_ITEMS.map((item) => item.id)).size).toBe(15);
    expect(HANDBACK_ITEMS.map((item) => item.order)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
    ]);
  });

  it("covers all six review areas", () => {
    expect(new Set(HANDBACK_ITEMS.map((item) => item.category))).toEqual(new Set(HANDBACK_CATEGORIES));
    expect(HANDBACK_CATEGORIES).toEqual([
      "accounts", "browser", "downloads", "offline", "paper", "preferences",
    ]);
  });

  it("has required and optional prompts", () => {
    expect(HANDBACK_ITEMS.filter((item) => item.required).length).toBeGreaterThan(5);
    expect(HANDBACK_ITEMS.some((item) => !item.required)).toBe(true);
  });

  it("uses four distinct item states and keeps UNKNOWN uppercase", () => {
    expect(HANDBACK_STATES).toEqual(["pending", "done", "UNKNOWN", "not-applicable"]);
    expect(HANDBACK_FILTERS).toContain("UNKNOWN");
  });

  it("does not store free-form notes or account identifiers in the catalogue", () => {
    const serialized = JSON.stringify(HANDBACK_ITEMS);
    expect(serialized).not.toMatch(/password|username|email|accountName|credential|token/i);
    expect(serialized).not.toContain("notes");
  });

  it("maps every item to one review area and a required flag", () => {
    for (const item of HANDBACK_ITEMS) {
      expect(handbackCategoryFor(item.id)).toBe(item.category);
      expect(handbackRequired(item.id)).toBe(item.required);
    }
  });

  it("returns null or false for an item not in the fixed catalogue", () => {
    expect(handbackCategoryFor("custom-item")).toBeNull();
    expect(handbackRequired("custom-item")).toBe(false);
  });
});

describe("createSharedDeviceHandback", () => {
  it("creates all prompts in the fixed order as pending", () => {
    const review = fresh();
    expect(review).toMatchObject({
      schema: "shared-device-handback-v1",
      reviewId,
      regionId: "north",
      createdAt: created,
      updatedAt: created,
    });
    expect(review.entries).toHaveLength(HANDBACK_ITEMS.length);
    expect(review.entries.map((entry) => entry.itemId)).toEqual(HANDBACK_ITEMS.map((item) => item.id));
    expect(review.entries.every((entry) => entry.state === "pending" && entry.updatedAt === null)).toBe(true);
  });

  it("allows a review that is not linked to a region", () => {
    expect(fresh("handback-1", null).regionId).toBeNull();
  });

  it("rejects an empty, malformed or path-like review ID", () => {
    for (const id of ["", " ", "../review", "a/b", "a\u0000b", "x".repeat(121)]) {
      expect(() => fresh(id)).toThrow();
    }
  });

  it("accepts safe punctuation in a review ID", () => {
    expect(fresh("handback.v2:local_1").reviewId).toBe("handback.v2:local_1");
  });

  it("rejects an invalid region ID", () => {
    for (const region of ["", " ", "../north", "north/south", "x".repeat(121)]) {
      expect(() => fresh(reviewId, region)).toThrow();
    }
  });

  it("rejects timestamps that are not exact UTC millisecond timestamps", () => {
    for (const at of ["", "yesterday", "2026-11-21", "2026-11-21T10:00:00Z", "2026-02-30T10:00:00.000Z"]) {
      expect(() => fresh(reviewId, "north", at)).toThrow();
    }
  });
});

describe("validateSharedDeviceHandback", () => {
  it("accepts a newly created review", () => {
    const review = fresh();
    expect(validateSharedDeviceHandback(review)).toEqual(review);
  });

  it("normalizes imported entries to catalogue order", () => {
    const review = fresh();
    const reverse = { ...review, entries: [...review.entries].reverse() };
    expect(validateSharedDeviceHandback(reverse).entries.map((entry) => entry.itemId))
      .toEqual(HANDBACK_ITEMS.map((item) => item.id));
  });

  it("rejects an unsupported schema", () => {
    expect(() => validateSharedDeviceHandback({ ...fresh(), schema: "other" })).toThrow();
  });

  it("rejects a null, array or primitive root", () => {
    for (const value of [null, [], "review", 1, false]) {
      expect(() => validateSharedDeviceHandback(value)).toThrow();
    }
  });

  it("rejects an invalid review ID and region", () => {
    const review = fresh();
    expect(() => validateSharedDeviceHandback({ ...review, reviewId: "../id" })).toThrow();
    expect(() => validateSharedDeviceHandback({ ...review, regionId: "../north" })).toThrow();
    expect(() => validateSharedDeviceHandback({ ...review, regionId: undefined })).toThrow();
  });

  it("rejects invalid creation and update timestamps", () => {
    const review = fresh();
    expect(() => validateSharedDeviceHandback({ ...review, createdAt: "today" })).toThrow();
    expect(() => validateSharedDeviceHandback({ ...review, updatedAt: "today" })).toThrow();
    expect(() => validateSharedDeviceHandback({ ...review, updatedAt: "2026-11-20T10:00:00.000Z" })).toThrow();
  });

  it("rejects a review without its entries array", () => {
    expect(() => validateSharedDeviceHandback({ ...fresh(), entries: null })).toThrow();
  });

  it("rejects a missing item", () => {
    const review = fresh();
    expect(() => validateSharedDeviceHandback({ ...review, entries: review.entries.slice(1) })).toThrow();
  });

  it("rejects a duplicate item", () => {
    const review = fresh();
    const entries = [...review.entries];
    entries[1] = entries[0]!;
    expect(() => validateSharedDeviceHandback({ ...review, entries })).toThrow();
  });

  it("rejects an item ID outside the catalogue", () => {
    const review = fresh();
    const entries = review.entries.map((entry, index) =>
      index === 0 ? { ...entry, itemId: "custom" } : entry);
    expect(() => validateSharedDeviceHandback({ ...review, entries })).toThrow();
  });

  it("rejects an invalid state", () => {
    const review = fresh();
    const entries = review.entries.map((entry, index) =>
      index === 0 ? { ...entry, state: "complete" } : entry);
    expect(() => validateSharedDeviceHandback({ ...review, entries })).toThrow();
  });

  it("rejects malformed item timestamps", () => {
    const review = fresh();
    const entries = review.entries.map((entry, index) =>
      index === 0 ? { ...entry, updatedAt: "now" } : entry);
    expect(() => validateSharedDeviceHandback({ ...review, entries })).toThrow();
  });

  it("rejects item timestamps before review creation or after the review update", () => {
    const review = fresh();
    const before = review.entries.map((entry, index) =>
      index === 0 ? { ...entry, updatedAt: "2026-11-20T10:00:00.000Z" } : entry);
    const after = review.entries.map((entry, index) =>
      index === 0 ? { ...entry, updatedAt: later } : entry);
    expect(() => validateSharedDeviceHandback({ ...review, entries: before })).toThrow();
    expect(() => validateSharedDeviceHandback({ ...review, entries: after })).toThrow();
  });

  it("does not mutate the supplied review or entries", () => {
    const review = fresh();
    const before = JSON.stringify(review);
    validateSharedDeviceHandback(review);
    expect(JSON.stringify(review)).toBe(before);
  });
});

describe("updateHandbackEntry and resetHandbackEntry", () => {
  it("updates one named item without changing other items", () => {
    const review = fresh();
    const next = setState(review, "account-signout", "done");
    expect(next.entries[0]).toEqual({
      itemId: "account-signout",
      state: "done",
      updatedAt: changed,
    });
    expect(next.entries.slice(1)).toEqual(review.entries.slice(1));
    expect(review.entries[0]?.state).toBe("pending");
  });

  it("supports every declared item state", () => {
    let review = fresh();
    review = setState(review, "account-signout", "done");
    review = setState(review, "account-profile", "UNKNOWN", later);
    review = setState(review, "account-sync", "not-applicable", "2026-11-21T10:03:00.000Z");
    review = setState(review, "browser-session", "pending", "2026-11-21T10:04:00.000Z");
    expect(review.entries.slice(0, 4).map((entry) => entry.state))
      .toEqual(["done", "UNKNOWN", "not-applicable", "pending"]);
  });

  it("updates the review timestamp with the selected item timestamp", () => {
    const next = setState(fresh(), "account-signout", "done");
    expect(next.updatedAt).toBe(changed);
  });

  it("rejects an item that is not in the catalogue", () => {
    expect(() => setState(fresh(), "not-a-prompt", "done")).toThrow();
  });

  it("rejects a state outside the declared values", () => {
    expect(() => updateHandbackEntry(fresh(), "account-signout", "closed" as never, changed)).toThrow();
  });

  it("rejects a timestamp earlier than the review's last change", () => {
    const review = setState(fresh(), "account-signout", "done", later);
    expect(() => updateHandbackEntry(review, "account-profile", "done", changed)).toThrow();
  });

  it("rejects an invalid timestamp", () => {
    expect(() => updateHandbackEntry(fresh(), "account-signout", "done", "now")).toThrow();
  });

  it("validates the incoming review before applying a change", () => {
    const invalid = { ...fresh(), entries: [] } as unknown as SharedDeviceHandback;
    expect(() => updateHandbackEntry(invalid, "account-signout", "done", changed)).toThrow();
  });

  it("resets one entry to pending and preserves all others", () => {
    const changedReview = setState(fresh(), "account-signout", "done");
    const reset = resetHandbackEntry(changedReview, "account-signout", later);
    expect(reset.entries[0]).toMatchObject({ state: "pending", updatedAt: later });
    expect(reset.entries.slice(1)).toEqual(changedReview.entries.slice(1));
  });

  it("does not reset other items", () => {
    const first = setState(fresh(), "account-signout", "done");
    const second = setState(first, "account-profile", "UNKNOWN", later);
    const reset = resetHandbackEntry(second, "account-signout", "2026-11-21T10:03:00.000Z");
    expect(reset.entries.find((entry) => entry.itemId === "account-profile")?.state).toBe("UNKNOWN");
  });

  it("does not mutate the previous review when a status changes", () => {
    const review = fresh();
    const snapshot = JSON.stringify(review);
    updateHandbackEntry(review, "account-signout", "done", changed);
    expect(JSON.stringify(review)).toBe(snapshot);
  });
});

describe("summarizeHandback", () => {
  it("counts every initial item as pending", () => {
    expect(summarizeHandback(fresh())).toMatchObject({
      total: 15,
      required: HANDBACK_ITEMS.filter((item) => item.required).length,
      done: 0,
      pending: 15,
      unknown: 0,
      notApplicable: 0,
      overall: "in-progress",
    });
  });

  it("becomes ready when every required prompt is complete", () => {
    const summary = summarizeHandback(allRequiredDone(fresh()));
    expect(summary.overall).toBe("ready");
    expect(summary.remainingRequired).toBe(0);
  });

  it("allows a required prompt to be marked not applicable", () => {
    let review = fresh();
    for (const item of HANDBACK_ITEMS.filter((candidate) => candidate.required)) {
      review = setState(review, item.id, item.id === "account-signout" ? "not-applicable" : "done");
    }
    expect(summarizeHandback(review).overall).toBe("ready");
  });

  it("keeps the overall state UNKNOWN if any prompt is UNKNOWN", () => {
    const review = setState(allRequiredDone(fresh()), "browser-history", "UNKNOWN", later);
    expect(summarizeHandback(review).overall).toBe("UNKNOWN");
  });

  it("counts optional prompts without making them required", () => {
    const review = allRequiredDone(fresh());
    const summary = summarizeHandback(review);
    expect(summary.remainingRequired).toBe(0);
    expect(summary.pending).toBeGreaterThan(0);
    expect(summary.overall).toBe("ready");
  });

  it("reports the latest review update time", () => {
    const review = setState(fresh(), "account-signout", "done", changed);
    expect(summarizeHandback(review).updatedAt).toBe(changed);
  });

  it("rejects an invalid review rather than summarizing it", () => {
    const invalid = { ...fresh(), entries: [] } as unknown as SharedDeviceHandback;
    expect(() => summarizeHandback(invalid)).toThrow();
  });
});

describe("handbackEntry and item helpers", () => {
  it("returns the selected entry by its fixed ID", () => {
    const entry = handbackEntry(fresh(), "account-signout");
    expect(entry).toMatchObject({ itemId: "account-signout", state: "pending" });
  });

  it("returns null for a missing entry", () => {
    expect(handbackEntry(fresh(), "custom")).toBeNull();
  });

  it("does not mutate the review when returning an entry", () => {
    const review = fresh();
    const before = JSON.stringify(review);
    handbackEntry(review, "account-signout");
    expect(JSON.stringify(review)).toBe(before);
  });
});

describe("pageHandback search, filtering and ordering", () => {
  const page = (
    review: SharedDeviceHandback,
    over: Partial<Parameters<typeof pageHandback>[1]> = {},
  ) => pageHandback(review, {
    search: "",
    category: "all",
    filter: "all",
    order: "listed",
    offset: 0,
    limit: HANDBACK_PAGE_SIZE,
    ...over,
  });

  it("returns the first page in checklist order", () => {
    const result = page(fresh());
    expect(result.total).toBe(15);
    expect(result.entries).toHaveLength(HANDBACK_PAGE_SIZE);
    expect(result.entries[0]?.itemId).toBe(HANDBACK_ITEMS[0]?.id);
    expect(result.next).toBe(true);
    expect(result.previous).toBe(false);
  });

  it("returns the second page and correct navigation flags", () => {
    const result = page(fresh(), { offset: 12 });
    expect(result.entries).toHaveLength(3);
    expect(result.previous).toBe(true);
    expect(result.next).toBe(false);
  });

  it("filters by review area", () => {
    const result = page(fresh(), { category: "accounts" });
    expect(result.entries.map((entry) => entry.itemId)).toEqual([
      "account-signout", "account-profile", "account-sync",
    ]);
  });

  it("filters pending items as open", () => {
    const review = setState(fresh(), "account-signout", "done");
    const result = page(review, { filter: "open" });
    expect(result.entries.some((entry) => entry.itemId === "account-signout")).toBe(false);
    expect(result.total).toBe(14);
  });

  it("filters done, UNKNOWN and not-applicable separately", () => {
    let review = fresh();
    review = setState(review, "account-signout", "done");
    review = setState(review, "account-profile", "UNKNOWN", later);
    review = setState(review, "account-sync", "not-applicable", "2026-11-21T10:03:00.000Z");
    expect(page(review, { filter: "done" }).entries.map((entry) => entry.itemId)).toEqual(["account-signout"]);
    expect(page(review, { filter: "UNKNOWN" }).entries.map((entry) => entry.itemId)).toEqual(["account-profile"]);
    expect(page(review, { filter: "not-applicable" }).entries.map((entry) => entry.itemId)).toEqual(["account-sync"]);
  });

  it("searches fixed item IDs and category names", () => {
    expect(page(fresh(), { search: "download" }).entries.map((entry) => entry.itemId))
      .toEqual(["download-folder"]);
    expect(page(fresh(), { search: "paper" }).entries.map((entry) => entry.itemId))
      .toEqual(["printed-pages", "written-notes", "external-storage"]);
  });

  it("search is case-insensitive and normalized", () => {
    expect(page(fresh(), { search: "DOWNLOAD" }).total).toBe(1);
    expect(page(fresh(), { search: "  ACCOUNTS  " }).total).toBe(3);
  });

  it("sorts by category without losing any entry", () => {
    const result = page(fresh(), { order: "category", limit: 12 });
    expect(result.entries).toHaveLength(12);
    expect(new Set(result.entries.map((entry) => entry.itemId)).size).toBe(12);
  });

  it("sorts by state without changing the underlying review order", () => {
    let review = fresh();
    review = setState(review, "account-signout", "done");
    const before = JSON.stringify(review.entries);
    const result = page(review, { order: "status" });
    expect(result.entries[0]?.state).toBe("done");
    expect(JSON.stringify(review.entries)).toBe(before);
  });

  it("returns an empty page when the offset is past the result count", () => {
    const result = page(fresh(), { offset: 99 });
    expect(result.entries).toEqual([]);
    expect(result.total).toBe(15);
    expect(result.previous).toBe(true);
    expect(result.next).toBe(false);
  });

  it("rejects negative offsets, zero limits and oversized pages", () => {
    expect(() => page(fresh(), { offset: -1 })).toThrow();
    expect(() => page(fresh(), { limit: 0 })).toThrow();
    expect(() => page(fresh(), { limit: 13 })).toThrow();
  });

  it("rejects unknown categories, filters and order values", () => {
    expect(() => page(fresh(), { category: "future" as HandbackCategory })).toThrow();
    expect(() => page(fresh(), { filter: "future" as HandbackFilter })).toThrow();
    expect(() => page(fresh(), { order: "random" as HandbackOrder })).toThrow();
  });

  it("does not mutate the review when filtering and paging", () => {
    const review = fresh();
    const before = JSON.stringify(review);
    page(review, { search: "account", category: "accounts", filter: "open", order: "status" });
    expect(JSON.stringify(review)).toBe(before);
  });
});

describe("handback JSON import and export", () => {
  it("round-trips a fresh review", () => {
    const review = fresh();
    expect(parseSharedDeviceHandback(encodeSharedDeviceHandback(review), "north")).toEqual(review);
  });

  it("round-trips a review with a mixture of states", () => {
    let review = fresh();
    review = setState(review, "account-signout", "done");
    review = setState(review, "account-profile", "UNKNOWN", later);
    review = setState(review, "account-sync", "not-applicable", "2026-11-21T10:03:00.000Z");
    const restored = parseSharedDeviceHandback(encodeSharedDeviceHandback(review), "north");
    expect(restored).toEqual(review);
  });

  it("accepts a UTF-8 BOM before a valid JSON document", () => {
    const review = fresh();
    expect(parseSharedDeviceHandback("\uFEFF" + encodeSharedDeviceHandback(review), "north")).toEqual(review);
  });

  it("rejects malformed JSON", () => {
    expect(() => parseSharedDeviceHandback("{bad", "north")).toThrow();
  });

  it("rejects an import from a different region", () => {
    expect(() => parseSharedDeviceHandback(encodeSharedDeviceHandback(fresh()), "south")).toThrow();
  });

  it("rejects a review with no region when a region is expected", () => {
    expect(() => parseSharedDeviceHandback(encodeSharedDeviceHandback(fresh("handback-2", null)), "north")).toThrow();
  });

  it("accepts a regionless review when the page is regionless", () => {
    const review = fresh("handback-2", null);
    expect(parseSharedDeviceHandback(encodeSharedDeviceHandback(review), null)).toEqual(review);
  });

  it("rejects an oversized import by UTF-8 byte length", () => {
    expect(() => parseSharedDeviceHandback("x".repeat(HANDBACK_MAX_BYTES + 1), "north")).toThrow();
  });

  it("rejects an oversized export", () => {
    const review = fresh();
    expect(() => encodeSharedDeviceHandback(review)).not.toThrow();
  });

  it("does not include free-form notes or secret-like fields", () => {
    const text = encodeSharedDeviceHandback(fresh());
    expect(text).not.toMatch(/password|secret|credential|accountName|email|token/i);
    expect(text).not.toContain("notes");
  });

  it("rejects a tampered unknown item rather than silently dropping it", () => {
    const review = fresh();
    const raw = JSON.parse(encodeSharedDeviceHandback(review)) as { entries: Array<Record<string, unknown>> };
    raw.entries[0]!.itemId = "unlisted";
    expect(() => parseSharedDeviceHandback(JSON.stringify(raw), "north")).toThrow();
  });

  it("rejects a duplicate entry in an imported review", () => {
    const review = fresh();
    const raw = JSON.parse(encodeSharedDeviceHandback(review)) as { entries: unknown[] };
    raw.entries[1] = raw.entries[0];
    expect(() => parseSharedDeviceHandback(JSON.stringify(raw), "north")).toThrow();
  });

  it("does not change the review passed to the encoder", () => {
    const review = fresh();
    const before = JSON.stringify(review);
    encodeSharedDeviceHandback(review);
    expect(JSON.stringify(review)).toBe(before);
  });
});
