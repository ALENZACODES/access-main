import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { createEmptyProfile, type CacheEntry, type PackContent, type PackManifest, type UserProfile } from "@access/shared";
import contentText from "../../public/packs/toronto/content.json?raw";
import manifestText from "../../public/packs/toronto/manifest.json?raw";
import { db } from "./db.ts";
import { exportPhrases } from "../profile/exportCopy.ts";
import {
  clearCachedRecords,
  deletePack,
  deleteProfile,
  enqueueReport,
  getPack,
  listOutbox,
  savePack,
  exportProfileText,
  putCacheEntry,
  saveProfile,
  summarizeStorage,
  withdrawStoredConsent,
} from "./repository.ts";

const NOW = "2026-11-13T12:00:00.000Z";

function consented(profile: UserProfile): UserProfile {
  return {
    ...profile,
    equipment_type_general: "manual_chair",
    consent_records: [
      {
        purpose: "store-preferences-on-device",
        policy_version: "privacy-local-1",
        granted_at: NOW,
        withdrawn_at: null,
      },
    ],
  };
}

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
    tier: 0,
    prototype_label: "SEEDED-OPEN-DATA",
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
  it("refuses a save with no consent, then withdraws a granted profile", async () => {
    const empty = createEmptyProfile(NOW, "en");
    await expect(saveProfile(empty)).rejects.toThrow(/consent_required/);
    await saveProfile(consented(empty));
    const summary = await summarizeStorage();
    expect(summary.profile?.equipment_type_general).toBe("manual_chair");
    expect(summary.profile?.storage).toBe("device-only");
    const withdrawn = await withdrawStoredConsent("2026-11-13T16:00:00.000Z");
    expect(withdrawn?.equipment_type_general).toBeNull();
    expect(withdrawn?.consent_records[0]?.withdrawn_at).toBe("2026-11-13T16:00:00.000Z");
    const text = exportProfileText(withdrawn!, exportPhrases("en"));
    expect(text).toContain("Consent withdrawn: 2026-11-13T16:00:00.000Z");
    expect(text).not.toContain("manual_chair");
    expect(text).not.toContain("null");
    expect(text).not.toContain("record_type");
    await deleteProfile();
    expect((await summarizeStorage()).profile).toBeNull();
  });

  it("rejects a live-status cache entry, a verified tier, and a record with no licence", async () => {
    await expect(putCacheEntry({ ...entry, provenance: { ...entry.provenance, tier: 4 } })).rejects.toThrow(/live_status_not_cached/);
    await expect(putCacheEntry({ ...entry, provenance: { ...entry.provenance, tier: 3 } })).rejects.toThrow(/verified_not_in_prototype/);
    await expect(putCacheEntry({ ...entry, id: "bad", provenance: { ...entry.provenance, licence: "" } })).rejects.toThrow(/missing_licence/);
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

describe("offline pack storage", () => {
  it("stores a checked pack, reads it back, and deletes it", async () => {
    const manifest = JSON.parse(manifestText) as PackManifest;
    const content = JSON.parse(contentText) as PackContent;
    await savePack({ pack_id: "toronto", manifest, content, stored_at: NOW });
    expect((await getPack("toronto"))?.content.places).toHaveLength(manifest.counts.places);
    await expect(
      savePack({ pack_id: "toronto", manifest, content: { ...content, places: content.places.slice(1) }, stored_at: NOW }),
    ).rejects.toThrow(/count_mismatch/);
    await deletePack("toronto");
    expect(await getPack("toronto")).toBeNull();
  });

  it("labels a report with the time it was observed, not the time it was queued", async () => {
    const item = await enqueueReport("Ramp blocked by a sign", "osm:node/1", NOW, { observedAt: "2026-11-13T09:15:00.000Z", madeOffline: true });
    expect(item.observed_at).toBe("2026-11-13T09:15:00.000Z");
    expect(item.created_at).toBe(NOW);
    expect(item.made_offline).toBe(true);
    expect((await listOutbox())[0]?.observed_at).toBe("2026-11-13T09:15:00.000Z");
    await expect(enqueueReport("later", null, NOW, { observedAt: "2026-11-14T12:00:00.000Z" })).rejects.toThrow(/in_future/);
  });
});

