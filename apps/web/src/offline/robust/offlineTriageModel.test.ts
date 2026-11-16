import { describe, expect, it, vi } from "vitest";
import { createOfflineDashboardModel } from "./offlineDashboard";
import { type CellStore, type DownloadDependencies, type RegionManifest, type StoredCell } from "./regionDownload";

const provenance = { source: "Public open source", licence: "CC BY 4.0", date: "2026-01-15" };
const manifest: RegionManifest = {
  regionId: "west",
  cells: [
    { id: "one", bytes: 2, provenance },
    { id: "two", bytes: 2, provenance },
    { id: "three", bytes: 2, provenance },
    { id: "four", bytes: 2, provenance },
  ],
};

function setup() {
  const files = new Map<string, StoredCell>();
  const store: CellStore = {
    async get(region, cell) {
      if (region !== "west") throw new Error("Other region");
      return files.get(cell);
    },
    async put(region, cell, data) {
      if (region !== "west") throw new Error("Other region");
      files.set(cell, data);
    },
  };
  const fetchCell = vi.fn(async (...args: [string, RegionManifest["cells"][number]]) => {
    void args;
    return 2;
  });
  const deps: DownloadDependencies = {
    store, fetchCell,
    estimateStorage: async () => ({ quota: 4_000_000, usage: 0 }),
  };
  return { files, store, fetchCell, deps };
}

