import { describe, expect, it } from "vitest";
import {
  downloadRegion,
  lookupOfflineCell,
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
    fetchCell: async () => new Uint8Array([1, 2, 3]),
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
      data: new Uint8Array([1, 2, 3]),
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
    expect((await lookupOfflineCell(manifest, store, "b")).status).toBe("unknown");
  });

  it("resumes without fetching already committed cells", async () => {
    const store = createStore();
    const fetched: string[] = [];
    const fetchCell: DownloadDependencies["fetchCell"] = async (_regionId, cell) => {
      fetched.push(cell.id);
      return new Uint8Array([1, 2, 3]);
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
    await store.put("test-region", "c", { data: new Uint8Array([1, 2, 3]), provenance });
    const result = await downloadRegion(manifest, {
      ...createDependencies(store),
      estimateStorage: async () => ({}),
    });
    expect(result.available).toEqual(["c"]);
    expect(result.missing).toEqual(["a", "b"]);
    expect(result.reason).toBe("quota");
  });

  it("does not infer availability for unknown, absent or stale cells", async () => {
    const store = createStore();
    await store.put("test-region", "a", {
      data: new Uint8Array([1, 2, 3]),
      provenance: { ...provenance, date: "2025-01-01" },
    });
    await store.put("test-region", "b", {
      data: new Uint8Array([1]), provenance,
    });
    for (const id of ["a", "b", "c", "outside"]) {
      expect((await lookupOfflineCell(manifest, store, id)).status).toBe("unknown");
    }
  });

  it("does not save partial bytes or download when quota is unknown", async () => {
    const store = createStore();
    const invalid = await downloadRegion(manifest, {
      ...createDependencies(store), fetchCell: async () => new Uint8Array([1]),
    });
    expect(invalid.reason).toBe("download-error");
    expect(invalid.available).toEqual([]);
    let fetched = false;
    const noQuota = await downloadRegion(manifest, {
      ...createDependencies(store),
      estimateStorage: async () => ({}),
      fetchCell: async () => {
        fetched = true;
        return new Uint8Array([1, 2, 3]);
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
        return new Uint8Array([1, 2, 3]);
      },
    }, controller.signal);
    expect(result.reason).toBe("interrupted");
    expect((await lookupOfflineCell(manifest, store, "a")).status).toBe("unknown");
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
  });
});
