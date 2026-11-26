import { describe, expect, it } from "vitest";
import { ascTag, baselineSegments, bytes, exifSegment, gpsTags, jpegBytes } from "./phBuild";
import { isWholeJpeg, parseJpeg } from "./phJpeg";
import { auditJpeg } from "./phRules";
import { referenceStrip, scanEnds } from "./phStrip";

const base = baselineSegments();

describe("referenceStrip", () => {
  it("leaves a clean file as it is", () => {
    const f = jpegBytes({ before: base });
    expect(referenceStrip(f)).toEqual(f);
  });
  it("removes the application data and the comments before the scan", () => {
    const f = jpegBytes({ before: [{ marker: 0xe0, payload: bytes(1) }, exifSegment({ ifd0: [ascTag(0x010f, "A")], gps: gpsTags(1, 2) }), ...base, { marker: 0xfe, payload: bytes(2) }] });
    expect(referenceStrip(f)).toEqual(jpegBytes({ before: base }));
  });
  it("removes what follows the end of image", () => expect(referenceStrip(jpegBytes({ before: base, trailer: bytes(0xff, 0xd8, 0xff, 1, 2) }))).toEqual(jpegBytes({ before: base })));
  it("removes application data that sits between two scans", () => {
    const f = Uint8Array.from([0xff, 0xd8, 0xff, 0xda, 0, 2, 1, 0xff, 0xe1, 0, 4, 9, 9, 0xff, 0xda, 0, 2, 3, 0xff, 0xd9]);
    expect(Array.from(referenceStrip(f))).toEqual([0xff, 0xd8, 0xff, 0xda, 0, 2, 1, 0xff, 0xda, 0, 2, 3, 0xff, 0xd9]);
  });
  it("removes fill bytes and keeps a standalone marker", () => {
    const f = Uint8Array.from([0xff, 0xd8, 0xff, 0xff, 0xfe, 0, 3, 65, 0xff, 0x01, 0xff, 0xda, 0, 2, 1, 0xff, 0xd9]);
    expect(Array.from(referenceStrip(f))).toEqual([0xff, 0xd8, 0xff, 0x01, 0xff, 0xda, 0, 2, 1, 0xff, 0xd9]);
  });
  it("gives a clean whole file for any of these", () => {
    const files = [jpegBytes({ before: [exifSegment({ gps: gpsTags(5, 6) }), ...base], trailer: bytes(0xff, 0xd8, 0xff, 0xe1, 0, 2) }), jpegBytes({ before: [{ marker: 0xed, payload: bytes(1, 2) }, ...base] })];
    for (const f of files) {
      const out = referenceStrip(f);
      expect(auditJpeg(out)).toEqual([]);
      expect(isWholeJpeg(parseJpeg(out))).toBe(true);
    }
  });
  it("is stable: stripping twice gives the same bytes", () => {
    const f = jpegBytes({ before: [exifSegment({ gps: gpsTags(5, 6) }), ...base], trailer: bytes(1, 2, 3) });
    expect(referenceStrip(referenceStrip(f))).toEqual(referenceStrip(f));
  });
  it("throws on a file that is not whole", () => {
    expect(() => referenceStrip(bytes(1, 2, 3))).toThrow("not a whole JPEG: no start of image at 0");
    expect(() => referenceStrip(jpegBytes({ before: base, noEnd: true }))).toThrow(/no end of image/);
  });
});

describe("scanEnds", () => {
  it("lists the markers that end entropy-coded data", () => expect(scanEnds(bytes(1, 0xff, 0, 2, 0xff, 0xda, 3, 0xff, 0xd9))).toEqual([4, 7]));
  it("is empty when there are none", () => expect(scanEnds(bytes(1, 2, 3))).toEqual([]));
});
