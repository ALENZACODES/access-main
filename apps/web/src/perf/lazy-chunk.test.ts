import { describe, expect, it, vi } from "vitest";
import { createLazyChunk, lazyExport, lazyImport, preloadChunks } from "./index";

describe("lazy chunks", () => {
  it("does not load eagerly; caches successful results", async () => {
    const loader = vi.fn(async () => ({ ready: true }));
    const chunk = lazyImport(loader);
    expect(chunk.status()).toBe("idle");
    expect(loader).not.toHaveBeenCalled();
    await expect(chunk.load()).resolves.toEqual({ ready: true });
    await chunk.preload();
    expect(loader).toHaveBeenCalledTimes(1);
    expect(chunk.status()).toBe("loaded");
  });

  it("deduplicates concurrent requests", async () => {
    let resolveLoad!: (value: number) => void;
    const loader = vi.fn(() => new Promise<number>((resolve) => { resolveLoad = resolve; }));
    const chunk = createLazyChunk(loader);
    const first = chunk.load();
    const second = chunk.load();
    expect(first).toBe(second);
    expect(chunk.status()).toBe("loading");
    await Promise.resolve();
    expect(loader).toHaveBeenCalledTimes(1);
    resolveLoad(42);
    await expect(first).resolves.toBe(42);
    expect(chunk.status()).toBe("loaded");
  });

  it("retries rejected and synchronously throwing loaders", async () => {
    let attempts = 0;
    const chunk = createLazyChunk(() => {
      attempts += 1;
      if (attempts === 1) throw new Error("temporary");
      return Promise.resolve("recovered");
    });
    await expect(chunk.load()).rejects.toThrow("temporary");
    expect(chunk.status()).toBe("error");
    await expect(chunk.load()).resolves.toBe("recovered");
    expect(attempts).toBe(2);
  });

  it("reset invalidates the cache without allowing stale results to overwrite it", async () => {
    let resolveOld!: (value: string) => void;
    let calls = 0;
    const chunk = createLazyChunk(() => {
      calls += 1;
      if (calls === 1) return new Promise<string>((resolve) => { resolveOld = resolve; });
      return Promise.resolve("new");
    });
    const oldRequest = chunk.load();
    await Promise.resolve();
    chunk.reset();
    await expect(chunk.load()).resolves.toBe("new");
    resolveOld("old");
    await expect(oldRequest).resolves.toBe("old");
    await expect(chunk.load()).resolves.toBe("new");
    expect(chunk.status()).toBe("loaded");
    expect(calls).toBe(2);
  });

  it("stale failures cannot alter a newer successful load", async () => {
    let rejectOld!: (reason: Error) => void;
    let calls = 0;
    const chunk = createLazyChunk(() => {
      calls += 1;
      if (calls === 1) return new Promise<string>((_resolve, reject) => { rejectOld = reject; });
      return Promise.resolve("fresh");
    });
    const old = chunk.load();
    await Promise.resolve();
    chunk.reset();
    await expect(chunk.load()).resolves.toBe("fresh");
    rejectOld(new Error("old failure"));
    await expect(old).rejects.toThrow("old failure");
    expect(chunk.status()).toBe("loaded");
  });

  it("selects an export and supports explicit preloading", async () => {
    const importer = vi.fn(async () => ({ named: 123 }));
    const exported = lazyExport(importer, (module) => module.named);
    const secondLoader = vi.fn(async () => "second");
    const second = createLazyChunk(secondLoader);
    expect(importer).not.toHaveBeenCalled();
    await preloadChunks([exported, second]);
    await preloadChunks([exported, second]);
    await expect(exported.load()).resolves.toBe(123);
    expect(importer).toHaveBeenCalledTimes(1);
    expect(secondLoader).toHaveBeenCalledTimes(1);
  });
});
