import { describe, expect, it } from "vitest";
import type { PackManifest } from "@access/shared";
import { downloadPack, fetchManifest, PackError } from "./download.ts";
import contentText from "../../public/packs/toronto/content.json?raw";
import manifestText from "../../public/packs/toronto/manifest.json?raw";

const body = new TextEncoder().encode(contentText);
const manifest = JSON.parse(manifestText) as PackManifest;

function streamed(bytes: Uint8Array, chunk = 4096): Response {
  let offset = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.byteLength) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(offset, offset + chunk));
      offset += chunk;
    },
  });
  return new Response(stream, { status: 200 });
}

const NOW = "2026-11-14T13:00:00.000Z";

describe("pack download", () => {
  it("reads the manifest and reports progress up to the manifest size", async () => {
    const read = await fetchManifest(async () => new Response(manifestText, { status: 200 }));
    expect(read.size_bytes).toBe(body.byteLength);
    const seen: number[] = [];
    const pack = await downloadPack(read, {
      nowIso: NOW,
      fetcher: async () => streamed(new Uint8Array(body)),
      onProgress: (received, total) => {
        expect(total).toBe(read.size_bytes);
        seen.push(received);
      },
    });
    expect(seen[0]).toBe(0);
    expect(seen.at(-1)).toBe(read.size_bytes);
    expect(seen.length).toBeGreaterThan(3);
    expect(pack.content.places).toHaveLength(read.counts.places);
    expect(pack.stored_at).toBe(NOW);
  });

  it("refuses a short download, a changed file, and a network failure", async () => {
    const short = downloadPack(manifest, { nowIso: NOW, fetcher: async () => streamed(new Uint8Array(body).slice(0, 100)) });
    await expect(short).rejects.toMatchObject({ code: "size_mismatch" });
    const changed = new Uint8Array(body);
    changed[10] = changed[10] === 32 ? 33 : 32;
    await expect(downloadPack(manifest, { nowIso: NOW, fetcher: async () => streamed(changed) })).rejects.toMatchObject({ code: "hash_mismatch" });
    await expect(
      downloadPack(manifest, {
        nowIso: NOW,
        fetcher: async () => {
          throw new TypeError("offline");
        },
      }),
    ).rejects.toBeInstanceOf(PackError);
    await expect(fetchManifest(async () => new Response("{}", { status: 200 }))).rejects.toMatchObject({ code: "manifest_invalid" });
  });
});
