import { describe, expect, it, vi } from "vitest";
import { createCleanupController } from "./cleanupController";
import { type PersistentCellStore } from "./indexedCellStore";
import { type RegionManifest, type StoredCell } from "./regionDownload";

const provenance = { source: "Ontario Open Data", licence: "CC BY 4.0", date: "2026-01-01" };
const manifest: RegionManifest = {
  regionId: "west",
  cells: [
    { id: "one", bytes: 3, provenance },
    { id: "two", bytes: 3, provenance },
    { id: "three", bytes: 3, provenance },
  ],
};

function fixture() {
  const records = new Map<string, StoredCell>();
  const key = (region: string, id: string): string => `${region}\u0000${id}`;
  for (const cell of manifest.cells) {
    records.set(key(manifest.regionId, cell.id), {
      data: new Uint8Array([1, 2, 3]), provenance: cell.provenance,
    });
  }
  const get = vi.fn(async (region: string, id: string) => records.get(key(region, id)));
  const put = vi.fn(async (region: string, id: string, value: StoredCell) => {
    records.set(key(region, id), value);
  });
  const remove = vi.fn(async (region: string, id: string) => {
    records.delete(key(region, id));
  });
  const close = vi.fn();
  const store: PersistentCellStore = { get, put, remove, close };
  return { records, store, get, put, remove, close, key };
}

