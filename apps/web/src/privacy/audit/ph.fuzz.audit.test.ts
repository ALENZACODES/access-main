// Robustness audit of the JPEG reader, the audit rules, the comparison and the real stripJpegMetadata, on bytes that
// are built, cut, flipped and shuffled. The reader and the audit never throw; the audit gives codes from the closed
// list at offsets inside the file; cleaning, when it accepts a file, leaves no application data or comment before
// the scan; and cleaning a cleaned file changes nothing.

import { describe, expect, it } from "vitest";
import { stripJpegMetadata } from "../../../../../packages/contribute/src/photos";
import { ascTag, baselineSegments, bytes, exifSegment, gpsTags, jpegBytes } from "./phBuild";
import type { RawSegment } from "./phBuild";
import { compareStrip } from "./phDiff";
import { genString } from "./fuzz/gen";
import { assertPropertyAsync, assertProperty } from "./fuzz/property";
import type { Rng } from "./fuzz/rng";
import { isWholeJpeg, parseJpeg, metadataSegments } from "./phJpeg";
import { PH_CODES, auditJpeg } from "./phRules";
import { readExif } from "./phTiff";
import { referenceStrip } from "./phStrip";

const base = baselineSegments();

function genSegments(rng: Rng): RawSegment[] {
  const out: RawSegment[] = [];
  const n = rng.int(0, 6);
  for (let i = 0; i < n; i++) {
    const kind = rng.int(0, 4);
    if (kind === 0) out.push({ marker: 0xe0 + rng.int(0, 15), payload: Uint8Array.from({ length: rng.int(0, 40) }, () => rng.int(0, 255)) });
    else if (kind === 1) out.push({ marker: 0xfe, payload: new TextEncoder().encode(genString(rng, 20)) });
    else if (kind === 2) out.push(exifSegment({ littleEndian: rng.bool(), ifd0: [ascTag(0x010f, genString(rng, 8).replace(/\0/g, ""))], gps: rng.bool() ? gpsTags(rng.int(-90, 90), rng.int(-180, 180)) : [] }));
    else out.push(base[rng.int(0, base.length - 1)] as RawSegment);
  }
  return out;
}

const mangle = (rng: Rng, data: Uint8Array): Uint8Array => {
  const copy = Array.from(data);
  const ops = rng.int(0, 3);
  for (let k = 0; k < ops; k++) {
    const m = rng.int(0, 3);
    if (m === 0 && copy.length > 0) copy.length = rng.int(0, copy.length);
    else if (m === 1 && copy.length > 0) copy[rng.int(0, copy.length - 1)] = rng.int(0, 255);
    else if (m === 2) copy.splice(rng.int(0, copy.length), 0, 0xff);
    else copy.splice(rng.int(0, copy.length), rng.int(0, 3));
  }
  return Uint8Array.from(copy);
};

describe("the reader and the audit on any bytes", () => {
  it("never throw, and give codes from the list at offsets inside the file", () =>
    assertProperty({
      name: "audit of mangled files",
      runs: 400,
      gen: (rng) => mangle(rng, jpegBytes({ before: [...genSegments(rng), ...base], trailer: rng.bool(0.3) ? bytes(0xff, 0xd8, 0xff, 0xe1, 0, 4, 1, 2) : undefined })),
      prop: (data) => {
        const parts = parseJpeg(data);
        expect(Array.isArray(parts)).toBe(true);
        for (const f of auditJpeg(data)) {
          expect(PH_CODES).toContain(f.code);
          expect(f.offset).toBeGreaterThanOrEqual(0);
          expect(f.offset).toBeLessThanOrEqual(data.length);
        }
      },
      show: (d) => Array.from(d).map((b) => b.toString(16).padStart(2, "0")).join(" "),
    }));
  it("read an EXIF payload of any bytes without throwing", () =>
    assertProperty({
      name: "readExif on noise",
      runs: 400,
      gen: (rng) => Uint8Array.from({ length: rng.int(0, 80) }, () => rng.int(0, 255)),
      prop: (data) => {
        const r = readExif(data);
        expect(Array.isArray(r.tags)).toBe(true);
      },
    }));
  it("find nothing in a whole file with no metadata, whatever the picture bytes", () =>
    assertProperty({
      name: "clean files stay clean",
      gen: (rng) => jpegBytes({ before: base, scan: Uint8Array.from({ length: rng.int(1, 60) }, () => rng.int(0, 255)).map((b) => (b === 0xff ? 0xfe : b)) }),
      prop: (data) => expect(auditJpeg(data)).toEqual([]),
    }));
});

describe("the real stripJpegMetadata on built files", () => {
  const strip = async (d: Uint8Array): Promise<Uint8Array> => new Uint8Array(await (await stripJpegMetadata(new Blob([d as Uint8Array<ArrayBuffer>]))).arrayBuffer());
  it("leaves no metadata before the scan, for any file it accepts", () =>
    assertPropertyAsync({
      name: "no metadata before the scan",
      runs: 300,
      gen: (rng) => jpegBytes({ before: [...genSegments(rng), ...base] }),
      prop: async (data) => {
        const out = await strip(data);
        expect(metadataSegments(parseJpeg(out))).toEqual([]);
        expect(isWholeJpeg(parseJpeg(out))).toBe(true);
      },
    }));
  it("gives the reference's bytes for any file with no trailer", () =>
    assertPropertyAsync({
      name: "same as the reference",
      runs: 300,
      gen: (rng) => jpegBytes({ before: [...genSegments(rng), ...base], scan: Uint8Array.from({ length: rng.int(1, 40) }, () => rng.int(0, 255)).map((b) => (b === 0xff ? 0xfe : b)) }),
      prop: async (data) => expect(Array.from(await strip(data))).toEqual(Array.from(referenceStrip(data))),
    }));
  it("changes nothing when run on its own output", () =>
    assertPropertyAsync({
      name: "idempotent",
      runs: 300,
      gen: (rng) => jpegBytes({ before: [...genSegments(rng), ...base] }),
      prop: async (data) => {
        const once = await strip(data);
        expect(Array.from(await strip(once))).toEqual(Array.from(once));
      },
    }));
  it("keeps the order and the bytes of everything it does not remove", () =>
    assertPropertyAsync({
      name: "preservation",
      runs: 300,
      gen: (rng) => jpegBytes({ before: [...genSegments(rng), ...base], scan: Uint8Array.from({ length: rng.int(1, 40) }, () => rng.int(0, 255)).map((b) => (b === 0xff ? 0x7f : b)) }),
      prop: async (data) => expect(compareStrip(data, await strip(data)).problems).toEqual([]),
    }));
  it("either refuses or returns, never throws a value that is not an Error, on mangled files", () =>
    assertPropertyAsync({
      name: "refuses cleanly",
      runs: 400,
      gen: (rng) => mangle(rng, jpegBytes({ before: [...genSegments(rng), ...base] })),
      prop: async (data) => {
        try {
          await strip(data);
        } catch (e) {
          expect(e).toBeInstanceOf(Error);
          expect((e as Error).message).toMatch(/JPEG/);
        }
      },
    }));
});
