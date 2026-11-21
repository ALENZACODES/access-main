import { describe, expect, it } from "vitest";
import { ACTIVITY_TTL_DAYS, activityKey, MAX_ACTIVITY_ENTRIES, recordActivity } from "./activityLog";
import { egressKey, MAX_EGRESS_HOSTS, recordBlocked } from "./egressLog";
import { putExpiring } from "./expiry";
import { PRIVACY_STORAGE_PREFIX } from "./live";
import { RETENTION_REGISTER, type Limit, type RetentionRow } from "./retentionRegister";
import { checkRow, checkStored, comparedCount, countItems, lifetimeDays, liveFindingText, liveSummary } from "./retentionLive";
import { createMemoryStorage } from "./storage";

const NOW = new Date(Date.UTC(2026, 10, 20, 12, 0, 0));
const DAY = 86_400_000;
const ref = { path: "apps/web/src/a.ts", name: "N" };
const row = (limits: Limit[], key = "k"): RetentionRow => ({ key, holds: { en: "A", fr: "A" }, files: ["apps/web/src/a.ts"], limits, source: "s", recordedOn: "2026-11-20" });
const days = (n: number): Limit => ({ kind: "days", days: n, from: ref });
const cap = (n: number): Limit => ({ kind: "count", max: n, unit: { en: "x", fr: "x" }, whenFull: "oldest-removed", from: ref });
const envelope = (v: string, savedMs: number, lifeMs: number): string => JSON.stringify({ v, savedAt: new Date(savedMs).toISOString(), expiresAt: new Date(savedMs + lifeMs).toISOString() });

describe("countItems", () => {
  it("counts a list and the addresses in a hosts object", () => {
    expect(countItems("[1,2,3]")).toBe(3);
    expect(countItems("[]")).toBe(0);
    expect(countItems('{"since":"x","hosts":{"a":1,"b":2}}')).toBe(2);
  });
  it("gives null for anything else, so it is not guessed", () => {
    for (const t of ["", "x", "5", "null", '"s"', "{}", '{"hosts":[1]}', '{"hosts":5}']) expect(countItems(t), t).toBeNull();
  });
});

describe("lifetimeDays", () => {
  it("rounds to the nearest day", () => {
    expect(lifetimeDays({ savedAt: "2026-01-01T00:00:00.000Z", expiresAt: "2026-01-31T00:00:00.000Z" })).toBe(30);
    expect(lifetimeDays({ savedAt: "2026-01-01T00:00:00.000Z", expiresAt: "2026-01-31T05:00:00.000Z" })).toBe(30);
    expect(lifetimeDays({ savedAt: "2026-01-01T00:00:00.000Z", expiresAt: "2026-01-31T13:00:00.000Z" })).toBe(31);
  });
});

describe("checkRow", () => {
  it("gives nothing for a value that is not stored", () => {
    expect(checkRow(createMemoryStorage(), row([days(5), cap(3)]), NOW)).toEqual([]);
  });
  it("gives nothing for UNKNOWN limits or no limits, even when something is stored", () => {
    const s = createMemoryStorage();
    s.setItem("k", "anything");
    expect(checkRow(s, { ...row([]), limits: "UNKNOWN" }, NOW)).toEqual([]);
    expect(checkRow(s, row([]), NOW)).toEqual([]);
  });
  it("accepts a value saved with the listed number of days", () => {
    const s = createMemoryStorage();
    putExpiring(s, "k", "[1]", NOW, 30);
    expect(checkRow(s, row([days(30), cap(5)]), NOW)).toEqual([]);
  });
  it("finds a value with no end date when the list says it expires", () => {
    const s = createMemoryStorage();
    s.setItem("k", "[1]");
    expect(checkRow(s, row([days(30)]), NOW)).toEqual([{ code: "no-end-date", key: "k", detail: { listed: 30 } }]);
  });
  it("finds a value kept longer than listed, and not one kept shorter", () => {
    const s = createMemoryStorage();
    s.setItem("k", envelope("[]", NOW.getTime(), 40 * DAY));
    expect(checkRow(s, row([days(30)]), NOW)).toEqual([{ code: "longer-than-listed", key: "k", detail: { listed: 30, found: 40 } }]);
    s.setItem("k", envelope("[]", NOW.getTime(), 10 * DAY));
    expect(checkRow(s, row([days(30)]), NOW)).toEqual([]);
  });
  it("allows a minute of difference and not a minute more than that over a whole day", () => {
    const s = createMemoryStorage();
    s.setItem("k", envelope("[]", NOW.getTime(), 30 * DAY + 30_000));
    expect(checkRow(s, row([days(30)]), NOW)).toEqual([]);
    s.setItem("k", envelope("[]", NOW.getTime(), 30 * DAY + 120_000));
    expect(checkRow(s, row([days(30)]), NOW).map((f) => f.code)).toEqual(["longer-than-listed"]);
  });
  it("finds a value still stored after its end date", () => {
    const s = createMemoryStorage();
    s.setItem("k", envelope("[]", NOW.getTime() - 40 * DAY, 30 * DAY));
    expect(checkRow(s, row([days(30)]), NOW)).toEqual([{ code: "past-expiry", key: "k", detail: { listed: 30 } }]);
  });
  it("finds a list longer than its limit, and not one at the limit", () => {
    const s = createMemoryStorage();
    putExpiring(s, "k", JSON.stringify([1, 2, 3, 4]), NOW, 30);
    expect(checkRow(s, row([days(30), cap(4)]), NOW)).toEqual([]);
    expect(checkRow(s, row([days(30), cap(3)]), NOW)).toEqual([{ code: "over-count", key: "k", detail: { listed: 3, found: 4 } }]);
  });
  it("counts a plain list with no envelope when the row has only a count limit", () => {
    const s = createMemoryStorage();
    s.setItem("k", "[1,2,3]");
    expect(checkRow(s, row([cap(5)]), NOW)).toEqual([]);
    expect(checkRow(s, row([cap(2)]), NOW).map((f) => f.code)).toEqual(["over-count"]);
  });
  it("reports a count it cannot read as unreadable, not as fine", () => {
    const s = createMemoryStorage();
    s.setItem("k", "not json");
    expect(checkRow(s, row([cap(5)]), NOW).map((f) => f.code)).toEqual(["unreadable"]);
  });
  it("reports storage that throws as unreadable", () => {
    const s = createMemoryStorage();
    const bad = { ...s, getItem: () => { throw new Error("no"); } };
    expect(checkRow(bad as never, row([days(5)]), NOW).map((f) => f.code)).toEqual(["unreadable"]);
  });
  it("gives more than one finding for one value", () => {
    const s = createMemoryStorage();
    s.setItem("k", envelope(JSON.stringify([1, 2, 3]), NOW.getTime() - 80 * DAY, 60 * DAY));
    expect(checkRow(s, row([days(30), cap(2)]), NOW).map((f) => f.code)).toEqual(["past-expiry", "longer-than-listed", "over-count"]);
  });
});

