import { describe, expect, it } from "vitest";
import { baselineSegments, bytes, jpegBytes, scanData, segment } from "./phBuild";
import { errorsOf, isMetadataMarker, isStandalone, isWholeJpeg, markerName, metadataSegments, nextScanMarker, parseJpeg, scanBytes, segmentsOf, trailerBytes } from "./phJpeg";

const kinds = (d: Uint8Array): string[] => parseJpeg(d).map((p) => (p.kind === "segment" || p.kind === "standalone" ? p.name : p.kind));

describe("markerName", () => {
  it.each([[0xc0, "SOF0"], [0xc2, "SOF2"], [0xc4, "DHT"], [0xdb, "DQT"], [0xda, "SOS"], [0xdd, "DRI"], [0xd8, "SOI"], [0xd9, "EOI"], [0xfe, "COM"], [0xe0, "APP0"], [0xe1, "APP1"], [0xef, "APP15"], [0xd0, "RST0"], [0xd7, "RST7"], [0x01, "TEM"], [0x02, "0x02"]])("%i is %s", (m, n) => expect(markerName(m)).toBe(n));
});

describe("isStandalone and isMetadataMarker", () => {
  it("knows the markers with no length", () => {
    for (const m of [0x01, 0xd0, 0xd5, 0xd7, 0xd8]) expect(isStandalone(m), String(m)).toBe(true);
    for (const m of [0xc0, 0xda, 0xe1, 0xfe, 0xd9]) expect(isStandalone(m), String(m)).toBe(false);
  });
  it("knows the markers that carry application data or a comment", () => {
    for (let m = 0xe0; m <= 0xef; m++) expect(isMetadataMarker(m), String(m)).toBe(true);
    expect(isMetadataMarker(0xfe)).toBe(true);
    for (const m of [0xc0, 0xc4, 0xdb, 0xdd, 0xda, 0xdf, 0xf0]) expect(isMetadataMarker(m), String(m)).toBe(false);
  });
});

describe("nextScanMarker", () => {
  it("skips a stuffed zero, a restart marker and fill", () => expect(nextScanMarker(bytes(1, 0xff, 0, 2, 0xff, 0xd3, 3, 0xff, 0xff, 0xd9), 0)).toBe(8));
  it("finds a marker that ends the scan", () => expect(nextScanMarker(bytes(1, 2, 0xff, 0xdb, 0), 0)).toBe(2));
  it("starts from the index given", () => expect(nextScanMarker(bytes(0xff, 0xd9, 5, 0xff, 0xda), 1)).toBe(3));
  it("gives -1 when there is none", () => expect(nextScanMarker(bytes(1, 2, 3, 0xff), 0)).toBe(-1));
});

describe("parseJpeg on a whole file", () => {
  const file = jpegBytes({ before: baselineSegments() });
  it("reads the start, the segments, the scan and the end in order", () => expect(kinds(file)).toEqual(["soi", "DQT", "SOF0", "DHT", "SOS", "scan", "eoi"]));
  it("is whole", () => expect(isWholeJpeg(parseJpeg(file))).toBe(true));
  it("gives the offset and the length of a segment, and its payload", () => {
    const [dqt] = segmentsOf(parseJpeg(file));
    expect(dqt?.offset).toBe(2);
    expect(dqt?.length).toBe(67);
    expect(dqt?.payload).toHaveLength(65);
  });
  it("gives the scan bytes, and they are the ones that were put in", () => {
    const scan = scanData(40, 3);
    const f = jpegBytes({ before: baselineSegments(), scan });
    expect(scanBytes(f, parseJpeg(f))).toEqual(scan);
  });
  it("has no trailer", () => expect(trailerBytes(file, parseJpeg(file))).toHaveLength(0));
  it("has no error", () => expect(errorsOf(parseJpeg(file))).toEqual([]));
});

