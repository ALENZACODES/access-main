import { describe, expect, it, vi } from "vitest";
import { checkPackIntegrity, packIntegrityCopy, redownloadPack } from "./packIntegrity";
import type { PackManifest } from "./packIntegrity";

const data = new TextEncoder().encode("abc");
const manifest: PackManifest = {
  byteLength: 3,
  sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  source: { name: "Sample dataset", licence: "CC-BY-4.0", date: "2026-11-15" },
};
const hash = async () => manifest.sha256;

describe("pack integrity and user-controlled re-download", () => {
  it("accepts bytes only with matching size, digest and provenance", async () => {
    expect(await checkPackIntegrity(data, manifest, hash)).toEqual({
      status: "complete", source: manifest.source,
    });
  });

  it("detects a shortened pack before digesting", async () => {
    const digest = vi.fn(hash);
    expect(await checkPackIntegrity(data.subarray(0, 2), manifest, digest)).toEqual({
      status: "corrupt", reason: "size",
    });
    expect(digest).not.toHaveBeenCalled();
  });

  it("detects same-length byte corruption by digest", async () => {
    const changed = new TextEncoder().encode("abd");
    expect(await checkPackIntegrity(changed, manifest, async () => "0".repeat(64))).toEqual({
      status: "corrupt", reason: "digest",
    });
  });

  it("does not infer completeness when checksum or licence is missing", async () => {
    expect((await checkPackIntegrity(data, null, hash)).status).toBe("unknown");
    expect((await checkPackIntegrity(data, {
      ...manifest, source: { ...manifest.source, licence: "" },
    }, hash)).status).toBe("unknown");
    expect((await checkPackIntegrity(data, manifest, async () => { throw new Error("no hash"); })).status).toBe("unknown");
  });

  it("does not commit a corrupt re-download", async () => {
    const commit = vi.fn(async () => undefined);
    const result = await redownloadPack(async () => data.subarray(0, 2), manifest, commit, hash);
    expect(result.status).toBe("corrupt");
    expect(commit).not.toHaveBeenCalled();
  });

  it("commits only a checked re-download, once", async () => {
    const download = vi.fn(async () => data);
    const commit = vi.fn(async () => undefined);
    const result = await redownloadPack(download, manifest, commit, hash);
    expect(result.status).toBe("complete");
    expect(download).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledOnce();
    expect(commit).toHaveBeenCalledWith(data);
  });

  it("reports commit errors without claiming success or retrying", async () => {
    const error = new Error("disk full");
    error.name = "QuotaExceededError";
    const commit = vi.fn(async () => { throw error; });
    expect(await redownloadPack(async () => data, manifest, commit, hash)).toEqual({
      status: "failed", reason: "quota",
    });
    expect(commit).toHaveBeenCalledOnce();
  });

  it("supplies English and French instructions without claiming unknown is complete", () => {
    expect(packIntegrityCopy("en", "unknown").title).toContain("unknown");
    expect(packIntegrityCopy("fr", "unknown").title).toContain("inconnu");
    expect(packIntegrityCopy("fr", "corrupt").action).toBe("Télécharger de nouveau");
  });
});