describe("selected download through the mounted dashboard model", () => {
  it("does not request cells before a refresh completes", async () => {
    const test = setup();
    const model = createOfflineDashboardModel(manifest, test.deps);
    await model.downloadSelected(["one"]);
    expect(test.fetchCell).not.toHaveBeenCalled();
    model.dispose();
  });

  it("downloads only the requested cell", async () => {
    const test = setup();
    const model = createOfflineDashboardModel(manifest, test.deps);
    await model.refresh();
    await model.downloadSelected(["three"]);
    expect(test.fetchCell).toHaveBeenCalledTimes(1);
    expect(test.fetchCell.mock.calls[0]?.[1].id).toBe("three");
    expect(model.getState().inventory?.unknownCount).toBe(3);
    expect(model.getState().inventory?.savedCount).toBe(1);
    model.dispose();
  });

  it("preserves explicitly listed UNKNOWN cells after partial download", async () => {
    const test = setup();
    const model = createOfflineDashboardModel(manifest, test.deps);
    await model.refresh();
    await model.downloadSelected(["one", "three"]);
    expect(model.getState().inventory?.cells.map((cell) => cell.state)).toEqual([
      "saved", "unknown", "saved", "unknown",
    ]);
    model.dispose();
  });

  it("excludes IDs outside the manifest", async () => {
    const test = setup();
    const model = createOfflineDashboardModel(manifest, test.deps);
    await model.refresh();
    await model.downloadSelected(["outside", "one"]);
    expect(test.fetchCell).toHaveBeenCalledTimes(1);
    expect(test.files.has("outside")).toBe(false);
    model.dispose();
  });

  it("excludes already saved cells from selected retries", async () => {
    const test = setup();
    test.files.set("one", { bytes: 2, provenance });
    const model = createOfflineDashboardModel(manifest, test.deps);
    await model.refresh();
    await model.downloadSelected(["one", "two"]);
    expect(test.fetchCell).toHaveBeenCalledTimes(1);
    expect(test.fetchCell.mock.calls[0]?.[1].id).toBe("two");
    expect(test.files.get("one")?.bytes).toBe(2);
    model.dispose();
  });

  it("does nothing for an entirely invalid selection", async () => {
    const test = setup();
    const model = createOfflineDashboardModel(manifest, test.deps);
    await model.refresh();
    await model.downloadSelected(["outside"]);
    expect(test.fetchCell).not.toHaveBeenCalled();
    expect(model.getState().lastResult).toBeNull();
    model.dispose();
  });

  it("deduplicates a selected cell", async () => {
    const test = setup();
    const model = createOfflineDashboardModel(manifest, test.deps);
    await model.refresh();
    await model.downloadSelected(["two", "two", "two"]);
    expect(test.fetchCell).toHaveBeenCalledTimes(1);
    model.dispose();
  });

  it("reuses the original manifest ordering for selected cells", async () => {
    const test = setup();
    const model = createOfflineDashboardModel(manifest, test.deps);
    await model.refresh();
    await model.downloadSelected(["four", "two", "one"]);
    expect(test.fetchCell.mock.calls.map((call: [string, RegionManifest["cells"][number]]) => call[1].id)).toEqual(["one", "two", "four"]);
    model.dispose();
  });

  it("reports capacity pressure without storing an unsaved cell", async () => {
    const test = setup();
    const model = createOfflineDashboardModel(manifest, {
      ...test.deps,
      estimateStorage: async () => ({ quota: 10, usage: 10 }),
    });
    await model.refresh();
    await model.downloadSelected(["one"]);
    expect(test.files.size).toBe(0);
    expect(model.getState().lastResult?.reason).toBe("quota");
    expect(model.getState().inventory?.unknownCount).toBe(4);
    model.dispose();
  });

  it("reports fetch failures without claiming a saved copy", async () => {
    const test = setup();
    const model = createOfflineDashboardModel(manifest, {
      ...test.deps,
      fetchCell: async () => { throw new Error("Network stopped"); },
    });
    await model.refresh();
    await model.downloadSelected(["one"]);
    expect(model.getState().lastResult?.reason).toBe("download-error");
    expect(model.getState().inventory?.unknownCount).toBe(4);
    model.dispose();
  });

  it("supports retrying missing cells after a selected download", async () => {
    const test = setup();
    const model = createOfflineDashboardModel(manifest, test.deps);
    await model.refresh();
    await model.downloadSelected(["one", "two"]);
    await model.download();
    expect(test.fetchCell).toHaveBeenCalledTimes(4);
    expect(model.getState().inventory?.complete).toBe(true);
    model.dispose();
  });

  it("does not redownload an already selected cell on a later retry", async () => {
    const test = setup();
    const model = createOfflineDashboardModel(manifest, test.deps);
    await model.refresh();
    await model.downloadSelected(["one"]);
    await model.downloadSelected(["one"]);
    expect(test.fetchCell).toHaveBeenCalledTimes(1);
    model.dispose();
  });

  it("prevents a second selected download during the first", async () => {
    const test = setup();
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const fetchCell = vi.fn(async () => { await gate; return 2; });
    const model = createOfflineDashboardModel(manifest, { ...test.deps, fetchCell });
    await model.refresh();
    const first = model.downloadSelected(["one"]);
    const second = model.downloadSelected(["two"]);
    expect(first).toBe(second);
    release?.();
    await first;
    expect(fetchCell).toHaveBeenCalledTimes(1);
    expect(model.getState().inventory?.unknownCount).toBe(3);
    model.dispose();
  });

  it("prevents a full-region request from racing a selected request", async () => {
    const test = setup();
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const fetchCell = vi.fn(async () => { await gate; return 2; });
    const model = createOfflineDashboardModel(manifest, { ...test.deps, fetchCell });
    await model.refresh();
    const selected = model.downloadSelected(["one"]);
    const full = model.download();
    expect(selected).toBe(full);
    release?.();
    await selected;
    expect(fetchCell).toHaveBeenCalledTimes(1);
    model.dispose();
  });

  it("does not start a selected download after model disposal", async () => {
    const test = setup();
    const model = createOfflineDashboardModel(manifest, test.deps);
    await model.refresh();
    model.dispose();
    await model.downloadSelected(["one"]);
    expect(test.fetchCell).not.toHaveBeenCalled();
  });

  it("updates subscribers after selected download completes", async () => {
    const test = setup();
    const model = createOfflineDashboardModel(manifest, test.deps);
    const events: string[] = [];
    const unsubscribe = model.subscribe((state) => { events.push(state.phase); });
    await model.refresh();
    await model.downloadSelected(["one"]);
    expect(events).toContain("downloading");
    expect(events.at(-1)).toBe("ready");
    unsubscribe();
    model.dispose();
  });

  it("does not fire subscriptions after disposal", async () => {
    const test = setup();
    const model = createOfflineDashboardModel(manifest, test.deps);
    let called = 0;
    model.subscribe(() => { called++; });
    await model.refresh();
    const before = called;
    model.dispose();
    await model.downloadSelected(["one"]);
    expect(called).toBe(before);
  });

  it("keeps provenance attached to downloaded cells", async () => {
    const test = setup();
    const model = createOfflineDashboardModel(manifest, test.deps);
    await model.refresh();
    await model.downloadSelected(["one"]);
    expect(test.files.get("one")?.provenance).toEqual(provenance);
    model.dispose();
  });
});
