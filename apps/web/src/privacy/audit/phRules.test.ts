import { describe, expect, it } from "vitest";
import { ascTag, baselineSegments, bytes, concat, exifSegment, gpsTags, jpegBytes, shortTag, ascii } from "./phBuild";
import { PH_CODES, PH_LEAKS, auditJpeg, countCodes, findEmbeddedImage, formatPhFinding, isClean } from "./phRules";

const codes = (d: Uint8Array): string[] => auditJpeg(d).map((f) => f.code);
const base = baselineSegments();
const withSegments = (...extra: Array<{ marker: number; payload: Uint8Array }>): Uint8Array => jpegBytes({ before: [...extra, ...base] });

describe("a clean file", () => {
  it("has no finding", () => expect(auditJpeg(jpegBytes({ before: base }))).toEqual([]));
  it("is clean", () => expect(isClean(jpegBytes({ before: base }))).toBe(true));
});

describe("exif", () => {
  it("finds a GPS position and says where", () => {
    const f = auditJpeg(withSegments(exifSegment({ gps: gpsTags(43.6532, -79.3832) })));
    expect(f).toEqual([{ code: "ph-exif-gps", detail: "43.6532, -79.3832", offset: 2 }]);
  });
  it("finds a GPS directory with no position that could be read", () => expect(auditJpeg(withSegments(exifSegment({ gps: [ascTag(1, "N")] })))[0]?.detail).toBe("a GPS directory with no position that could be read"));
  it("finds the camera, the software and the serial number, once, with their names", () => {
    const f = auditJpeg(withSegments(exifSegment({ ifd0: [ascTag(0x010f, "Acme"), ascTag(0x0131, "EditPro")], exif: [ascTag(0xa431, "SN1")] })));
    expect(f).toHaveLength(1);
    expect(f[0]?.code).toBe("ph-exif-identity");
    expect(f[0]?.detail.split(", ").sort()).toEqual(["BodySerialNumber", "Make", "Software"]);
  });
  it("finds the time", () => expect(codes(withSegments(exifSegment({ ifd0: [ascTag(0x0132, "2026:11:20 10:11:12")] })))).toEqual(["ph-exif-time"]));
  it("finds all three kinds in one block", () => expect(codes(withSegments(exifSegment({ ifd0: [ascTag(0x010f, "A"), ascTag(0x0132, "t")], gps: gpsTags(1, 2) }))).sort()).toEqual(["ph-exif-gps", "ph-exif-identity", "ph-exif-time"]));
  it("finds a thumbnail inside the block", () => expect(codes(withSegments(exifSegment({ ifd0: [shortTag(0x0112, 1)], thumbnail: bytes(0xff, 0xd8, 0xff, 0xd9) })))).toEqual(["ph-embedded-image"]));
  it("finds an exif block that cannot be read, as an application segment", () => expect(codes(withSegments({ marker: 0xe1, payload: concat(bytes(0x45, 0x78, 0x69, 0x66, 0, 0), bytes(1, 2)) }))).toEqual(["ph-app-segment"]));
});

describe("other segments", () => {
  it("finds an XMP block", () => expect(codes(withSegments({ marker: 0xe1, payload: ascii("http" + "://ns.adobe.com/xap/1.0/\0<x/>") }))).toEqual(["ph-xmp"]));
  it("finds a comment", () => expect(auditJpeg(withSegments({ marker: 0xfe, payload: ascii("by Jane") }))[0]).toMatchObject({ code: "ph-comment", detail: "COM (9 bytes)" }));
  it("finds every other application segment, by name", () => {
    for (const m of [0xe0, 0xe2, 0xe3, 0xed, 0xee, 0xef]) expect(codes(withSegments({ marker: m, payload: bytes(1, 2, 3) })), String(m)).toEqual(["ph-app-segment"]);
    expect(auditJpeg(withSegments({ marker: 0xed, payload: bytes(1) }))[0]?.detail).toBe("APP13 (3 bytes)");
  });
  it("finds a picture inside another segment", () => expect(codes(withSegments({ marker: 0xe2, payload: bytes(1, 0xff, 0xd8, 0xff, 0xe0) }))).toEqual(["ph-app-segment", "ph-embedded-image"]));
});

describe("after the end of image", () => {
  it("finds the bytes", () => expect(auditJpeg(jpegBytes({ before: base, trailer: bytes(1, 2, 3) }))[0]).toMatchObject({ code: "ph-trailer", detail: "3 bytes after the end of image" }));
  it("finds a second picture", () => expect(codes(jpegBytes({ before: base, trailer: bytes(0, 0xff, 0xd8, 0xff, 0xdb) }))).toEqual(["ph-trailer", "ph-trailer-image"]));
  it("says where the trailer starts", () => {
    const f = jpegBytes({ before: base, trailer: bytes(1, 2) });
    expect(auditJpeg(f)[0]?.offset).toBe(f.length - 2);
  });
});

describe("a file that is not whole", () => {
  it("is a finding, so a file that cannot be read is never taken as clean", () => {
    expect(codes(bytes(1, 2, 3))).toEqual(["ph-malformed"]);
    expect(isClean(bytes(1, 2, 3))).toBe(false);
    expect(codes(jpegBytes({ before: base, noEnd: true }))).toEqual(["ph-malformed"]);
  });
  it("still finds what it can in a file that is cut off", () => expect(codes(concat(jpegBytes({ before: [exifSegment({ gps: gpsTags(1, 2) }), ...base], noEnd: true })))).toEqual(["ph-exif-gps", "ph-malformed"]));
});

describe("findEmbeddedImage", () => {
  it("finds a start of image followed by another marker", () => expect(findEmbeddedImage(bytes(1, 0xff, 0xd8, 0xff, 0xe0))).toBe(1));
  it("does not take FF D8 alone", () => expect(findEmbeddedImage(bytes(1, 0xff, 0xd8, 2))).toBe(-1));
  it("starts from the index given", () => expect(findEmbeddedImage(bytes(0xff, 0xd8, 0xff, 5, 0xff, 0xd8, 0xff), 1)).toBe(4));
});

describe("countCodes, formatPhFinding and PH_LEAKS", () => {
  it("counts every code, with zero for none", () => {
    const c = countCodes(auditJpeg(withSegments({ marker: 0xfe, payload: bytes(1) }, { marker: 0xfe, payload: bytes(2) })));
    expect(c["ph-comment"]).toBe(2);
    expect(c["ph-exif-gps"]).toBe(0);
    expect(Object.keys(c)).toEqual([...PH_CODES]);
  });
  it("writes a finding on one line", () => expect(formatPhFinding({ code: "ph-comment", detail: "COM (3 bytes)", offset: 9 })).toBe("ph-comment at 9: COM (3 bytes)"));
  it("names every code but the malformed one as a leak", () => expect(PH_LEAKS).toEqual(PH_CODES.filter((c) => c !== "ph-malformed")));
  it("sorts the findings by place in the file", () => {
    const f = auditJpeg(jpegBytes({ before: [{ marker: 0xfe, payload: bytes(1) }, { marker: 0xe0, payload: bytes(2) }, ...base] }));
    expect(f.map((x) => x.offset)).toEqual([...f.map((x) => x.offset)].sort((a, b) => a - b));
  });
});
