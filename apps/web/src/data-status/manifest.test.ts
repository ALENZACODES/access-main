import { describe, expect, it } from 'vitest';
import { buildExportFiles } from './exportFiles';
import { lintFrench } from './i18n';
import {
  buildManifest,
  describeVerify,
  isSafeFilename,
  manifestHelp,
  manifestToText,
  parseManifestText,
  sha256Hex,
  toHex,
  utf8Length,
  verifyManifest,
  type ManifestFileInput,
} from './manifest';
import { NOW, RECORDS } from './testkit';

const EMPTY_SHA = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const ABC_SHA = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

describe('hashing', () => {
  it('matches the published SHA-256 test vectors', async () => {
    expect(await sha256Hex('')).toBe(EMPTY_SHA);
    expect(await sha256Hex('abc')).toBe(ABC_SHA);
  });
  it('hashes the UTF-8 bytes, so accents and emoji count by bytes', async () => {
    expect(utf8Length('abc')).toBe(3);
    expect(utf8Length('é')).toBe(2);
    expect(utf8Length('😀')).toBe(4);
    expect(await sha256Hex('é')).not.toBe(await sha256Hex('e'));
  });
  it('is null, not a made-up value, when Web Crypto is missing', async () => {
    expect(await sha256Hex('abc', {})).toBeNull();
    expect(await sha256Hex('abc', { crypto: {} })).toBeNull();
  });
  it('formats bytes as two lowercase hex digits each', () => {
    expect(toHex(new Uint8Array([0, 1, 15, 16, 255]))).toBe('00010f10ff');
    expect(toHex(new Uint8Array([]))).toBe('');
  });
});

describe('isSafeFilename', () => {
  it('accepts plain names with a dot, dash or underscore', () => {
    for (const n of ['credits.txt', 'data-sources.csv', 'a', 'x_1.json', 'review-dates.ics']) expect(isSafeFilename(n)).toBe(true);
  });
  it('rejects paths, traversal, spaces, hidden names and over-long names', () => {
    for (const n of ['', '.env', '../x', 'a/b', 'a\\b', 'a b', 'a..b', 'é.txt', 'a\nb', 'x'.repeat(101)]) expect(isSafeFilename(n), JSON.stringify(n)).toBe(false);
  });
});

describe('buildManifest and manifestToText', () => {
  const files: ManifestFileInput[] = [
    { filename: 'b.txt', text: 'abc' },
    { filename: 'a.txt', text: '' },
  ];
  it('lists files sorted by name with byte counts and hashes', async () => {
    const m = await buildManifest(files);
    expect(m?.entries).toEqual([
      { filename: 'a.txt', bytes: 0, sha256: EMPTY_SHA },
      { filename: 'b.txt', bytes: 3, sha256: ABC_SHA },
    ]);
  });
  it('writes the two-space sha256sum layout, one line per file, ending in a newline', async () => {
    const m = await buildManifest(files);
    expect(m === null ? '' : manifestToText(m)).toBe(`${EMPTY_SHA}  a.txt\n${ABC_SHA}  b.txt\n`);
  });
  it('is null when a file name is not safe or Web Crypto is missing', async () => {
    expect(await buildManifest([{ filename: '../x', text: '' }])).toBeNull();
    expect(await buildManifest(files, {})).toBeNull();
  });
  it('is an empty manifest for no files', async () => {
    const m = await buildManifest([]);
    expect(m).toEqual({ entries: [] });
    expect(manifestToText({ entries: [] })).toBe('');
  });
});

describe('parseManifestText', () => {
  it('reads what manifestToText wrote', async () => {
    const m = await buildManifest([{ filename: 'a.txt', text: 'x' }, { filename: 'b.csv', text: 'y' }]);
    const parsed = parseManifestText(manifestToText(m ?? { entries: [] }));
    expect(parsed).toEqual({ ok: true, entries: (m?.entries ?? []).map((e) => ({ filename: e.filename, sha256: e.sha256 })) });
  });
  it('accepts text with no final newline and an empty text', () => {
    expect(parseManifestText(`${ABC_SHA}  a.txt`)).toEqual({ ok: true, entries: [{ filename: 'a.txt', sha256: ABC_SHA }] });
    expect(parseManifestText('')).toEqual({ ok: true, entries: [] });
  });
  it('reports the line number of the first bad line', () => {
    const bad = [
      `${ABC_SHA.toUpperCase()}  a.txt`,
      `${ABC_SHA} a.txt`,
      `${ABC_SHA.slice(1)}  a.txt`,
      `${ABC_SHA}  ../a.txt`,
      `${ABC_SHA}  `,
      `${ABC_SHA}   a.txt`,
    ];
    for (const line of bad) expect(parseManifestText(`${ABC_SHA}  ok.txt\n${line}\n`), line).toEqual({ ok: false, line: 2 });
  });
  it('rejects a blank line in the middle', () => {
    expect(parseManifestText(`${ABC_SHA}  a.txt\n\n${ABC_SHA}  b.txt\n`)).toEqual({ ok: false, line: 2 });
  });
});

