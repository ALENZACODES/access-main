import { describe, expect, it } from "vitest";
import records from "./fixtures/access-tools-directory-06c9d4b.json" with { type: "json" };
import { validateCacheEntry, type CacheEntry } from "./cache.ts";
import { validateDirectoryRecord, type DirectoryRecord } from "./directory.ts";

/**
 * Real directory records from ALENZACODES/access-tools packages/navigator
 * at 06c9d4b9324414543b1569f018e2aa54cbaa1876.
 * That head publishes directory-record-1.0.0 with verificationTier
 * "administrator_page". The shell stores each link with provenance tier E.
 */
const RECORDS = records as DirectoryRecord[];

function stored(record: DirectoryRecord, tier: CacheEntry["provenance"]["tier"] = "E"): CacheEntry {
  return {
    id: record.id,
    kind: "directory-link",
    title: record.name.en,
    stored_at: "2026-11-13T18:00:00.000Z",
    provenance: {
      source_name: record.sourceName,
      source_url: record.officialUrl,
      licence: record.licenceNote.en,
      licence_url: null,
      source_date: record.retrievedOn,
      retrieved_at: "2026-11-13T18:00:00.000Z",
      tier,
      prototype_label: "PROTOTYPE-UNVERIFIED",
      freshness: "unknown",
    },
    contains_live_status: false,
    payload: record as unknown as Record<string, unknown>,
  };
}

describe("access-tools directory records", () => {
  it("accepts every record from 06c9d4b and stores it as tier E", () => {
    expect(RECORDS.length).toBeGreaterThan(0);
    expect(new Set(RECORDS.map((record) => record.id)).size).toBe(RECORDS.length);
    for (const record of RECORDS) {
      expect(record.schemaVersion, record.id).toBe("directory-record-1.0.0");
      expect(record.verificationTier, record.id).toBe("administrator_page");
      expect(record.notEligibilityAdvice, record.id).toBe(true);
      expect(validateDirectoryRecord(record), record.id).toEqual([]);
      expect(validateCacheEntry(stored(record)), record.id).toEqual([]);
      expect(validateCacheEntry(stored(record, 0)).some((issue) => issue.code === "invalid_tier")).toBe(true);
    }
  });

  it("rejects the old 1.1.0 record that carried tier E on the payload", () => {
    const [sample] = RECORDS;
    expect(sample).toBeDefined();
    const old = {
      ...(sample as DirectoryRecord),
      schemaVersion: "directory-record-1.1.0",
      verificationTier: undefined,
      tier: "E",
    };
    const issues = validateDirectoryRecord(old);
    expect(issues.some((issue) => issue.field === "payload.schemaVersion")).toBe(true);
    expect(issues.some((issue) => issue.field === "payload.verificationTier")).toBe(true);
    const storedOld = stored(sample as DirectoryRecord);
    storedOld.payload = old as unknown as Record<string, unknown>;
    expect(validateCacheEntry(storedOld).length).toBeGreaterThan(0);
  });
});
