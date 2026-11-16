import { describe, expect, it, vi } from "vitest";
import {
  canOpenPack,
  inspectInstalledPacks,
  inspectPack,
  isSafePackId,
  knownPackIds,
  openCheckedPack,
  type LocalPackStore,
} from "./packInventory.ts";
import type { PackManifest } from "./packIntegrity.ts";

const bytes = new TextEncoder().encode("abc");
const manifest: PackManifest = {
  byteLength: 3,
  sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  source: { name: "Example", licence: "CC0-1.0", date: "2026-11-15" },
};
const digest = async () => manifest.sha256;

function store(item: Awaited<ReturnType<LocalPackStore["read"]>>): LocalPackStore {
  return { listIds: async () => ["ontario"], read: async () => item };
}

describe("local pack inventory", () => {
  it("accepts short stable IDs only", () => {
    expect(isSafePackId("on.2026-11_01")).toBe(true);
    for (const id of ["", "..", ".", "../secret", "a/b", "a b", "é", "x".repeat(129)]) {
      expect(isSafePackId(id)).toBe(false);
    }
  });

  it("deduplicates and sorts safe IDs", () => {
    expect(knownPackIds(["b", "a", "b", "../x", null, "a"])).toEqual(["a", "b"]);
  });

  it("distinguishes a missing copy from an uncheckable copy", async () => {
    expect(await inspectPack("ontario", store(null), digest)).toEqual({
      id: "ontario", state: "absent", problem: "not-installed",
    });
    expect(await inspectPack("ontario", store({
      id: "ontario", bytes, manifest: null,
    }), digest)).toEqual({
      id: "ontario", state: "unknown", problem: "missing-manifest",
    });
  });

  it("checks actual bytes before showing a ready pack", async () => {
    const item = { id: "ontario", bytes, manifest };
    expect(await inspectPack("ontario", store(item), digest)).toEqual({
      id: "ontario", state: "ready", byteLength: 3, source: manifest.source,
    });
    expect(await canOpenPack("ontario", store(item), digest)).toEqual({
      usable: true, state: "ready", source: manifest.source,
    });
  });

  it("opens only the checked byte snapshot, not a later unchecked read", async () => {
    const original = Uint8Array.from(bytes);
    const opened = await openCheckedPack("ontario", store({
      id: "ontario", bytes: original, manifest,
    }), digest);
    expect(opened.status).toBe("ready");
    original[0] = 0;
    if (opened.status === "ready") {
      expect([...opened.bytes]).toEqual([...bytes]);
      expect(opened.source).toEqual(manifest.source);
    }
  });

  it("rejects changed content and never returns a usable result", async () => {
    const item = { id: "ontario", bytes: new TextEncoder().encode("abcd"), manifest };
    expect(await canOpenPack("ontario", store(item), digest)).toEqual({
      usable: false, state: "corrupt", reason: "size-mismatch",
    });
  });

  it("keeps an unavailable digest UNKNOWN", async () => {
    const item = { id: "ontario", bytes, manifest };
    const result = await canOpenPack("ontario", store(item), async () => {
      throw new Error("crypto unavailable");
    });
    expect(result).toEqual({ usable: false, state: "unknown", reason: "digest-unavailable" });
  });

  it("rejects an unexpected ID inside a stored record", async () => {
    expect((await inspectPack("ontario", store({
      id: "other", bytes, manifest,
    }), digest)).state).toBe("unknown");
  });

  it("isolates per-record read exceptions", async () => {
    const data: LocalPackStore = {
      listIds: async () => ["ok", "bad"],
      read: async (id) => {
        if (id === "bad") throw new Error("not readable");
        return { id, bytes, manifest };
      },
    };
    const result = await inspectInstalledPacks(data, digest);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: "bad", state: "unknown", problem: "read-failed" });
    expect(result[1]).toMatchObject({ id: "ok", state: "ready" });
  });

  it("does not turn a failed catalogue listing into an empty inventory", async () => {
    const data: LocalPackStore = {
      listIds: vi.fn(async () => { throw new Error("blocked"); }),
      read: vi.fn(async () => null),
    };
    await expect(inspectInstalledPacks(data)).rejects.toThrow();
    expect(data.read).not.toHaveBeenCalled();
  });
});
