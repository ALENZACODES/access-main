import { describe, expect, it } from "vitest";
import { badChecksums, crc32, entryText, readZip } from "./phZip";
import { exportZip } from "../../../../../packages/contribute/src/export";
import { makeDraft, type Draft } from "../../../../../packages/contribute/src/schema";

const draft = (id: string, photoIds: string[], name = (p: string): string => `${p}.jpg`): Draft => ({
  ...makeDraft(),
  id,
  target: "place-1",
  kind: "correction",
  changes: { door_width_cm: { value: 90, unit: "cm" } },
  photos: photoIds.map((p) => ({ id: p, name: name(p), licence: "CC BY 4.0" as const, mime: "image/jpeg" as const })),
});
const zipOf = async (drafts: Draft[], photos: Record<string, Uint8Array>) => new Uint8Array(await (await exportZip(drafts, async (id) => (photos[id] ? new Blob([photos[id] as Uint8Array<ArrayBuffer>]) : undefined))).arrayBuffer());

describe("crc32", () => {
  it("is the known value for the standard check string", () => expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926));
  it("is zero for no bytes", () => expect(crc32(new Uint8Array(0))).toBe(0));
  it("changes when a byte changes", () => expect(crc32(Uint8Array.of(1, 2, 3))).not.toBe(crc32(Uint8Array.of(1, 2, 4))));
});

describe("readZip on the contribution export", () => {
  it("reads the entries that the export writes, in order", async () => {
    const z = readZip(await zipOf([draft("d1", ["p1", "p2"])], { p1: Uint8Array.of(1, 2, 3), p2: Uint8Array.of(4) }));
    expect(z.problems).toEqual([]);
    expect(z.entries.map((e) => e.name)).toEqual(["contributions.json", "contributions.geojson", "photos/d1/p1.jpg", "photos/d1/p2.jpg"]);
  });
  it("gives the bytes of a photo as they were stored", async () => {
    const z = readZip(await zipOf([draft("d1", ["p1"])], { p1: Uint8Array.of(9, 8, 7) }));
    expect(Array.from(z.entries[2]?.data ?? [])).toEqual([9, 8, 7]);
  });
  it("has a crc that matches every entry", async () => expect(badChecksums(readZip(await zipOf([draft("d1", ["p1"])], { p1: Uint8Array.of(1) })))).toEqual([]));
  it("gives the text of an entry, or null", async () => {
    const z = readZip(await zipOf([draft("d1", [])], {}));
    expect(JSON.parse(entryText(z, "contributions.json") ?? "[]")[0].id).toBe("d1");
    expect(entryText(z, "nope")).toBeNull();
  });
  it("reads an export with no drafts", async () => expect(readZip(await zipOf([], {})).entries.map((e) => e.name)).toEqual(["contributions.json", "contributions.geojson"]));
});

describe("readZip on a file that is not whole", () => {
  it("says there is no end of central directory", () => expect(readZip(Uint8Array.of(1, 2, 3)).problems).toEqual(["no end of central directory"]));
  it("says a central entry is wrong", async () => {
    const z = await zipOf([draft("d1", [])], {});
    const bad = z.slice();
    const eocd = bad.length - 22;
    new DataView(bad.buffer).setUint32(eocd + 16, 0, true);
    expect(readZip(bad.subarray(0, bad.length)).problems[0]).toMatch(/central directory is wrong|has no local header/);
  });
  it("reports a checksum that does not match", async () => {
    const z = await zipOf([draft("d1", ["p1"])], { p1: Uint8Array.of(1, 2, 3, 4) });
    const read = readZip(z);
    const e = read.entries.find((x) => x.name.endsWith("p1.jpg"));
    z[(e?.data.byteOffset ?? 0) - z.byteOffset] = 99;
    expect(badChecksums(readZip(z))).toEqual(["photos/d1/p1.jpg"]);
  });
  it("never throws, whatever the bytes", () => {
    for (let n = 0; n < 200; n++) expect(() => readZip(Uint8Array.from({ length: n % 90 }, (_, i) => (i * 31 + n) & 0xff))).not.toThrow();
  });
});