describe("against the App's own writers", () => {
  it("finds nothing after the activity log and the blocked-request log write their most", () => {
    const s = createMemoryStorage();
    for (let i = 0; i < MAX_ACTIVITY_ENTRIES + 20; i += 1) recordActivity(s, PRIVACY_STORAGE_PREFIX, { kind: "language", lang: "en" }, NOW);
    for (let i = 0; i < MAX_EGRESS_HOSTS + 20; i += 1) recordBlocked(s, PRIVACY_STORAGE_PREFIX, { at: new Date(NOW.getTime() + i).toISOString(), host: `h${i}.example`, scheme: "https:", via: "fetch", reason: "not-listed" }, NOW);
    expect(s.getItem(activityKey(PRIVACY_STORAGE_PREFIX))).not.toBeNull();
    expect(s.getItem(egressKey(PRIVACY_STORAGE_PREFIX))).not.toBeNull();
    expect(checkStored(s, RETENTION_REGISTER, NOW)).toEqual([]);
  });
  it("finds the activity log after it has been stored for longer than its limit allows", () => {
    const s = createMemoryStorage();
    recordActivity(s, PRIVACY_STORAGE_PREFIX, { kind: "language", lang: "en" }, NOW);
    const later = new Date(NOW.getTime() + (ACTIVITY_TTL_DAYS + 1) * DAY);
    expect(checkStored(s, RETENTION_REGISTER, later).map((f) => `${f.code}:${f.key}`)).toEqual([`past-expiry:${activityKey(PRIVACY_STORAGE_PREFIX)}`]);
  });
});

describe("messages and counts", () => {
  it("says each finding in plain words in both languages", () => {
    const f = { key: "k", detail: { listed: 30, found: 40 } };
    expect(liveFindingText("en", { ...f, code: "longer-than-listed" })).toBe("k: its end date is 40 days after saving, but the list says 30.");
    expect(liveFindingText("fr", { ...f, code: "over-count" })).toBe("k : contient 40 éléments, mais la liste indique jusqu’à 30.");
    expect(liveFindingText("en", { ...f, code: "unreadable" })).toBe("k: could not be read, so it was not compared.");
    expect(liveFindingText("fr", { ...f, code: "past-expiry" })).toBe("k : toujours conservé après sa date de fin.");
    expect(liveFindingText("en", { ...f, code: "no-end-date" })).toContain("no end date");
    expect(liveFindingText("fr", { ...f, code: "no-end-date" })).toContain("sans date de fin");
  });
  it("summarises with the right singular and plural", () => {
    expect(liveSummary("en", 1, 0)).toBe("Compared 1 stored item with the list. No differences found.");
    expect(liveSummary("en", 3, 1)).toBe("Compared 3 stored items with the list. 1 difference found.");
    expect(liveSummary("fr", 1, 0)).toBe("1 élément conservé comparé à la liste. Aucune différence trouvée.");
    expect(liveSummary("fr", 2, 2)).toBe("2 éléments conservés comparés à la liste. 2 différences trouvées.");
  });
  it("counts only the rows with a limit that have something stored", () => {
    const s = createMemoryStorage();
    s.setItem("a", "[]");
    s.setItem("b", "[]");
    s.setItem("u", "[]");
    expect(comparedCount(s, [row([days(5)], "a"), row([], "b"), { ...row([], "u"), limits: "UNKNOWN" }, row([cap(3)], "missing")])).toBe(1);
  });
  it("has no sentence that says a value is verified or deleted", () => {
    for (const l of ["en", "fr"] as const) for (const code of ["past-expiry", "longer-than-listed", "no-end-date", "over-count", "unreadable"] as const) expect(liveFindingText(l, { code, key: "k", detail: { listed: 1, found: 2 } })).not.toMatch(/verified|vérif|deleted|supprim/i);
  });
});
