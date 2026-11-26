// Behaviour audit of sanitisePhoto with the browser's picture functions replaced by recorders. It checks what the
// function asks of the browser (turn the picture upright, cap the size, free the bitmap) and what it refuses; the
// bytes it returns are cleaned by the real stripJpegMetadata. It does not decode a picture: what a real browser's
// encoder writes into the file is not checked here.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sanitisePhoto } from "../../../../../packages/contribute/src/photos";
import { ascTag, baselineSegments, bytes, exifSegment, gpsTags, jpegBytes } from "./phBuild";
import { auditJpeg } from "./phRules";

interface Rig {
  closed: number;
  bitmapOptions: unknown[];
  canvas: { width: number; height: number };
  fills: number;
  draws: Array<[number, number]>;
  quality: number[];
}

let rig: Rig;
let encoded: Uint8Array;
let size = { width: 4000, height: 3000 };
let failEncode = false;
let noContext = false;
let failBitmap = false;

const file = (type = "image/jpeg", length = 10): File => new File([new Uint8Array(length)], "p.jpg", { type });
const dirty = (): Uint8Array => jpegBytes({ before: [exifSegment({ ifd0: [ascTag(0x010f, "Acme")], gps: gpsTags(43.6, -79.4) }), ...baselineSegments()] });

beforeEach(() => {
  rig = { closed: 0, bitmapOptions: [], canvas: { width: 0, height: 0 }, fills: 0, draws: [], quality: [] };
  encoded = jpegBytes({ before: baselineSegments() });
  size = { width: 4000, height: 3000 };
  failEncode = false;
  noContext = false;
  failBitmap = false;
  vi.stubGlobal("createImageBitmap", async (_f: Blob, options: unknown) => {
    rig.bitmapOptions.push(options);
    if (failBitmap) throw new Error("decode failed");
    return { width: size.width, height: size.height, close: () => void rig.closed++ };
  });
  vi.stubGlobal("document", {
    createElement: () => {
      const canvas = {
        get width() { return rig.canvas.width; },
        set width(v: number) { rig.canvas.width = v; },
        get height() { return rig.canvas.height; },
        set height(v: number) { rig.canvas.height = v; },
        getContext: () => noContext ? null : { fillStyle: "", fillRect: () => void rig.fills++, drawImage: (_b: unknown, _x: number, _y: number, w: number, h: number) => void rig.draws.push([w, h]) },
        toBlob: (cb: (b: Blob | null) => void, _type: string, q: number) => {
          rig.quality.push(q);
          cb(failEncode ? null : new Blob([encoded as Uint8Array<ArrayBuffer>], { type: "image/jpeg" }));
        },
      };
      return canvas;
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

const bytesOf = async (b: Blob): Promise<Uint8Array> => new Uint8Array(await b.arrayBuffer());

describe("what it asks of the browser", () => {
  it("asks for the picture to be turned upright from its own orientation", async () => {
    await sanitisePhoto(file());
    expect(rig.bitmapOptions).toEqual([{ imageOrientation: "from-image" }]);
  });
  it("keeps a picture inside 2400 pixels on its longer side, and keeps the shape", async () => {
    await sanitisePhoto(file());
    expect(rig.canvas).toEqual({ width: 2400, height: 1800 });
    expect(rig.draws).toEqual([[2400, 1800]]);
  });
  it("caps a tall picture on its height", async () => {
    size = { width: 3000, height: 6000 };
    await sanitisePhoto(file());
    expect(rig.canvas).toEqual({ width: 1200, height: 2400 });
  });
  it.each([[2400, 2400], [100, 50], [1, 1]])("does not enlarge a picture that is %i by %i or smaller", async (w, h) => {
    size = { width: w, height: h };
    await sanitisePhoto(file());
    expect(rig.canvas).toEqual({ width: w, height: h });
  });
  it("never gives the canvas a side of zero, for an extreme shape", async () => {
    size = { width: 10_000, height: 1 };
    await sanitisePhoto(file());
    expect(rig.canvas.width).toBe(2400);
    expect(rig.canvas.height).toBe(1);
  });
  it("fills the canvas white before it draws, so a transparent picture is not black", async () => {
    await sanitisePhoto(file());
    expect(rig.fills).toBe(1);
  });
  it("encodes once, as a JPEG at quality 0.88", async () => {
    await sanitisePhoto(file());
    expect(rig.quality).toEqual([0.88]);
  });
});

describe("what it frees", () => {
  it("closes the bitmap when it succeeds", async () => {
    await sanitisePhoto(file());
    expect(rig.closed).toBe(1);
  });
  it("closes the bitmap when encoding fails", async () => {
    failEncode = true;
    await expect(sanitisePhoto(file())).rejects.toThrow("Image encoding failed");
    expect(rig.closed).toBe(1);
  });
  it("closes the bitmap when there is no canvas context", async () => {
    noContext = true;
    await expect(sanitisePhoto(file())).rejects.toThrow("Canvas unavailable");
    expect(rig.closed).toBe(1);
  });
  it("closes the bitmap when the encoded file cannot be cleaned", async () => {
    encoded = bytes(1, 2, 3);
    await expect(sanitisePhoto(file())).rejects.toThrow("Invalid JPEG");
    expect(rig.closed).toBe(1);
  });
  it("has nothing to close when the picture cannot be decoded, and says why", async () => {
    failBitmap = true;
    await expect(sanitisePhoto(file())).rejects.toThrow("decode failed");
    expect(rig.closed).toBe(0);
  });
});

describe("what it refuses before it decodes", () => {
  it.each([["text/plain"], ["application/pdf"], [""], ["video/mp4"]])("refuses the type %j", async (type) => {
    await expect(sanitisePhoto(file(type))).rejects.toThrow("Not an image");
    expect(rig.bitmapOptions).toEqual([]);
  });
  it("refuses a file over 20 MB, and accepts one of exactly 20 MB", async () => {
    await expect(sanitisePhoto(file("image/jpeg", 20 * 1024 * 1024 + 1))).rejects.toThrow("Image exceeds 20 MB");
    expect(rig.bitmapOptions).toEqual([]);
    await expect(sanitisePhoto(file("image/jpeg", 20 * 1024 * 1024))).resolves.toBeInstanceOf(Blob);
  });
  it.each([["image/png"], ["image/webp"], ["image/heic"]])("accepts the type %s and gives a JPEG", async (type) => {
    expect((await sanitisePhoto(file(type))).type).toBe("image/jpeg");
  });
});

describe("what comes out", () => {
  it("is clean when the encoder wrote a camera block with GPS", async () => {
    encoded = dirty();
    expect(auditJpeg(await bytesOf(await sanitisePhoto(file())))).toEqual([]);
  });
  it("is the encoder's file when that file was clean", async () => {
    expect(Array.from(await bytesOf(await sanitisePhoto(file())))).toEqual(Array.from(encoded));
  });
  it("does not carry the original file's bytes, only what the encoder wrote", async () => {
    const original = new File([dirty() as Uint8Array<ArrayBuffer>], "p.jpg", { type: "image/jpeg" });
    const out = new TextDecoder("latin1").decode(await bytesOf(await sanitisePhoto(original)));
    expect(out).not.toContain("Acme");
  });
});

describe("known: what a non-conforming encoder can still leave", () => {
  it("keeps a trailer after the end of image, with its second picture", async () => {
    encoded = jpegBytes({ before: baselineSegments(), trailer: dirty() });
    const codes = auditJpeg(await bytesOf(await sanitisePhoto(file()))).map((f) => f.code);
    expect(codes).toEqual(expect.arrayContaining(["ph-trailer", "ph-trailer-image"]));
  });
});
