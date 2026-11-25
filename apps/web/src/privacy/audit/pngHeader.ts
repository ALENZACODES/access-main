// Reads the size of a PNG picture from its first 33 bytes: the 8-byte signature and the header chunk. It reads nothing
// else in the file and does not check that the rest of the file is a valid picture. Node only (tests and CI), never
// shipped to the browser.

export interface PngSize {
  width: number;
  height: number;
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const MAX_SIDE = 0x7fffffff;

function u32(b: Uint8Array, at: number): number {
  return (((b[at] as number) << 24) | ((b[at + 1] as number) << 16) | ((b[at + 2] as number) << 8) | (b[at + 3] as number)) >>> 0;
}

/** The width and height in the header, or null when the bytes do not start with a PNG signature and a header chunk. */
export function readPngSize(bytes: Uint8Array): PngSize | null {
  if (bytes.length < 24) return null;
  for (let i = 0; i < SIGNATURE.length; i++) if (bytes[i] !== SIGNATURE[i]) return null;
  if (u32(bytes, 8) !== 13) return null;
  if (bytes[12] !== 0x49 || bytes[13] !== 0x48 || bytes[14] !== 0x44 || bytes[15] !== 0x52) return null;
  const width = u32(bytes, 16);
  const height = u32(bytes, 20);
  if (width === 0 || height === 0 || width > MAX_SIDE || height > MAX_SIDE) return null;
  return { width, height };
}

/** The size as "WxH", the form a manifest uses. */
export function sizeText(s: PngSize): string {
  return `${s.width}x${s.height}`;
}
