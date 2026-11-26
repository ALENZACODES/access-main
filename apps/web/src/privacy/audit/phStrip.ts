// A reference for what preparing a JPEG for sharing should do, written from the structure reader and not from the
// code under test: keep the start of image, every segment that is not application data or a comment (in order), the
// scans, and an end of image; drop application data and comments wherever they are, fill bytes, and everything
// after the end of image. The audits compare the App's own function with this one on files built to differ. It
// throws on a file that is not whole, as the App's does.

import { isMetadataMarker, nextScanMarker, parseJpeg, errorsOf } from "./phJpeg";

export function referenceStrip(data: Uint8Array): Uint8Array {
  const parts = parseJpeg(data);
  const errors = errorsOf(parts);
  if (errors.length > 0) throw new Error(`not a whole JPEG: ${errors[0]}`);
  const out: number[] = [0xff, 0xd8];
  for (const p of parts) {
    if (p.kind === "segment") {
      if (isMetadataMarker(p.marker)) continue;
      out.push(0xff, p.marker, p.length >> 8, p.length & 0xff, ...p.payload);
    } else if (p.kind === "standalone") {
      out.push(0xff, p.marker);
    } else if (p.kind === "scan") {
      for (let i = p.offset; i < p.end; i++) out.push(data[i] as number);
    } else if (p.kind === "eoi") {
      out.push(0xff, 0xd9);
    }
  }
  return Uint8Array.from(out);
}

/** The offsets of the markers that end entropy-coded data in the bytes, for tests of the reader. */
export function scanEnds(data: Uint8Array): number[] {
  const out: number[] = [];
  let at = 0;
  for (;;) {
    const i = nextScanMarker(data, at);
    if (i < 0) return out;
    out.push(i);
    at = i + 2;
  }
}
