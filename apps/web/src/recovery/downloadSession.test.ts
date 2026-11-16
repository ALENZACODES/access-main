import { describe, expect, it, vi } from "vitest";
import { PackDownloadSession, type ChunkSource } from "./downloadSession";
import type { PackManifest } from "./packIntegrity";

const bytes = new TextEncoder().encode("abc");
const manifest: PackManifest = {
  byteLength: 3,
  sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  source: { name: "Example", licence: "CC0-1.0", date: "2026-11-15" },
};
const digest = async () => manifest.sha256;

function chunks(...pieces: Uint8Array[]): ChunkSource {
  return async function* () {
    for (const piece of pieces) yield piece;
  };
}

describe("user-controlled pack downloads", () => {
  it("does not start without a manifest", async () => {
    const source = vi.fn(chunks(bytes));
    const commit = vi.fn(async () => undefined);
    const session = new PackDownloadSession();
    expect(await session.start({ source, manifest: null, commit })).toEqual({
      phase: "unknown", received: 0,
    });
    expect(source).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });

  it("reports progress and commits only after checking", async () => {
    const commit = vi.fn(async () => undefined);
    const session = new PackDownloadSession();
    const phases: string[] = [];
    const dispose = session.subscribe((state) => { phases.push(state.phase); });
    const result = await session.start({
      source: chunks(bytes.subarray(0, 1), bytes.subarray(1)),
      manifest, commit, digest,
    });
    dispose();
    expect(result).toEqual({ phase: "complete", received: 3 });
    expect(phases).toEqual([
      "idle", "receiving", "receiving", "receiving", "checking", "saving", "complete",
    ]);
    expect(session.state.percent).toBe(100);
    expect(commit).toHaveBeenCalledOnce();
    expect(commit).toHaveBeenCalledWith(bytes);
  });

  it("detects incomplete content without invoking commit", async () => {
    const commit = vi.fn(async () => undefined);
    const session = new PackDownloadSession();
    expect(await session.start({ source: chunks(bytes.subarray(0, 2)), manifest, commit, digest }))
      .toEqual({ phase: "corrupt", received: 2 });
    expect(commit).not.toHaveBeenCalled();
  });

  it("refuses a stream that exceeds the declared length", async () => {
    const commit = vi.fn(async () => undefined);
    const session = new PackDownloadSession();
    expect((await session.start({ source: chunks(bytes, bytes), manifest, commit, digest })).phase)
      .toBe("corrupt");
    expect(commit).not.toHaveBeenCalled();
  });

  it("refuses a transfer exceeding a strict local byte limit", async () => {
    const session = new PackDownloadSession();
    const commit = vi.fn(async () => undefined);
    expect((await session.start({
      source: chunks(bytes), manifest, commit, digest, maxBytes: 2,
    })).phase).toBe("unknown");
    expect(commit).not.toHaveBeenCalled();
  });

  it("copies reused producer buffers before the next chunk arrives", async () => {
    const shared = new Uint8Array([97]);
    const source: ChunkSource = async function* () {
      yield shared;
      shared[0] = 98;
      yield shared;
      shared[0] = 99;
      yield shared;
    };
    const session = new PackDownloadSession();
    const commit = vi.fn(async () => undefined);
    const checkDigest = async (value: Uint8Array) => {
      expect([...value]).toEqual([97, 98, 99]);
      return manifest.sha256;
    };
    expect((await session.start({ source, manifest, commit, digest: checkDigest })).phase)
      .toBe("complete");
    expect(commit).toHaveBeenCalledOnce();
  });

  it("allows cancellation without a commit", async () => {
    const session = new PackDownloadSession();
    const commit = vi.fn(async () => undefined);
    const source: ChunkSource = async function* (signal) {
      yield bytes.subarray(0, 1);
      if (!signal.aborted) session.cancel();
      yield bytes.subarray(1);
    };
    const result = await session.start({ source, manifest, commit, digest });
    expect(result.phase).toBe("cancelled");
    expect(commit).not.toHaveBeenCalled();
    expect(session.busy).toBe(false);
  });

  it("does not start concurrent attempts or queue a retry", async () => {
    const session = new PackDownloadSession();
    const commit = vi.fn(async () => undefined);
    let continueDownload: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { continueDownload = resolve; });
    const source: ChunkSource = async function* () {
      await gate;
      yield bytes;
    };
    const first = session.start({ source, manifest, commit, digest });
    const second = await session.start({ source, manifest, commit, digest });
    expect(second.phase).toBe("failed");
    continueDownload?.();
    expect((await first).phase).toBe("complete");
    expect(commit).toHaveBeenCalledOnce();
  });

  it("keeps unsuccessful saves as failures", async () => {
    const session = new PackDownloadSession();
    const error = new Error("disk");
    error.name = "QuotaExceededError";
    const result = await session.start({
      source: chunks(bytes), manifest, digest,
      commit: async () => { throw error; },
    });
    expect(result).toEqual({ phase: "failed", received: 3, failure: "quota" });
  });

  it("keeps unsupported digest results UNKNOWN", async () => {
    const session = new PackDownloadSession();
    const commit = vi.fn(async () => undefined);
    expect((await session.start({
      source: chunks(bytes), manifest, commit,
      digest: async () => { throw new Error("not available"); },
    })).phase).toBe("unknown");
    expect(commit).not.toHaveBeenCalled();
  });
});
