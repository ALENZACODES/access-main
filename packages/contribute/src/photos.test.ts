import { describe, expect, it, vi } from "vitest";
import { sanitisePhoto, stripJpegMetadata } from "./photos";

// Synthetic JPEG marker stream with an APP1 EXIF GPS signature.
const gps = new TextEncoder().encode("Exif\0\0GPSInfo");
const marker = new Uint8Array([0xff, 0xe1, 0, gps.length + 2, ...gps]);
const jpeg = new Uint8Array([0xff, 0xd8, ...marker, 0xff, 0xda, 0, 2, 0xff, 0xd9]);
describe("photo privacy", () => {
  it("strips APP1 GPS/EXIF marker bytes", async () => {
    const blob = await stripJpegMetadata(new Blob([jpeg], { type: "image/jpeg" }));
    const result = new Uint8Array(await blob.arrayBuffer());
    expect(new TextDecoder().decode(result)).not.toContain("GPSInfo");
    expect(Array.from(result.subarray(0, 2))).toEqual([0xff, 0xd8]);
    expect(Array.from(result.subarray(2, 4))).toEqual([0xff, 0xda]);
  });
  it("re-encodes through canvas before stripping metadata", async () => {
    const close = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 50, height: 30, close })));
    const ctx = { fillRect: vi.fn(), drawImage: vi.fn(), fillStyle: "" };
    const canvas = { width: 0, height: 0, getContext: () => ctx, toBlob: (cb: (b: Blob) => void) => cb(new Blob([jpeg], { type: "image/jpeg" })) };
    const previous = globalThis.document;
    vi.stubGlobal("document", previous ?? { createElement: () => ({}) });
    const spy = vi.spyOn(document, "createElement").mockReturnValue(canvas as unknown as HTMLElement);
    try {
      const output = await sanitisePhoto(new File([jpeg], "gps.jpg", { type: "image/jpeg" }));
      expect(new TextDecoder().decode(await output.arrayBuffer())).not.toContain("GPSInfo");
      expect(ctx.drawImage).toHaveBeenCalledOnce();
      expect(close).toHaveBeenCalledOnce();
    } finally { spy.mockRestore(); vi.unstubAllGlobals(); }
  });
});
