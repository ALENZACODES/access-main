import { describe, expect, it } from "vitest";
import { readPngSize, sizeText } from "./pngHeader";

const header = (w: number, h: number, over: Partial<Record<string, number[]>> = {}): Uint8Array => {
  const u32 = (n: number): number[] => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  return Uint8Array.from([
    ...(over["sig"] ?? [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ...(over["len"] ?? u32(13)),
    ...(over["type"] ?? [0x49, 0x48, 0x44, 0x52]),
    ...u32(w),
    ...u32(h),
    8, 6, 0, 0, 0,
  ]);
};

describe("readPngSize", () => {
  it.each([
    [192, 192],
    [512, 512],
    [1, 1],
    [16, 9],
    [65536, 70000],
    [2147483647, 2],
  ])("reads %i by %i", (w, h) => expect(readPngSize(header(w, h))).toEqual({ width: w, height: h }));

  it("reads only the first 24 bytes", () => expect(readPngSize(header(3, 4).slice(0, 24))).toEqual({ width: 3, height: 4 }));
  it("is null for too few bytes", () => {
    expect(readPngSize(new Uint8Array())).toBeNull();
    expect(readPngSize(header(3, 4).slice(0, 23))).toBeNull();
  });
  it("is null for a wrong signature, length or chunk type", () => {
    expect(readPngSize(header(3, 4, { sig: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0b] }))).toBeNull();
    expect(readPngSize(header(3, 4, { len: [0, 0, 0, 12] }))).toBeNull();
    expect(readPngSize(header(3, 4, { type: [0x49, 0x48, 0x44, 0x53] }))).toBeNull();
  });
  it("is null for a side of 0 or over 2^31 - 1", () => {
    expect(readPngSize(header(0, 4))).toBeNull();
    expect(readPngSize(header(4, 0))).toBeNull();
    expect(readPngSize(header(2147483648, 4))).toBeNull();
  });
  it("is null for text that is not a picture", () => expect(readPngSize(Uint8Array.from(Array.from("<svg></svg>", (c) => c.charCodeAt(0))))).toBeNull());
});

describe("sizeText", () => {
  it("writes the size the way a manifest does", () => expect(sizeText({ width: 192, height: 192 })).toBe("192x192"));
  it("does not square a side", () => expect(sizeText({ width: 16, height: 9 })).toBe("16x9"));
});
