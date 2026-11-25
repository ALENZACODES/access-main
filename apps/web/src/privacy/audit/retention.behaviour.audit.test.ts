// CI audit: the limits in the retention list are what the code does, not only what its constants say.
// Each row with a limit is driven through the App's own writer, and the stored result is measured.

import { describe, expect, it } from "vitest";
import { MAX_ACTIVITY_ENTRIES, loadActivity, recordActivity } from "../panel/activityLog";
import { SEEN_TTL_DAYS, saveSeen, seenKey, snapshot } from "../panel/changes";
import { MAX_EGRESS_HOSTS, egressKey, recordBlocked } from "../panel/egressLog";
import { parseEnvelope } from "../panel/expiry";
import { PRIVACY_STORAGE_PREFIX } from "../panel/live";
import { RETENTION_REGISTER, limitOf, type RetentionRow } from "../panel/retentionRegister";
import { countItems, lifetimeDays } from "../panel/retentionLive";
import { activityKey } from "../panel/activityLog";
import { createMemoryStorage } from "../panel/storage";

const NOW = new Date(Date.UTC(2026, 10, 20, 12, 0, 0));
const rowFor = (key: string): RetentionRow => {
  const r = RETENTION_REGISTER.find((x) => x.key === key);
  if (r === undefined) throw new Error(`no row for ${key}`);
  return r;
};
const daysOf = (r: RetentionRow): number => limitOf(r, "days")?.days ?? -1;
const maxOf = (r: RetentionRow): number => limitOf(r, "count")?.max ?? -1;

describe("the activity log keeps what its row says", () => {
  const row = rowFor(activityKey(PRIVACY_STORAGE_PREFIX));
  it("never holds more entries than the row's count, however many are written", () => {
    const s = createMemoryStorage();
    for (let i = 0; i < maxOf(row) * 3; i += 1) recordActivity(s, PRIVACY_STORAGE_PREFIX, { kind: "language", lang: "en" }, new Date(NOW.getTime() + i));
    expect(loadActivity(s, PRIVACY_STORAGE_PREFIX, NOW)).toHaveLength(maxOf(row));
    expect(maxOf(row)).toBe(MAX_ACTIVITY_ENTRIES);
  });
  it("sets an end date the row's number of days after the latest save", () => {
    const s = createMemoryStorage();
    recordActivity(s, PRIVACY_STORAGE_PREFIX, { kind: "language", lang: "en" }, NOW);
    const env = parseEnvelope(s.getItem(activityKey(PRIVACY_STORAGE_PREFIX)) ?? "");
    expect(env === null ? -1 : lifetimeDays(env)).toBe(daysOf(row));
  });
  it("moves the end date when a later save happens", () => {
    const s = createMemoryStorage();
    recordActivity(s, PRIVACY_STORAGE_PREFIX, { kind: "language", lang: "en" }, NOW);
    const later = new Date(NOW.getTime() + 10 * 86_400_000);
    recordActivity(s, PRIVACY_STORAGE_PREFIX, { kind: "language", lang: "en" }, later);
    expect(parseEnvelope(s.getItem(activityKey(PRIVACY_STORAGE_PREFIX)) ?? "")?.savedAt).toBe(later.toISOString());
  });
});

describe("the blocked-request log keeps what its row says", () => {
  const row = rowFor(egressKey(PRIVACY_STORAGE_PREFIX));
  it("never holds more addresses than the row's count", () => {
    const s = createMemoryStorage();
    for (let i = 0; i < maxOf(row) * 2; i += 1) recordBlocked(s, PRIVACY_STORAGE_PREFIX, { at: new Date(NOW.getTime() + i).toISOString(), host: `h${i}.example`, scheme: "https:", via: "fetch", reason: "not-listed" }, new Date(NOW.getTime() + i));
    const env = parseEnvelope(s.getItem(egressKey(PRIVACY_STORAGE_PREFIX)) ?? "");
    expect(countItems(env?.v ?? "")).toBe(maxOf(row));
    expect(maxOf(row)).toBe(MAX_EGRESS_HOSTS);
  });
  it("sets an end date the row's number of days after saving", () => {
    const s = createMemoryStorage();
    recordBlocked(s, PRIVACY_STORAGE_PREFIX, { at: NOW.toISOString(), host: "a.example", scheme: "https:", via: "fetch", reason: "not-listed" }, NOW);
    const env = parseEnvelope(s.getItem(egressKey(PRIVACY_STORAGE_PREFIX)) ?? "");
    expect(env === null ? -1 : lifetimeDays(env)).toBe(daysOf(row));
  });
});

describe("the last-seen list keeps what its row says", () => {
  const row = rowFor(seenKey(PRIVACY_STORAGE_PREFIX));
  it("sets an end date the row's number of days after saving", () => {
    const s = createMemoryStorage();
    expect(saveSeen(s, PRIVACY_STORAGE_PREFIX, snapshot([], "2026-11-20"), NOW)).toBe(true);
    const env = parseEnvelope(s.getItem(seenKey(PRIVACY_STORAGE_PREFIX)) ?? "");
    expect(env === null ? -1 : lifetimeDays(env)).toBe(daysOf(row));
    expect(daysOf(row)).toBe(SEEN_TTL_DAYS);
  });
});

describe("every row with a number of days is one the panel's code writes with an end date", () => {
  it("is exactly the three stores above", () => {
    expect(RETENTION_REGISTER.filter((r) => limitOf(r, "days") !== undefined).map((r) => r.key).sort()).toEqual(
      [activityKey(PRIVACY_STORAGE_PREFIX), egressKey(PRIVACY_STORAGE_PREFIX), seenKey(PRIVACY_STORAGE_PREFIX)].sort(),
    );
  });
});