describe("cleanup controller requires explicit review and confirmation", () => {
  it("does not remove records during preparation", async () => {
    const f = fixture();
    const controller = createCleanupController(manifest, f.store);
    const preview = await controller.prepare(["one", "two"]);
    expect(preview?.removableCount).toBe(2);
    expect(controller.state().phase).toBe("awaiting-confirmation");
    expect(f.remove).not.toHaveBeenCalled();
    controller.dispose();
  });

  it("refuses confirmation before preparation", async () => {
    const f = fixture();
    const controller = createCleanupController(manifest, f.store);
    expect(await controller.confirm()).toBeNull();
    expect(f.remove).not.toHaveBeenCalled();
  });

  it("removes only user-selected listed cells after confirmation", async () => {
    const f = fixture();
    const controller = createCleanupController(manifest, f.store);
    await controller.prepare(["two"]);
    const result = await controller.confirm();
    expect(result).toMatchObject({ deleted: ["two"], retained: [], stop: "complete" });
    expect(f.remove).toHaveBeenCalledTimes(1);
    expect(f.remove).toHaveBeenCalledWith("west", "two");
    expect(f.records.has(f.key("west", "one"))).toBe(true);
    expect(f.records.has(f.key("west", "three"))).toBe(true);
    expect(controller.state().phase).toBe("finished");
    expect(controller.state().inventory?.unknownCount).toBe(1);
    controller.dispose();
  });

  it("keeps removed cells UNKNOWN after refresh", async () => {
    const f = fixture();
    const controller = createCleanupController(manifest, f.store);
    await controller.prepare(["one", "two"]);
    const result = await controller.confirm();
    expect(result?.latestInventory?.cells.map((cell) => [cell.id, cell.state])).toEqual([
      ["one", "unknown"], ["two", "unknown"], ["three", "saved"],
    ]);
    controller.dispose();
  });

  it("refuses unlisted cell IDs", async () => {
    const f = fixture();
    const controller = createCleanupController(manifest, f.store);
    const preview = await controller.prepare(["outside"]);
    expect(preview?.removableCount).toBe(0);
    expect(controller.state().phase).toBe("failed");
    expect(await controller.confirm()).toBeNull();
    expect(f.remove).not.toHaveBeenCalled();
  });

  it("refuses a batch with one unlisted ID", async () => {
    const f = fixture();
    const controller = createCleanupController(manifest, f.store);
    await controller.prepare(["one", "outside"]);
    expect(controller.state().phase).toBe("failed");
    expect(f.remove).not.toHaveBeenCalled();
  });

  it("refuses duplicate selection IDs", async () => {
    const f = fixture();
    const controller = createCleanupController(manifest, f.store);
    await controller.prepare(["one", "one"]);
    expect(controller.state().phase).toBe("failed");
    expect(f.remove).not.toHaveBeenCalled();
  });

  it("refuses to remove an absent copy", async () => {
    const f = fixture();
    f.records.delete(f.key("west", "two"));
    const controller = createCleanupController(manifest, f.store);
    const preview = await controller.prepare(["two"]);
    expect(preview?.removableCount).toBe(0);
    expect(controller.state().phase).toBe("failed");
    expect(await controller.confirm()).toBeNull();
    expect(f.remove).not.toHaveBeenCalled();
  });

  it("cancellation before confirmation does not remove anything", async () => {
    const f = fixture();
    const controller = createCleanupController(manifest, f.store);
    await controller.prepare(["one"]);
    controller.cancel();
    expect(controller.state().phase).toBe("idle");
    expect(await controller.confirm()).toBeNull();
    expect(f.remove).not.toHaveBeenCalled();
  });

  it("dismissing confirmation removes the prepared snapshot", async () => {
    const f = fixture();
    const controller = createCleanupController(manifest, f.store);
    await controller.prepare(["one"]);
    controller.dismiss();
    expect(controller.state().phase).toBe("idle");
    expect(await controller.confirm()).toBeNull();
    expect(f.remove).not.toHaveBeenCalled();
  });

  it("refuses to start a duplicate preparation while inspecting", async () => {
    const f = fixture();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const get = f.store.get;
    let first = true;
    const store: PersistentCellStore = {
      ...f.store,
      get: async (region, id) => {
        if (first) { first = false; await gate; }
        return get(region, id);
      },
    };
    const controller = createCleanupController(manifest, store);
    const firstCall = controller.prepare(["one"]);
    expect(await controller.prepare(["two"])).toBeNull();
    release();
    await firstCall;
    expect(controller.state().preview?.candidates.map((c) => c.id)).toEqual(["one"]);
    controller.dispose();
  });

  it("refuses a second confirmation while removal is running", async () => {
    const f = fixture();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const store: PersistentCellStore = {
      ...f.store,
      remove: async (region, id) => { await gate; await f.store.remove(region, id); },
    };
    const controller = createCleanupController(manifest, store);
    await controller.prepare(["one"]);
    const first = controller.confirm();
    expect(await controller.confirm()).toBeNull();
    release();
    await first;
    expect(f.remove).toHaveBeenCalledTimes(1);
    controller.dispose();
  });

  it("stops if content changes after preview", async () => {
    const f = fixture();
    const controller = createCleanupController(manifest, f.store);
    await controller.prepare(["one", "two"]);
    f.records.set(f.key("west", "one"), { data: new Uint8Array([3, 2, 1]), provenance });
    const result = await controller.confirm();
    expect(result?.stop).toBe("changed");
    expect(result?.deleted).toEqual([]);
    expect(result?.retained).toEqual(["one", "two"]);
    expect(f.remove).not.toHaveBeenCalled();
    controller.dispose();
  });

  it("stops if source date changes after preview", async () => {
    const f = fixture();
    const controller = createCleanupController(manifest, f.store);
    await controller.prepare(["one"]);
    f.records.set(f.key("west", "one"), {
      data: new Uint8Array([1, 2, 3]), provenance: { ...provenance, date: "2025-03-01" },
    });
    const result = await controller.confirm();
    expect(result?.stop).toBe("changed");
    expect(f.remove).not.toHaveBeenCalled();
    controller.dispose();
  });

  it("stops if a stored copy vanishes after preview", async () => {
    const f = fixture();
    const controller = createCleanupController(manifest, f.store);
    await controller.prepare(["one"]);
    f.records.delete(f.key("west", "one"));
    const result = await controller.confirm();
    expect(result?.stop).toBe("changed");
    expect(f.remove).not.toHaveBeenCalled();
    controller.dispose();
  });

  it("does not proceed past a failed removal", async () => {
    const f = fixture();
    const remove = vi.fn(async () => { throw new Error("disk write failure"); });
    const controller = createCleanupController(manifest, { ...f.store, remove });
    await controller.prepare(["one", "two"]);
    const result = await controller.confirm();
    expect(result?.stop).toBe("storage-error");
    expect(result?.retained).toEqual(["one", "two"]);
    expect(remove).toHaveBeenCalledTimes(1);
    controller.dispose();
  });

  it("reports partial removal when a later delete fails", async () => {
    const f = fixture();
    let calls = 0;
    const store: PersistentCellStore = {
      ...f.store,
      remove: async (region, id) => {
        calls++;
        if (calls === 2) throw new Error("storage failure");
        await f.store.remove(region, id);
      },
    };
    const controller = createCleanupController(manifest, store);
    await controller.prepare(["one", "two", "three"]);
    const result = await controller.confirm();
    expect(result).toMatchObject({
      deleted: ["one"], retained: ["two", "three"], stop: "storage-error",
    });
    expect(result?.latestInventory?.unknownCount).toBe(1);
    controller.dispose();
  });

  it("cancels between records but preserves completed removals", async () => {
    const f = fixture();
    const controller = createCleanupController(manifest, {
      ...f.store,
      remove: async (region, id) => {
        await f.store.remove(region, id);
        controller.cancel();
      },
    });
    await controller.prepare(["one", "two"]);
    const result = await controller.confirm();
    expect(result?.stop).toBe("interrupted");
    expect(result?.deleted).toEqual(["one"]);
    expect(result?.retained).toEqual(["two"]);
    controller.dispose();
  });

  it("publishes progress with individual cell IDs", async () => {
    const f = fixture();
    const controller = createCleanupController(manifest, f.store);
    const revisions: number[] = [];
    const ids: (string | null)[] = [];
    controller.subscribe((state) => {
      revisions.push(state.revision);
      ids.push(state.progress.currentId);
    });
    await controller.prepare(["one", "two"]);
    await controller.confirm();
    expect(ids).toContain("one");
    expect(ids).toContain("two");
    expect(revisions).toEqual([...revisions].sort((a, b) => a - b));
    controller.dispose();
  });

  it("does not emit updates to an unsubscribed listener", async () => {
    const f = fixture();
    const controller = createCleanupController(manifest, f.store);
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);
    await controller.prepare(["one"]);
    const count = listener.mock.calls.length;
    unsubscribe();
    await controller.confirm();
    expect(listener).toHaveBeenCalledTimes(count);
    controller.dispose();
  });

  it("does not delete after disposal", async () => {
    const f = fixture();
    const controller = createCleanupController(manifest, f.store);
    await controller.prepare(["one"]);
    controller.dispose();
    expect(await controller.confirm()).toBeNull();
    expect(f.remove).not.toHaveBeenCalled();
  });

  it("does not prepare after disposal", async () => {
    const f = fixture();
    const controller = createCleanupController(manifest, f.store);
    controller.dispose();
    expect(await controller.prepare(["one"])).toBeNull();
    expect(f.get).not.toHaveBeenCalled();
  });

  it("does not close a shared store on disposal", async () => {
    const f = fixture();
    const controller = createCleanupController(manifest, f.store);
    controller.dispose();
    expect(f.close).not.toHaveBeenCalled();
  });

  it("does not report success if refresh after removal fails", async () => {
    const f = fixture();
    let failReads = false;
    const store: PersistentCellStore = {
      ...f.store,
      get: async (region, id) => {
        if (failReads) throw new Error("read failure");
        return f.store.get(region, id);
      },
      remove: async (region, id) => {
        await f.store.remove(region, id);
        failReads = true;
      },
    };
    const controller = createCleanupController(manifest, store);
    await controller.prepare(["one"]);
    const result = await controller.confirm();
    expect(result?.deleted).toEqual(["one"]);
    expect(result?.latestInventory?.cells.every((cell) => cell.state === "unknown")).toBe(true);
    controller.dispose();
  });
});
