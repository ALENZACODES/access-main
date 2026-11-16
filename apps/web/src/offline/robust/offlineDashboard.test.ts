import { describe, expect, it, vi } from "vitest";
import { createOfflineDashboardModel } from "./offlineDashboard.ts";
import { DASHBOARD_COPY } from "./offlineCopy.ts";
import { type CellStore, type DownloadDependencies, type RegionManifest, type StoredCell } from "./regionDownload.ts";

const provenance = { source: "Community open data", licence: "CC0 1.0", date: "2026-11-15" };
const manifest: RegionManifest = {
  regionId: "demo",
  cells: [
    { id: "a", bytes: 2, provenance },
    { id: "b", bytes: 2, provenance },
    { id: "c", bytes: 2, provenance },
  ],
};

function setup() {
  const files = new Map<string, StoredCell>();
  const store: CellStore = {
    async get(_region, cell) { return files.get(cell); },
    async put(_region, cell, data) { files.set(cell, data); },
  };
  const fetchCell = vi.fn(async (_region: string, cell: RegionManifest["cells"][number]) => cell.bytes);
  const dependencies: DownloadDependencies = {
    store,
    fetchCell,
    estimateStorage: async () => ({ quota: 4_000_000, usage: 0 }),
  };
  return { files, store, fetchCell, dependencies };
}

describe("mounted offline dashboard model", () => {
  it("refreshes inventory and capacity without starting downloads", async () => {
    const f = setup();
    const model = createOfflineDashboardModel(manifest, f.dependencies);
    await model.refresh();
    const state = model.getState();
    expect(state.phase).toBe("ready");
    expect(state.inventory?.unknownCount).toBe(3);
    expect(state.plan?.status).toBe("sufficient");
    expect(f.fetchCell).not.toHaveBeenCalled();
    model.dispose();
  });

  it("downloads on explicit action and rechecks stored contents", async () => {
    const f = setup();
    const model = createOfflineDashboardModel(manifest, f.dependencies);
    await model.refresh();
    await model.download();
    expect(model.getState().inventory?.complete).toBe(true);
    expect(model.getState().lastResult?.completed).toBe(true);
    expect(f.fetchCell).toHaveBeenCalledTimes(3);
    model.dispose();
  });

  it("resumes partial regions without fetching saved cells again", async () => {
    const f = setup();
    let estimates = 0;
    const model = createOfflineDashboardModel(manifest, {
      ...f.dependencies,
      estimateStorage: async () => {
        estimates += 1;
        return estimates === 3 ? { quota: 0, usage: 0 }
          : { quota: 4_000_000, usage: 0 };
      },
    });
    await model.refresh();
    await model.download();
    expect(model.getState().inventory?.savedCount).toBe(1);
    expect(model.getState().inventory?.unknownCount).toBe(2);
    await model.download();
    expect(model.getState().inventory?.complete).toBe(true);
    expect(f.fetchCell).toHaveBeenCalledTimes(3);
    model.dispose();
  });

  it("does not overwrite already stored cells on retry", async () => {
    const f = setup();
    const saved = { bytes: 2, provenance };
    f.files.set("a", saved);
    const model = createOfflineDashboardModel(manifest, f.dependencies);
    await model.refresh();
    await model.download();
    expect(f.files.get("a")).toBe(saved);
    expect(f.fetchCell).toHaveBeenCalledTimes(2);
    model.dispose();
  });

  it("uses UNKNOWN storage estimate rather than promising capacity", async () => {
    const f = setup();
    const model = createOfflineDashboardModel(manifest, {
      ...f.dependencies,
      estimateStorage: async () => { throw new Error("not supported"); },
    });
    await model.refresh();
    expect(model.getState().plan?.status).toBe("unknown");
    await model.download();
    expect(model.getState().lastResult?.reason).toBe("quota");
    expect(model.getState().inventory?.unknownCount).toBe(3);
    model.dispose();
  });

  it("cancels in-flight downloads and leaves missing cells UNKNOWN", async () => {
    const f = setup();
    let release: (() => void) | undefined;
    const waiting = new Promise<void>((resolve) => { release = resolve; });
    const model = createOfflineDashboardModel(manifest, {
      ...f.dependencies,
      fetchCell: async () => { await waiting; return 2; },
    });
    await model.refresh();
    const task = model.download();
    model.cancel();
    release?.();
    await task;
    expect(model.getState().lastResult?.reason).toBe("interrupted");
    expect(model.getState().inventory?.unknownCount).toBe(3);
    model.dispose();
  });

  it("blocks accidental duplicate downloads", async () => {
    const f = setup();
    const model = createOfflineDashboardModel(manifest, f.dependencies);
    await model.refresh();
    const first = model.download();
    const second = model.download();
    expect(first).toBe(second);
    await first;
    expect(f.fetchCell).toHaveBeenCalledTimes(3);
    model.dispose();
  });

  it("notifies listeners and supports unsubscription", async () => {
    const f = setup();
    const model = createOfflineDashboardModel(manifest, f.dependencies);
    const listener = vi.fn();
    const unsubscribe = model.subscribe(listener);
    await model.refresh();
    expect(listener).toHaveBeenCalled();
    const calls = listener.mock.calls.length;
    unsubscribe();
    model.toggleDetails();
    expect(listener).toHaveBeenCalledTimes(calls);
    model.dispose();
  });

  it("keeps UI state from changing after disposal", async () => {
    const f = setup();
    const model = createOfflineDashboardModel(manifest, f.dependencies);
    model.dispose();
    await model.refresh();
    await model.download();
    expect(model.getState().phase).toBe("checking");
  });

  it("treats source-read failures as unknown rather than complete", async () => {
    const f = setup();
    const model = createOfflineDashboardModel(manifest, {
      ...f.dependencies,
      store: {
        ...f.store,
        get: async () => { throw new Error("read problem"); },
      },
    });
    await model.refresh();
    expect(model.getState().inventory?.unknownCount).toBe(3);
    model.dispose();
  });

  it("does not page beyond the inventory", async () => {
    const f = setup();
    const model = createOfflineDashboardModel(manifest, f.dependencies);
    await model.refresh();
    model.setPage(100);
    expect(model.getState().page).toBe(0);
    model.setPage(-1);
    expect(model.getState().page).toBe(0);
    model.toggleDetails();
    expect(model.getState().expanded).toBe(true);
    model.dispose();
  });

  it("contains corresponding English and French labels", () => {
    expect(Object.keys(DASHBOARD_COPY.en).sort()).toEqual(Object.keys(DASHBOARD_COPY.fr).sort());
    for (const language of ["en", "fr"] as const) {
      for (const value of Object.values(DASHBOARD_COPY[language])) {
        expect(value.trim().length).toBeGreaterThan(0);
        expect(value).not.toMatch(/verified|AAA-conformant|real-time|partnership/i);
      }
    }
    expect(DASHBOARD_COPY.fr.description).toContain("INCONNUES");
  });
});
