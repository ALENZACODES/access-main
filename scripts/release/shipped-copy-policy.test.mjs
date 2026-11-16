import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  prohibitedTerms, isCopyFile, scanCopyTerms, scanCopyDocument, scanShippedCopy,
} from './shipped-copy-policy.mjs';

const ids = (findings) => findings.map((finding) => finding.rule);
const prohibited = (name) => prohibitedTerms.find((term) => term.name === name).value;

async function site(files, callback) {
  const dir = await mkdtemp(join(tmpdir(), 'copy-gate-'));
  try {
    for (const [name, value] of Object.entries(files)) {
      const file = join(dir, name);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, value);
    }
    return await callback(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('copy extensions include HTML and its short variant', () => {
  assert.equal(isCopyFile('index.html'), true);
  assert.equal(isCopyFile('about.htm'), true);
});

test('copy extensions include JSON and the manifest', () => {
  assert.equal(isCopyFile('data.json'), true);
  assert.equal(isCopyFile('manifest.webmanifest'), true);
});

test('copy extensions include SVG, VTT and text', () => {
  for (const name of ['icon.svg', 'captions.vtt', 'readme.txt']) {
    assert.equal(isCopyFile(name), true);
  }
});

test('copy extension matching is case insensitive', () => {
  assert.equal(isCopyFile('ABOUT.HTML'), true);
});

test('compiled JS is handled by the earlier checker, not document copy rules', () => {
  assert.equal(isCopyFile('main.js'), false);
});

test('binary files are not processed as copy', () => {
  assert.equal(isCopyFile('image.png'), false);
});

test('normal English and French text passes', () => {
  assert.deepEqual(scanCopyTerms('Unknown remains UNKNOWN. L’inconnu reste inconnu.'), []);
});

test('the English confirmation term is rejected', () => {
  assert.ok(ids(scanCopyTerms(prohibited('EN_CONFIRMATION'))).includes('EN_CONFIRMATION'));
});

test('the English action term is rejected', () => {
  assert.ok(ids(scanCopyTerms(prohibited('EN_REQUEST_CONFIRMATION'))).includes('EN_REQUEST_CONFIRMATION'));
});

test('the French confirmation term is rejected', () => {
  assert.ok(ids(scanCopyTerms(prohibited('FR_CONFIRMATION'))).includes('FR_CONFIRMATION'));
});

test('the French action term is rejected', () => {
  assert.ok(ids(scanCopyTerms(prohibited('FR_REQUEST_CONFIRMATION'))).includes('FR_REQUEST_CONFIRMATION'));
});

test('the unaccented French action term is rejected', () => {
  assert.ok(ids(scanCopyTerms(prohibited('FR_UNACCENTED_CONFIRMATION'))).includes('FR_UNACCENTED_CONFIRMATION'));
});

test('a prohibited French inflection is rejected', () => {
  assert.ok(ids(scanCopyTerms(`${prohibited('FR_CONFIRMATION')}s`)).includes('FR_CONFIRMATION'));
});

test('a false time-sensitive claim is rejected', () => {
  assert.ok(ids(scanCopyTerms(prohibited('REALTIME_CLAIM'))).includes('REALTIME_CLAIM'));
});

test('a partner claim is rejected', () => {
  assert.ok(ids(scanCopyTerms(prohibited('PARTNER_CLAIM'))).includes('PARTNER_CLAIM'));
});

test('a certainty promise is rejected', () => {
  assert.ok(ids(scanCopyTerms(prohibited('PROMISE_CLAIM'))).includes('PROMISE_CLAIM'));
});

test('an accessibility grade overclaim is rejected', () => {
  assert.ok(ids(scanCopyTerms(prohibited('AAA_CLAIM'))).includes('AAA_CLAIM'));
});

test('substring inside an ordinary identifier is not treated as user copy', () => {
  const text = `field_${prohibited('EN_CONFIRMATION')}_count`;
  assert.equal(ids(scanCopyTerms(text)).includes('EN_CONFIRMATION'), false);
});

test('case variants are rejected', () => {
  assert.ok(ids(scanCopyTerms(prohibited('EN_CONFIRMATION').toUpperCase())).includes('EN_CONFIRMATION'));
});

test('line numbers are preserved', () => {
  const results = scanCopyTerms(`First line\nSecond line\n${prohibited('EN_CONFIRMATION')}`, 'index.html');
  assert.equal(results.find((item) => item.rule === 'EN_CONFIRMATION').line, 3);
});

test('the source filename is preserved', () => {
  const results = scanCopyTerms(prohibited('EN_CONFIRMATION'), 'fr/about.html');
  assert.equal(results[0].file, 'fr/about.html');
});

test('multiple occurrences yield multiple findings', () => {
  const word = prohibited('EN_CONFIRMATION');
  assert.equal(scanCopyTerms(`${word} ${word}`).filter((item) => item.rule === 'EN_CONFIRMATION').length, 2);
});

test('a passing copy document returns no issues', () => {
  assert.deepEqual(scanCopyDocument('index.html', Buffer.from('<main>UNKNOWN</main>')), []);
});

test('a prohibited term in JSON is detected', () => {
  const text = JSON.stringify({ message: prohibited('EN_CONFIRMATION') });
  assert.ok(ids(scanCopyDocument('messages.json', Buffer.from(text))).includes('EN_CONFIRMATION'));
});

test('a prohibited term in the web manifest is detected', () => {
  const text = JSON.stringify({ description: prohibited('EN_CONFIRMATION') });
  assert.ok(ids(scanCopyDocument('manifest.webmanifest', Buffer.from(text))).includes('EN_CONFIRMATION'));
});

test('a prohibited term in SVG text is detected', () => {
  const text = `<svg><text>${prohibited('EN_CONFIRMATION')}</text></svg>`;
  assert.ok(ids(scanCopyDocument('image.svg', Buffer.from(text))).includes('EN_CONFIRMATION'));
});

test('a prohibited term in subtitle text is detected', () => {
  const text = `WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n${prohibited('EN_CONFIRMATION')}`;
  assert.ok(ids(scanCopyDocument('captions.vtt', Buffer.from(text))).includes('EN_CONFIRMATION'));
});

test('a binary attachment is not decoded as copy', () => {
  assert.deepEqual(scanCopyDocument('image.png', Buffer.from([0xff])), []);
});

test('invalid UTF-8 in copy is rejected', () => {
  assert.ok(ids(scanCopyDocument('index.html', Buffer.from([0xff]))).includes('COPY_UTF8'));
});

test('replacement character in copy is rejected', () => {
  assert.ok(ids(scanCopyDocument('index.html', Buffer.from('\uFFFD'))).includes('COPY_REPLACEMENT'));
});

test('oversized copy cannot bypass inspection', () => {
  assert.ok(ids(scanCopyDocument('index.html', Buffer.alloc(2_097_153, 65))).includes('COPY_TOO_LARGE'));
});

test('a directory with ordinary documents passes', async () => {
  await site({ 'index.html': '<main>UNKNOWN</main>', 'fr/index.html': '<main>Inconnu</main>' }, async (dir) => {
    assert.deepEqual(await scanShippedCopy(dir), []);
  });
});

test('a nested French copy violation is detected', async () => {
  await site({ 'fr/index.html': prohibited('FR_CONFIRMATION') }, async (dir) => {
    assert.ok(ids(await scanShippedCopy(dir)).includes('FR_CONFIRMATION'));
  });
});

test('a nested English copy violation is detected', async () => {
  await site({ 'en/index.html': prohibited('EN_CONFIRMATION') }, async (dir) => {
    assert.ok(ids(await scanShippedCopy(dir)).includes('EN_CONFIRMATION'));
  });
});

test('a symlink in copy files is detected', async () => {
  await site({ 'index.html': '<main>UNKNOWN</main>' }, async (dir) => {
    await symlink(join(dir, 'index.html'), join(dir, 'other.html'));
    assert.ok(ids(await scanShippedCopy(dir)).includes('COPY_SYMLINK'));
  });
});

test('scan order is deterministic across runs', async () => {
  await site({ 'b.html': prohibited('EN_CONFIRMATION'), 'a.html': prohibited('FR_CONFIRMATION') }, async (dir) => {
    assert.deepEqual(await scanShippedCopy(dir), await scanShippedCopy(dir));
  });
});
