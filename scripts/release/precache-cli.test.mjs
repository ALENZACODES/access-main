import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import { URL } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CLI_ACTIONS, parseArgs, runPrecacheCli } from './precache-cli.mjs';
import * as exported from './precache-index.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const good = () => ({
  version: 1, releaseId: 'release', retrievedOn: '2026-11-19',
  assets: [{
    id: 'sample', path: 'assets/sample.txt', kind: 'data', group: 'offline-pack',
    locale: 'neutral', state: 'UNKNOWN', bytes: 6, sha256: hash('sample'),
    source: 'https://example.org/reference', licence: 'CC0-1.0',
    retrievedOn: '2026-11-19', tier: 0, dependsOn: [],
    label: { en: 'Synthetic file', fr: 'Fichier fictif' },
  }],
});
const codes = result => result.errors.map(item => item.code);
function fakeIo() {
  const out = [];
  const err = [];
  return {
    out, err,
    stdout: { write: value => { out.push(value); return true; } },
    stderr: { write: value => { err.push(value); return true; } },
  };
}
async function temporary(callback) {
  const root = await mkdtemp(join(tmpdir(), 'precache-cli-'));
  try {
    await mkdir(join(root, 'assets'));
    await writeFile(join(root, 'assets', 'sample.txt'), 'sample');
    await writeFile(join(root, 'release.json'), JSON.stringify(good()));
    await writeFile(join(root, 'previous.json'), JSON.stringify(good()));
    return await callback(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}

test('CLI action list is explicit', () => {
  assert.deepEqual(CLI_ACTIONS, ['inspect', 'scan', 'compare']);
});
test('bare CLI args open help without reading files', () => {
  const result = parseArgs([]);
  assert.equal(result.ok, true);
  assert.equal(result.help, true);
});
test('--help opens help', () => {
  assert.equal(parseArgs(['--help']).help, true);
});
test('unknown action is rejected', () => {
  assert.ok(codes(parseArgs(['publish', '--manifest', 'x'])).includes('ACTION'));
});
test('inspect requires manifest', () => {
  assert.ok(codes(parseArgs(['inspect'])).includes('REQUIRED_FLAG'));
});
test('scan requires root', () => {
  assert.ok(codes(parseArgs(['scan', '--manifest', 'x', '--format', 'json'])).includes('REQUIRED_FLAG'));
});
test('compare requires previous file', () => {
  assert.ok(codes(parseArgs(['compare', '--manifest', 'x'])).includes('REQUIRED_FLAG'));
});
test('unsupported flag is rejected', () => {
  assert.ok(codes(parseArgs(['inspect', '--manifest', 'x', '--network', 'yes'])).includes('ARGUMENT'));
});
test('flag without a value is rejected', () => {
  assert.ok(codes(parseArgs(['inspect', '--manifest'])).includes('ARGUMENT'));
});
test('duplicate file flag is rejected', () => {
  assert.ok(codes(parseArgs(['inspect', '--manifest', 'x', '--manifest', 'y'])).includes('DUPLICATE_FLAG'));
});
test('format must be one of supported formats', () => {
  assert.ok(codes(parseArgs(['inspect', '--manifest', 'x', '--format', 'pdf'])).includes('OUTPUT_CHOICE'));
});
test('lang must be English or French', () => {
  assert.ok(codes(parseArgs(['inspect', '--manifest', 'x', '--lang', 'es'])).includes('OUTPUT_CHOICE'));
});
test('today requires an ISO day form', () => {
  assert.ok(codes(parseArgs(['inspect', '--manifest', 'x', '--today', 'yesterday'])).includes('TODAY_DATE'));
});
test('scan requires JSON output format', () => {
  assert.ok(codes(parseArgs(['scan', '--manifest', 'x', '--root', '.'])).includes('SCAN_JSON_REQUIRED'));
});
test('inspect accepts text format by default', () => {
  const result = parseArgs(['inspect', '--manifest', 'x']);
  assert.equal(result.ok, true);
  assert.equal(result.args.format, 'text');
});
test('inspect accepts French format', () => {
  const result = parseArgs(['inspect', '--manifest', 'x', '--lang', 'fr']);
  assert.equal(result.ok, true);
  assert.equal(result.args.lang, 'fr');
});
test('scan accepts JSON option', () => {
  const result = parseArgs(['scan', '--manifest', 'x', '--root', '.', '--format', 'json']);
  assert.equal(result.ok, true);
});
test('compare accepts both filenames', () => {
  const result = parseArgs(['compare', '--previous', 'a', '--manifest', 'b']);
  assert.equal(result.ok, true);
  assert.equal(result.args.previous, 'a');
});
test('manual help returns zero', async () => {
  const io = fakeIo();
  assert.equal(await runPrecacheCli(['--help'], io), 0);
  assert.ok(io.out.join('').includes('Offline release precache review'));
});
test('invalid action returns failure', async () => {
  const io = fakeIo();
  assert.equal(await runPrecacheCli(['upload', '--manifest', 'x'], io), 2);
  assert.ok(io.err.join('').includes('ACTION'));
});
test('missing input file returns failure', async () => {
  const io = fakeIo();
  assert.equal(await runPrecacheCli(['inspect', '--manifest', '/missing/file.json'], io), 2);
  assert.ok(io.err.join('').includes('INPUT_READ'));
});
test('inspect prints English report', () => temporary(async root => {
  const io = fakeIo();
  const code = await runPrecacheCli(['inspect', '--manifest', join(root, 'release.json')], io);
  assert.equal(code, 0);
  assert.ok(io.out.join('').includes('Offline release asset review'));
}));
test('inspect prints French report', () => temporary(async root => {
  const io = fakeIo();
  const code = await runPrecacheCli(['inspect', '--manifest', join(root, 'release.json'), '--lang', 'fr'], io);
  assert.equal(code, 0);
  assert.ok(io.out.join('').includes('Examen des fichiers de publication hors ligne'));
}));
test('inspect can print CSV with localized headers', () => temporary(async root => {
  const io = fakeIo();
  const code = await runPrecacheCli(['inspect', '--manifest', join(root, 'release.json'), '--lang', 'fr', '--format', 'csv'], io);
  assert.equal(code, 0);
  assert.ok(io.out.join('').startsWith('"Fichier","Chemin du fichier"'));
}));
test('inspect prints structured JSON with UNKNOWN', () => temporary(async root => {
  const io = fakeIo();
  const code = await runPrecacheCli(['inspect', '--manifest', join(root, 'release.json'), '--format', 'json'], io);
  assert.equal(code, 0);
  assert.equal(JSON.parse(io.out.join('')).state, 'UNKNOWN');
}));
test('inspect writes a new output file', () => temporary(async root => {
  const io = fakeIo();
  const path = join(root, 'out.txt');
  const code = await runPrecacheCli(['inspect', '--manifest', join(root, 'release.json'), '--output', path], io);
  assert.equal(code, 0);
  assert.ok((await readFile(path, 'utf8')).includes('Offline release asset review'));
  assert.deepEqual(io.out, []);
}));
test('CLI never overwrites an existing report', () => temporary(async root => {
  const io = fakeIo();
  const path = join(root, 'out.txt');
  await writeFile(path, 'leave intact');
  const code = await runPrecacheCli(['inspect', '--manifest', join(root, 'release.json'), '--output', path], io);
  assert.equal(code, 2);
  assert.equal(await readFile(path, 'utf8'), 'leave intact');
}));
test('compare prints no changes for identical release', () => temporary(async root => {
  const io = fakeIo();
  const code = await runPrecacheCli(['compare', '--previous', join(root, 'previous.json'), '--manifest', join(root, 'release.json')], io);
  assert.equal(code, 0);
  assert.ok(io.out.join('').includes('No records.'));
}));
test('compare prints JSON change summary', () => temporary(async root => {
  const after = good();
  after.assets[0].state = 'MISSING';
  await writeFile(join(root, 'release.json'), JSON.stringify(after));
  const io = fakeIo();
  const code = await runPrecacheCli(['compare', '--previous', join(root, 'previous.json'), '--manifest', join(root, 'release.json'), '--format', 'json'], io);
  assert.equal(code, 0);
  assert.equal(JSON.parse(io.out.join('')).changes[0].kind, 'state-changed');
}));
test('compare missing previous input fails', () => temporary(async root => {
  const io = fakeIo();
  const code = await runPrecacheCli(['compare', '--previous', join(root, 'missing.json'), '--manifest', join(root, 'release.json')], io);
  assert.equal(code, 2);
  assert.ok(io.err.join('').includes('INPUT_READ'));
}));
test('scan succeeds when assets match manifest', () => temporary(async root => {
  const io = fakeIo();
  const code = await runPrecacheCli(['scan', '--manifest', join(root, 'release.json'), '--root', root, '--format', 'json'], io);
  assert.equal(code, 0);
  const result = JSON.parse(io.out.join(''));
  assert.equal(result.summary.present, 1);
}));
test('scan fails closed for changed bytes', () => temporary(async root => {
  await writeFile(join(root, 'assets/sample.txt'), 'changed');
  const io = fakeIo();
  const code = await runPrecacheCli(['scan', '--manifest', join(root, 'release.json'), '--root', root, '--format', 'json'], io);
  assert.equal(code, 2);
  assert.ok(io.err.join('').includes('FILE_CHANGED'));
}));
test('invalid manifest metadata cannot create output file', () => temporary(async root => {
  const bad = good();
  bad.assets[0].tier = 'UNKNOWN';
  await writeFile(join(root, 'release.json'), JSON.stringify(bad));
  const io = fakeIo();
  const output = join(root, 'out.txt');
  const code = await runPrecacheCli(['inspect', '--manifest', join(root, 'release.json'), '--output', output], io);
  assert.equal(code, 2);
  assert.equal(await readFile(output).catch(() => null), null);
}));
test('invalid source URL cannot generate review report', () => temporary(async root => {
  const bad = good();
  bad.assets[0].source = 'file:///private';
  await writeFile(join(root, 'release.json'), JSON.stringify(bad));
  const io = fakeIo();
  assert.equal(await runPrecacheCli(['inspect', '--manifest', join(root, 'release.json')], io), 2);
  assert.ok(io.err.join('').includes('ASSET_SOURCE'));
}));
test('caller date enforces retrieval chronology', () => temporary(async root => {
  const io = fakeIo();
  const code = await runPrecacheCli(['inspect', '--manifest', join(root, 'release.json'), '--today', '2026-11-18'], io);
  assert.equal(code, 2);
  assert.ok(io.err.join('').includes('ASSET_DATE'));
}));
test('direct module execution offers help without filesystem writes', () => {
  const path = new URL('./precache-cli.mjs', import.meta.url).pathname;
  const result = spawnSync(process.execPath, [path, '--help'], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.ok(result.stdout.includes('Usage:'));
});
test('barrel exposes contract validator', () => {
  assert.equal(typeof exported.inspectPrecache, 'function');
  assert.equal(typeof exported.safeAssetPath, 'function');
});
test('barrel exposes file scanner', () => {
  assert.equal(typeof exported.auditFiles, 'function');
});
test('barrel exposes diff and impact', () => {
  assert.equal(typeof exported.comparePrecache, 'function');
  assert.equal(typeof exported.releaseImpact, 'function');
});
test('barrel exposes bilingual reports', () => {
  assert.equal(typeof exported.renderReport, 'function');
  assert.equal(typeof exported.changeReport, 'function');
});
test('barrel exposes manual CLI mount', () => {
  assert.equal(typeof exported.runPrecacheCli, 'function');
});

test('manifest symbolic link is rejected without following it', () => temporary(async root => {
  await symlink('release.json', join(root, 'linked.json'));
  const io = fakeIo();
  const code = await runPrecacheCli(['inspect', '--manifest', join(root, 'linked.json')], io);
  assert.equal(code, 2);
  assert.ok(io.err.join('').includes('INPUT_FILE'));
}));
test('a directory cannot be read as a manifest', () => temporary(async root => {
  const io = fakeIo();
  const code = await runPrecacheCli(['inspect', '--manifest', join(root, 'assets')], io);
  assert.equal(code, 2);
  assert.ok(io.err.join('').includes('INPUT_FILE'));
}));
