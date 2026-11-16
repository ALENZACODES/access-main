/** Binary artifact signatures, parsed from bounded file prefixes only. */
import { extname } from 'node:path';
import { open } from 'node:fs/promises';
import { finding } from './site-audit.mjs';

const MAGIC = new Map([
  ['.png', [{ bytes: [137, 80, 78, 71, 13, 10, 26, 10], offset: 0 }]],
  ['.gif', [
    { ascii: 'GIF87a', offset: 0 }, { ascii: 'GIF89a', offset: 0 },
  ]],
  ['.jpg', [{ bytes: [255, 216, 255], offset: 0 }]],
  ['.jpeg', [{ bytes: [255, 216, 255], offset: 0 }]],
  ['.webp', [{ ascii: 'RIFF', offset: 0, additional: { ascii: 'WEBP', offset: 8 } }]],
  ['.pdf', [{ ascii: '%PDF-', offset: 0 }]],
  ['.woff', [{ ascii: 'wOFF', offset: 0 }]],
  ['.woff2', [{ ascii: 'wOF2', offset: 0 }]],
  ['.otf', [{ ascii: 'OTTO', offset: 0 }]],
  ['.ttf', [{ bytes: [0, 1, 0, 0], offset: 0 }]],
  ['.ico', [{ bytes: [0, 0, 1, 0], offset: 0 }]],
  ['.zip', [{ bytes: [80, 75, 3, 4], offset: 0 }]],
]);
const EMPTY_SIGNATURES = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf',
  '.woff', '.woff2', '.otf', '.ttf', '.ico', '.zip']);
const MAX_PREFIX = 64;

export function knownBinaryExtension(name) {
  return MAGIC.has(extname(name).toLowerCase());
}

function matchesAt(bytes, spec) {
  const data = spec.ascii ? Buffer.from(spec.ascii, 'ascii') : Buffer.from(spec.bytes);
  if (bytes.length < spec.offset + data.length) return false;
  return data.every((byte, index) => bytes[spec.offset + index] === byte);
}

export function hasBinarySignature(bytes, name) {
  const entries = MAGIC.get(extname(name).toLowerCase());
  if (!entries) return true;
  if (!(bytes instanceof Uint8Array)) return false;
  return entries.some((pattern) => matchesAt(bytes, pattern) &&
    (!pattern.additional || matchesAt(bytes, pattern.additional)));
}

export function inspectBinaryHeader(bytes, name) {
  const extension = extname(name).toLowerCase();
  if (!EMPTY_SIGNATURES.has(extension)) return [];
  const issues = [];
  const add = (code, detail) => issues.push(finding(code, name, detail));
  if (!bytes?.length) {
    add('BINARY_EMPTY', 'Published binary file is empty');
    return issues;
  }
  if (!hasBinarySignature(bytes, name)) {
    add('BINARY_SIGNATURE', 'File extension does not match its file signature');
    return issues;
  }
  if (extension === '.png') {
    if (bytes.length >= 24) {
      const prefix = Buffer.from(bytes);
      const width = prefix.readUInt32BE(16);
      const height = prefix.readUInt32BE(20);
      if (!width || !height || width > 32768 || height > 32768) {
        add('BINARY_PNG_DIMENSIONS', 'PNG dimensions exceed release bounds');
      }
    }
  }
  if (extension === '.webp' && bytes.length >= 12) {
    const prefix = Buffer.from(bytes);
    const declared = prefix.readUInt32LE(4) + 8;
    if (declared < 12) add('BINARY_WEBP_LENGTH',
      'WebP RIFF length is inconsistent with its header');
  }
  return issues;
}

/**
 * Read only the first 64 bytes, refusing symlink escapes in the collected
 * inventory. Full decoding, PDF page content and image perception are outside
 * this static signature check.
 */
export async function inspectBinaryFile(entry, name) {
  if (!knownBinaryExtension(name)) return [];
  let handle;
  try {
    handle = await open(entry.absolute, 'r');
    const stats = await handle.stat();
    if (!stats.isFile()) return [finding('BINARY_NOT_FILE', name,
      'Expected a regular file')];
    if (!stats.size) return [finding('BINARY_EMPTY', name,
      'Published binary file is empty')];
    const buffer = Buffer.alloc(Math.min(MAX_PREFIX, stats.size));
    const result = await handle.read(buffer, 0, buffer.length, 0);
    if (result.bytesRead !== buffer.length) return [finding('BINARY_SHORT_READ', name,
      'File could not be read in full')];
    return inspectBinaryHeader(buffer, name);
  } catch (error) {
    return [finding('BINARY_READ', name,
      `Unable to read packaged binary: ${error instanceof Error ? error.code ?? 'error' : 'error'}`)];
  } finally {
    await handle?.close();
  }
}
