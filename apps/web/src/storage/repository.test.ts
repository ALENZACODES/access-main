import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { createEmptyProfile, type CacheEntry } from "@access/shared";
import { db } from "./db.ts";
import { clearCachedRecords, deleteProfile, enqueueReport, putCacheEntry, saveProfile, summarizeStorage } from "./repository.ts";

const NOW = "2026-11-13T12:00:00.000Z";

const entry: CacheEntry = {
  id: "place-1",
  kind: "place",
  title: "Record without a claimed measurement",
  stored_at: NOW,
  provenance: {
    source_name: "City open data",
    source_url: null,
    licence: "UNKNOWN",
    licence_url: null,
    source_date: "2026-11-01",
    retrieved_at: NOW,
    verification_tier: "UNKNOWN",
    freshness: "unknown",
  },
  contains_live_status: false,
  payload: {},
};

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe("device storage", () => {
  it("saves a profile locally and deletes it without inventing timing", async () => {
    const profile = createEmptyProfile(NOW, "en");
    await saveProfile(profile);
    const summary = await summarizeStorage();
    expect(summary.profile?.max_time_between_washrooms_min).toBeNull();
    expect(summary.profile?.storage).toBe("device-only");
    await deleteProfile();
    expect((await summarizeStorage()).profile).toBeNull();
  });

  it("rejects a live-status cache entry and a record with no licence", async () => {
    await expect(
      putCacheEntry({
        ...entry,
        provenance: { ...entry.provenance, verification_tier: "TIER_4" },
      }),
    ).rejects.toThrow(/live_status_not_cached/);
    await expect(
      putCacheEntry({ ...entry, id: "bad", provenance: { ...entry.provenance, licence: "" } }),
    ).rejects.toThrow(/missing_licence/);
    await putCacheEntry(entry);
    expect((await summarizeStorage()).cacheCount).toBe(1);
  });

  it("keeps queued reports on the device and lists them before a clear", async () => {
    const queued = await enqueueReport("The doorway was narrower than the record said.", null, NOW);
    expect(queued.status).toBe("queued-on-device");
    expect((await summarizeStorage()).outboxCount).toBe(1);
    await clearCachedRecords();
    const after = await summarizeStorage();
    expect(after.outboxCount).toBe(0);
    expect(after.cacheCount).toBe(0);
  });
});