describe("parseJpeg on a file with more", () => {
  it("finds the metadata segments among the others", () => {
    const f = jpegBytes({ before: [{ marker: 0xe0, payload: bytes(1, 2) }, ...baselineSegments(), { marker: 0xfe, payload: bytes(65) }, { marker: 0xed, payload: bytes(1) }] });
    expect(metadataSegments(parseJpeg(f)).map((s) => s.name)).toEqual(["APP0", "COM", "APP13"]);
  });
  it("gives the bytes after the end of image as a trailer", () => {
    const f = jpegBytes({ before: baselineSegments(), trailer: bytes(1, 2, 3) });
    expect(trailerBytes(f, parseJpeg(f))).toEqual(bytes(1, 2, 3));
    expect(kinds(f).at(-1)).toBe("trailer");
  });
  it("counts fill bytes before a marker", () => {
    const f = Uint8Array.from([0xff, 0xd8, 0xff, 0xff, 0xff, 0xfe, 0, 3, 65, 0xff, 0xda, 0, 2, 1, 0xff, 0xd9]);
    const parts = parseJpeg(f);
    expect(parts.find((p) => p.kind === "fill")).toEqual({ kind: "fill", offset: 2, count: 2 });
    expect(metadataSegments(parts)).toHaveLength(1);
  });
  it("reads a standalone marker before the scan as one with no length", () => expect(kinds(Uint8Array.from([0xff, 0xd8, 0xff, 0x01, 0xff, 0xda, 0, 2, 5, 0xff, 0xd9]))).toEqual(["soi", "TEM", "SOS", "scan", "eoi"]));
  it("reads two scans, as a progressive file has", () => {
    const f = Uint8Array.from([0xff, 0xd8, 0xff, 0xda, 0, 2, 1, 2, 0xff, 0xda, 0, 2, 3, 4, 0xff, 0xd9]);
    expect(kinds(f)).toEqual(["soi", "SOS", "scan", "SOS", "scan", "eoi"]);
    expect(scanBytes(f, parseJpeg(f))).toEqual(bytes(1, 2, 3, 4));
  });
  it("keeps a restart marker inside a scan", () => {
    const f = Uint8Array.from([0xff, 0xd8, 0xff, 0xda, 0, 2, 1, 0xff, 0xd0, 2, 0xff, 0xd9]);
    expect(scanBytes(f, parseJpeg(f))).toEqual(bytes(1, 0xff, 0xd0, 2));
  });
});

describe("parseJpeg on a file that is not whole", () => {
  const msg = (d: Uint8Array): string[] => errorsOf(parseJpeg(d));
  it("says there is no start of image", () => expect(msg(bytes(1, 2, 3))).toEqual(["no start of image at 0"]));
  it("says so for an empty file and for one byte", () => {
    expect(msg(new Uint8Array(0))).toEqual(["no start of image at 0"]);
    expect(msg(bytes(0xff))).toEqual(["no start of image at 0"]);
  });
  it("says a marker was expected", () => expect(msg(bytes(0xff, 0xd8, 1, 2))).toEqual(["expected a marker at 2"]));
  it("says a marker is cut off", () => expect(msg(bytes(0xff, 0xd8, 0xff))).toEqual(["marker is cut off at 2"]));
  it("says a length is cut off", () => expect(msg(bytes(0xff, 0xd8, 0xff, 0xe1, 0))).toEqual(["segment length is cut off at 2"]));
  it("says a length is wrong, too short or past the end", () => {
    expect(msg(bytes(0xff, 0xd8, 0xff, 0xe1, 0, 1, 0))).toEqual(["segment length is wrong at 2"]);
    expect(msg(bytes(0xff, 0xd8, 0xff, 0xe1, 0, 9, 1))).toEqual(["segment length is wrong at 2"]);
  });
  it("says there is no end of image, in the scan and after a segment", () => {
    expect(msg(jpegBytes({ before: baselineSegments(), noEnd: true }))).toEqual([expect.stringMatching(/^no end of image at \d+$/)]);
    expect(msg(bytes(0xff, 0xd8, 0xff, 0xfe, 0, 2))).toEqual([expect.stringMatching(/^no end of image/)]);
  });
  it("is not whole without a scan", () => expect(isWholeJpeg(parseJpeg(bytes(0xff, 0xd8, 0xff, 0xd9)))).toBe(false));
  it("never throws, whatever the bytes", () => {
    for (let n = 0; n < 300; n++) {
      const d = Uint8Array.from({ length: (n * 7) % 60 }, (_, i) => (i * 37 + n * 11) & 0xff);
      expect(() => parseJpeg(Uint8Array.of(0xff, 0xd8, ...d))).not.toThrow();
    }
  });
});

describe("segment builder", () => {
  it("writes the marker, the length with its own two bytes, and the payload", () => expect(segment(0xfe, bytes(65, 66))).toEqual(bytes(0xff, 0xfe, 0, 4, 65, 66)));
  it("refuses a payload that does not fit in the length", () => expect(() => segment(0xfe, new Uint8Array(70_000))).toThrow("segment too long"));
});
