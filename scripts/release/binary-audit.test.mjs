import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { knownBinaryExtension, hasBinarySignature, inspectBinaryHeader, inspectBinaryFile } from './binary-audit.mjs';

const known = [
  ['image.png', [137, 80, 78, 71, 13, 10, 26, 10]],
  ['image.jpg', [255, 216, 255]], ['image.jpeg', [255, 216, 255]],
  ['icon.gif', [...Buffer.from('GIF89a')]],
  ['guide.pdf', [...Buffer.from('%PDF-1.7')]],
  ['font.woff', [...Buffer.from('wOFF')]],
  ['font.woff2', [...Buffer.from('wOF2')]],
  ['font.otf', [...Buffer.from('OTTO')]],
  ['font.ttf', [0, 1, 0, 0]],
  ['favicon.ico', [0, 0, 1, 0]],
  ['archive.zip', [80, 75, 3, 4]],
];
const has = (issues, code) => assert.ok(issues.some((item) => item.code === code),
  `Expected ${code}, received ${JSON.stringify(issues)}`);

describe('binary signatures', () => {
  for (const [name, header] of known) {
    it(`recognizes ${name}`, () => {
      assert.equal(knownBinaryExtension(name), true);
      assert.equal(hasBinarySignature(Buffer.from(header), name), true);
    });
    it(`rejects corrupt ${name}`, () => {
      assert.equal(hasBinarySignature(Buffer.from('not an asset'), name), false);
      has(inspectBinaryHeader(Buffer.from('not an asset'), name), 'BINARY_SIGNATURE');
    });
  }
  it('accepts a valid WEBP RIFF header', () => {
    const header = Buffer.alloc(12);
    header.write('RIFF', 0); header.writeUInt32LE(12, 4); header.write('WEBP', 8);
    assert.equal(hasBinarySignature(header, 'image.webp'), true);
  });
  it('rejects a wrong WEBP subtype', () => assert.equal(hasBinarySignature(Buffer.from('RIFF0000JUNK'), 'image.webp'), false));
  it('does not classify text as binary', () => assert.equal(knownBinaryExtension('index.html'), false));
  it('ignores an unknown extension', () => assert.deepEqual(inspectBinaryHeader(Buffer.from('anything'), 'file.txt'), []));
  it('rejects an empty binary', () => has(inspectBinaryHeader(Buffer.alloc(0), 'image.png'), 'BINARY_EMPTY'));
  it('rejects invalid PNG dimensions', () => {
    const buffer = Buffer.alloc(24); Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(buffer);
    buffer.writeUInt32BE(0, 16); buffer.writeUInt32BE(10, 20);
    has(inspectBinaryHeader(buffer, 'icon.png'), 'BINARY_PNG_DIMENSIONS');
  });
  it('accepts reasonable PNG dimensions', () => {
    const buffer = Buffer.alloc(24); Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(buffer);
    buffer.writeUInt32BE(64, 16); buffer.writeUInt32BE(64, 20);
    assert.deepEqual(inspectBinaryHeader(buffer, 'icon.png'), []);
  });
  it('rejects invalid array inputs', () => assert.equal(hasBinarySignature(null, 'image.png'), false));
});

describe('bounded file reading', () => {
  async function withFile(value, name, run) {
    const root = await mkdtemp(join(tmpdir(), 'release-binary-'));
    try {
      const absolute = join(root, name);
      await writeFile(absolute, value);
      return await run({ absolute }, name);
    } finally { await rm(root, { recursive: true, force: true }); }
  }
  it('accepts a local PDF signature', async () => withFile('%PDF-1.7\nbody', 'guide.pdf', async (entry, name) => assert.deepEqual(await inspectBinaryFile(entry, name), [])));
  it('rejects corrupted PDFs', async () => withFile('not a pdf', 'guide.pdf', async (entry, name) => has(await inspectBinaryFile(entry, name), 'BINARY_SIGNATURE')));
  it('rejects empty images', async () => withFile('', 'cover.png', async (entry, name) => has(await inspectBinaryFile(entry, name), 'BINARY_EMPTY')));
  it('ignores unrelated extensions', async () => withFile('anything', 'notes.txt', async (entry, name) => assert.deepEqual(await inspectBinaryFile(entry, name), [])));
  it('rejects missing file paths', async () => has(await inspectBinaryFile({ absolute: '/absent/path/file.pdf' }, 'file.pdf'), 'BINARY_READ'));
});
