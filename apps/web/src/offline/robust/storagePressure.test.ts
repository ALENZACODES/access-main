import { describe, expect, it, vi } from "vitest";
import { createPressureController, pressureView } from "./storagePressure.ts";
import type { CellStore, DownloadDependencies, RegionManifest, StoredCell } from "./regionDownload.ts";

const provenance = { source: "Open example", licence: "CC BY 4.0", date: "2026-11-15" };
const manifest: RegionManifest = {
  regionId: "demo",
  cells: [
    { id: "one", bytes: 2, provenance },
    { id: "two", bytes: 2, provenance },
  ],
};

function fixture() {
  const saved = new Map<string, StoredCell>();
  const store: CellStore = {
    async get(_region, cell) { return saved.get(cell); },
    async put(_region, cell, value) { saved.set(cell, value); },
  };
  let quota = 2_000_000;
  const fetchCell = vi.fn(async (_region: string, _cell: RegionManifest["cells"][number]) => _cell.bytes);
  const dependencies: DownloadDependencies = {
    store,
    fetchCell,
    estimateStorage: async () => ({ quota, usage: 0 }),
  };
  return { saved, fetchCell, dependencies, setQuota: (value: number) => { quota = value; } };
}

describe("storage-pressure retry", () => {
  it("shows an honest partial status and retries only missing cells", async () => {
    const data = fixture();
    let estimates = 0;
    const controller = createPressureController(manifest, {
      ...data.dependencies,
      estimateStorage: async () => ({ quota: ++estimates === 1 ? 2_000_000 : 0, usage: 0 }),
    });
    const first = await controller.retry();
    expect(first?.available).toEqual(["one"]);
    expect(first?.missing).toEqual(["two"]);
    expect(first?.reason).toBe("quota");
    expect(pressureView(controller.getState(), "en").details).toContain("UNKNOWN cells: 1");
    expect(pressureView(controller.getState(), "fr").details).toContain("INCONNUES");
    controller.dispose();

    const resumed = createPressureController(manifest, data.dependencies);
    const next = await resumed.retry();
    expect(next?.completed).toBe(true);
    expect(data.fetchCell).toHaveBeenCalledTimes(2);
    expect(data.fetchCell.mock.calls.map((call) => call[1].id)).toEqual(["one", "two"]);
  });

  it("prevents duplicate concurrent retry requests", async () => {
    const data = fixture();
    const controller = createPressureController(manifest, data.dependencies);
    const a = controller.retry();
    const b = controller.retry();
    expect(a).toBe(b);
    await Promise.all([a, b]);
    expect(data.fetchCell).toHaveBeenCalledTimes(2);
    expect(pressureView(controller.getState(), "en").disabled).toBe(true);
  });

  it("does not report success when quota estimates are unavailable", async () => {
    const data = fixture();
    data.setQuota(0);
    const controller = createPressureController(manifest, data.dependencies);
    const result = await controller.retry();
    expect(result?.completed).toBe(false);
    expect(result?.missing).toEqual(["one", "two"]);
    expect(pressureView(controller.getState(), "en").message).toContain("Storage space");
    expect(data.fetchCell).not.toHaveBeenCalled();
  });
});
