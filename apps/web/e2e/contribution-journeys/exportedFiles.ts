import type { Download } from "@playwright/test";
import { readFile } from "node:fs/promises";

/** Read the stored members written by the offline contribution exporter. */
export async function readStoredZip(download: Download): Promise<Map<string, Buffer>> {
  const path = await download.path();
  if (!path) throw new Error("Download did not finish");
  const bytes = await readFile(path);
  const files = new Map<string, Buffer>();
  let offset = 0;
  while (offset + 4 <= bytes.length && bytes.readUInt32LE(offset) === 0x04034b50) {
    if (offset + 30 > bytes.length) throw new Error("Truncated ZIP header");
    if (bytes.readUInt16LE(offset + 8) !== 0) throw new Error("Expected stored file");
    const length = bytes.readUInt32LE(offset + 18);
    const nameLength = bytes.readUInt16LE(offset + 26);
    const extraLength = bytes.readUInt16LE(offset + 28);
    const nameOffset = offset + 30;
    const start = nameOffset + nameLength + extraLength;
    if (start + length > bytes.length) throw new Error("Truncated file");
    const name = bytes.toString("utf8", nameOffset, nameOffset + nameLength);
    if (files.has(name)) throw new Error(`Duplicate archive entry: ${name}`);
    files.set(name, bytes.subarray(start, start + length));
    offset = start + length;
  }
  if (files.size === 0 || bytes.readUInt32LE(offset) !== 0x02014b50) {
    throw new Error("Expected the ZIP central directory");
  }
  return files;
}