describe('verifyManifest', () => {
  const files: ManifestFileInput[] = [
    { filename: 'a.txt', text: 'one' },
    { filename: 'b.txt', text: 'two' },
  ];
  it('is ok when every file matches', async () => {
    const m = await buildManifest(files);
    const r = await verifyManifest(m ?? { entries: [] }, files);
    expect(r).toEqual({ ok: true, checked: 2, mismatches: [] });
  });
  it('reports a changed file, a missing file and an unexpected file, sorted by name', async () => {
    const m = await buildManifest(files);
    const r = await verifyManifest(m ?? { entries: [] }, [{ filename: 'a.txt', text: 'ONE' }, { filename: 'c.txt', text: 'x' }]);
    expect(r?.ok).toBe(false);
    expect(r?.checked).toBe(1);
    expect(r?.mismatches).toEqual([
      { filename: 'a.txt', reason: 'changed' },
      { filename: 'b.txt', reason: 'missing' },
      { filename: 'c.txt', reason: 'unexpected' },
    ]);
  });
  it('notices a one-character change, including a trailing newline', async () => {
    const m = await buildManifest([{ filename: 'a.txt', text: 'line\n' }]);
    const r = await verifyManifest(m ?? { entries: [] }, [{ filename: 'a.txt', text: 'line' }]);
    expect(r?.mismatches).toEqual([{ filename: 'a.txt', reason: 'changed' }]);
  });
  it('is null when Web Crypto is missing', async () => {
    const m = await buildManifest(files);
    expect(await verifyManifest(m ?? { entries: [] }, files, {})).toBeNull();
  });
});

describe('describeVerify', () => {
  it('words success with the singular and plural forms', () => {
    expect(describeVerify({ ok: true, checked: 1, mismatches: [] }, 'en')).toEqual(['1 file matches its checksum.']);
    expect(describeVerify({ ok: true, checked: 5, mismatches: [] }, 'en')).toEqual(['All 5 files match their checksums.']);
    expect(describeVerify({ ok: true, checked: 1, mismatches: [] }, 'fr')).toEqual(['1 fichier correspond à sa somme de contrôle.']);
    expect(describeVerify({ ok: true, checked: 5, mismatches: [] }, 'fr')).toEqual(['Les 5 fichiers correspondent à leur somme de contrôle.']);
  });
  it('words each kind of mismatch with the file name', () => {
    const r = { ok: false, checked: 1, mismatches: [{ filename: 'a.txt', reason: 'changed' as const }, { filename: 'b.txt', reason: 'missing' as const }, { filename: 'c.txt', reason: 'unexpected' as const }] };
    expect(describeVerify(r, 'en')).toEqual([
      'a.txt does not match its checksum.',
      'b.txt is listed but was not provided.',
      'c.txt is not listed in the checksums.',
    ]);
    expect(describeVerify(r, 'fr')[0]).toBe('a.txt ne correspond pas à sa somme de contrôle.');
  });
  it('says plainly when checksums cannot be made', () => {
    expect(describeVerify(null, 'en')).toEqual(['Checksums cannot be made in this browser.']);
    expect(describeVerify(null, 'fr')[0]).toContain('ne peuvent pas être calculées');
  });
  it('gives help text without French typography problems', () => {
    expect(manifestHelp('en')).toContain('sha256sum -c');
    expect(lintFrench(manifestHelp('fr'))).toEqual([]);
  });
});

describe('manifest of the real export files', () => {
  const files = buildExportFiles(RECORDS, 'en', NOW);
  it('has an entry per file and verifies against itself', async () => {
    const m = await buildManifest(files);
    expect(m?.entries.map((e) => e.filename)).toEqual(['catalogue.json', 'credits.txt', 'data-sources.csv', 'review-dates.ics', 'summary.json']);
    const r = await verifyManifest(m ?? { entries: [] }, files);
    expect(r?.ok).toBe(true);
    expect(r?.checked).toBe(5);
  });
  it('records the UTF-8 byte count of each file', async () => {
    const m = await buildManifest(files);
    for (const e of m?.entries ?? []) {
      const f = files.find((x) => x.filename === e.filename);
      expect(e.bytes).toBe(utf8Length(f?.text ?? ''));
    }
  });
  it('is the same on a second build of the same records and day, and differs for French', async () => {
    const a = await buildManifest(files);
    const b = await buildManifest(buildExportFiles(RECORDS, 'en', NOW));
    const fr = await buildManifest(buildExportFiles(RECORDS, 'fr', NOW));
    expect(manifestToText(a ?? { entries: [] })).toBe(manifestToText(b ?? { entries: [] }));
    expect(manifestToText(a ?? { entries: [] })).not.toBe(manifestToText(fr ?? { entries: [] }));
  });
  it('notices a change to one file', async () => {
    const m = await buildManifest(files);
    const edited = files.map((f) => (f.id === 'credits' ? { ...f, text: `${f.text} ` } : f));
    const r = await verifyManifest(m ?? { entries: [] }, edited);
    expect(r?.mismatches).toEqual([{ filename: 'credits.txt', reason: 'changed' }]);
  });
});
