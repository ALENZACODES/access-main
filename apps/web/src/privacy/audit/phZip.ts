// Reads a ZIP file that holds stored (not compressed) entries, as the contribution export writes. It reads the
// central directory at the end, then each entry's data. It never throws: a file that is not a ZIP of stored entries
// gives problems and the entries it could read. Node and tests only.

export interface ZipEntry {
  name: string;
  data: Uint8Array;
  /** The crc field of the entry, as written. */
  crc: number;
}

export interface ZipRead {
  entries: ZipEntry[];
  problems: string[];
}

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

export function readZip(bytes: Uint8Array): ZipRead {
  const out: ZipRead = { entries: [], problems: [] };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0 && i >= bytes.length - 22 - 65_535; i--) {
    if (view.getUint32(i, true) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) {
    out.problems.push("no end of central directory");
    return out;
  }
  const count = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true);
  for (let k = 0; k < count; k++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== CENTRAL) {
      out.problems.push(`entry ${k} of the central directory is wrong`);
      return out;
    }
    const method = view.getUint16(at + 10, true);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const offset = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + extraLength + commentLength;
    if (method !== 0) {
      out.problems.push(`${name} is compressed`);
      continue;
    }
    if (offset + 30 > bytes.length || view.getUint32(offset, true) !== LOCAL) {
      out.problems.push(`${name} has no local header`);
      continue;
    }
    const start = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true);
    if (start + size > bytes.length) {
      out.problems.push(`${name} is cut off`);
      continue;
    }
    out.entries.push({ name, data: bytes.subarray(start, start + size), crc });
  }
  return out;
}

/** The CRC-32 of the bytes, as a ZIP file writes it. */
export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of data) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

/** The names of the entries whose stored crc is not the crc of their data. */
export function badChecksums(read: ZipRead): string[] {
  return read.entries.filter((e) => crc32(e.data) !== e.crc).map((e) => e.name);
}

export function entryText(read: ZipRead, name: string): string | null {
  const e = read.entries.find((x) => x.name === name);
  return e === undefined ? null : new TextDecoder().decode(e.data);
}
