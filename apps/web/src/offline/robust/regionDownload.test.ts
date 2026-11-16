import { describe, expect, it } from "vitest";
import {
  downloadRegion,
  lookupOfflineCell,
  regionCellReport,
  OFFLINE_STRINGS,
  type CellStore,
  type DownloadDependencies,
  type RegionManifest,
  type StoredCell,
} from "./index";

const provenance = {
  source: "Ontario open-data example",
  licence: "CC BY 4.0",
  date: "2026-11-15",
};

const manifest: RegionManifest = {
  regionId: "test-region",
  cells: [
    { id: "a", bytes: 3, provenance },
    { id: "b", bytes: 3, provenance },
    { id: "c", bytes: 3, provenance },
  ],
};

function createStore(): CellStore {
  const entries = new Map<string, StoredCell>();
  return {
    async get(regionId, cellId) {
      return entries.get(`${regionId}/${cellId}`);
    },
    async put(regionId, cellId, cell) {
      entries.set(`${regionId}/${cellId}`, cell);
    },
  };
}

function createDependencies(store: CellStore): DownloadDependencies {
  return {
    store,
    estimateStorage: async () => ({ quota: 100 * 1024 * 1024, usage: 0 }),
    fetchCell: async () => 3,
  };
}

describe("offline region robustness", () => {
  it("downloads complete cells with source, licence and date", async () => {
    const store = createStore();
    const result = await downloadRegion(manifest, createDependencies(store));
    expect(result).toEqual({
      regionId: "test-region",
      available: ["a", "b", "c"],
      missing: [],
      completed: true,
      reason: "complete",
    });
    expect(await lookupOfflineCell(manifest, store, "a")).toEqual({
      status: "available",
      provenance,
    });
  });

  it("stops on quota and reports a partial region", async () => {
    const store = createStore();
    let checks = 0;
    const result = await downloadRegion(manifest, {
      ...createDependencies(store),
      estimateStorage: async () => {
        checks += 1;
        return checks === 1
          ? { quota: 10 * 1024 * 1024, usage: 0 }
          : { quota: 100, usage: 100 };
      },
    });
    expect(result).toMatchObject({
      available: ["a"], missing: ["b", "c"], completed: false, reason: "quota",
    });
    expect((await lookupOfflineCell(manifest, store, "b")).status).toBe("missing");
  });

  it("resumes without fetching already committed cells", async () => {
    const store = createStore();
    const fetched: string[] = [];
    const fetchCell: DownloadDependencies["fetchCell"] = async (_regionId, cell) => {
      fetched.push(cell.id);
      return 3;
    };
    let checks = 0;
    const first = await downloadRegion(manifest, {
      store,
      fetchCell,
      estimateStorage: async () => {
        checks += 1;
        return checks === 1
          ? { quota: 10 * 1024 * 1024, usage: 0 }
          : { quota: 0, usage: 0 };
      },
    });
    expect(first.completed).toBe(false);
    const second = await downloadRegion(manifest, {
      ...createDependencies(store), fetchCell,
    });
    expect(second.completed).toBe(true);
    expect(fetched).toEqual(["a", "b", "c"]);
  });

  it("reports pre-existing later cells even after quota stops progress", async () => {
    const store = createStore();
    await store.put("test-region", "c", { bytes: 3, provenance });
    const result = await downloadRegion(manifest, {
      ...createDependencies(store),
      estimateStorage: async () => ({}),
    });
    expect(result.available).toEqual(["c"]);
    expect(result.missing).toEqual(["a", "b"]);
    expect(result.reason).toBe("quota");
  });

  it("labels older copies stale, absent cells missing and unlisted cells UNKNOWN", async () => {
    const store = createStore();
    const older = { ...provenance, date: "2025-01-01" };
    await store.put("test-region", "a", { bytes: 3, provenance: older });
    await store.put("test-region", "b", { bytes: 1, provenance });
    expect(await lookupOfflineCell(manifest, store, "a")).toEqual({
      status: "stale", stored: older, expected: provenance,
    });
    expect((await lookupOfflineCell(manifest, store, "b")).status).toBe("stale");
    expect((await lookupOfflineCell(manifest, store, "c")).status).toBe("missing");
    expect((await lookupOfflineCell(manifest, store, "outside")).status).toBe("unknown");
    const unreadable: CellStore = {
      get: async () => { throw new Error("blocked"); },
      put: async () => undefined,
    };
    expect((await lookupOfflineCell(manifest, unreadable, "a")).status).toBe("unknown");
    expect((await regionCellReport(manifest, store)).map((cell) => cell.lookup.status)).toEqual([
      "stale", "stale", "missing",
    ]);
  });

  it("re-downloads stale cells and then reports them available", async () => {
    const store = createStore();
    await store.put("test-region", "a", { bytes: 3, provenance: { ...provenance, date: "2025-01-01" } });
    const fetched: string[] = [];
    const result = await downloadRegion(manifest, {
      ...createDependencies(store),
      fetchCell: async (_regionId, cell) => { fetched.push(cell.id); return 3; },
    });
    expect(fetched).toEqual(["a", "b", "c"]);
    expect(result.completed).toBe(true);
    expect((await lookupOfflineCell(manifest, store, "a")).status).toBe("available");
  });

  it("does not save partial bytes or download when quota is unknown", async () => {
    const store = createStore();
    const invalid = await downloadRegion(manifest, {
      ...createDependencies(store), fetchCell: async () => 1,
    });
    expect(invalid.reason).toBe("download-error");
    expect(invalid.available).toEqual([]);
    let fetched = false;
    const noQuota = await downloadRegion(manifest, {
      ...createDependencies(store),
      estimateStorage: async () => ({}),
      fetchCell: async () => {
        fetched = true;
        return 3;
      },
    });
    expect(noQuota.reason).toBe("quota");
    expect(fetched).toBe(false);
  });

  it("honours cancellation before writing bytes", async () => {
    const store = createStore();
    const controller = new AbortController();
    const result = await downloadRegion(manifest, {
      ...createDependencies(store),
      fetchCell: async () => {
        controller.abort();
        return 3;
      },
    }, controller.signal);
    expect(result.reason).toBe("interrupted");
    expect((await lookupOfflineCell(manifest, store, "a")).status).toBe("missing");
  });

  it("requires meaningful provenance and valid dates", async () => {
    const store = createStore();
    const invalid: RegionManifest = {
      regionId: "test-region",
      cells: [{ id: "a", bytes: 3, provenance: {
        source: "", licence: "", date: "2026-02-30",
      } }],
    };
    await expect(downloadRegion(invalid, createDependencies(store))).rejects.toThrow(
      "Invalid region cell manifest",
    );
  });

  it("includes bilingual labels without asserting accessibility", () => {
    expect(OFFLINE_STRINGS.en.unknown).toBe("UNKNOWN");
    expect(OFFLINE_STRINGS.fr.unknown).toBe("INCONNU");
    expect(OFFLINE_STRINGS.en.resume).toBeTruthy();
    expect(OFFLINE_STRINGS.fr.resume).toBeTruthy();
    expect(OFFLINE_STRINGS.en.stale).not.toBe(OFFLINE_STRINGS.en.unknown);
    expect(OFFLINE_STRINGS.fr.stale).not.toBe(OFFLINE_STRINGS.fr.unknown);
  });
});
