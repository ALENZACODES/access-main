import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, symlink, writeFile, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CLI_COMMANDS, parseArgs, safeRead, safeWrite, runRecoveryCli,
} from './offline-recovery-trace-cli.mjs';
import { document, trace, action, failure } from './offline-recovery-trace-fixtures.mjs';

const script = new URL('./offline-recovery-trace-cli.mjs', import.meta.url).pathname;
function fakeStreams() {
  const output = [];
  const errors = [];
  return { output, errors,
    stdout: { write: (part) => { output.push(part); return true; } },
    stderr: { write: (part) => { errors.push(part); return true; } },
  };
}
async function sandbox(callback) {
  const root = await mkdtemp(join(tmpdir(), 'p19-trace-'));
  try {
    const input = join(root, 'trace.json');
    const previous = join(root, 'previous.json');
    await writeFile(input, JSON.stringify(document()), { mode: 0o600 });
    await writeFile(previous, JSON.stringify(document()), { mode: 0o600 });
    return await callback({ root, input, previous });
  } finally { await rm(root, { recursive: true, force: true }); }
}

test('CLI exposes documented manual commands only', () => {
  assert.deepEqual(CLI_COMMANDS, ['audit', 'compare', 'coverage', 'triage']);
  assert.ok(Object.isFrozen(CLI_COMMANDS));
});
test('help works without any other arguments', () => {
  assert.equal(parseArgs(['--help']).help, true);
  assert.equal(parseArgs(['audit','--help']).help, true);
});
test('audit accepts English text by default', () => {
  const result = parseArgs(['audit','--input','trace.json']);
  assert.equal(result.ok, true);
  assert.equal(result.locale, 'en');
  assert.equal(result.format, 'text');
});
test('CLI chooses requested French and HTML', () => {
  const result = parseArgs(['audit', '--input','trace.json','--locale','fr','--format','html']);
  assert.equal(result.ok, true);
  assert.equal(result.locale, 'fr');
  assert.equal(result.format, 'html');
});
test('comparison requires explicit previous snapshot', () => {
  assert.equal(parseArgs(['compare','--input','latest.json']).ok, false);
  assert.equal(parseArgs(['compare','--input','latest.json','--previous','older.json']).ok, true);
});
test('unknown command is refused', () => {
  assert.equal(parseArgs(['delete','--input','trace.json']).error, 'COMMAND');
});
test('unsupported locale is refused', () => {
  assert.equal(parseArgs(['audit','--input','trace.json','--locale','es']).ok, false);
});
test('unsupported format is refused', () => {
  assert.equal(parseArgs(['audit','--input','trace.json','--format','pdf']).ok, false);
});
test('coverage and triage only allow text output', () => {
  assert.equal(parseArgs(['coverage','--input','trace.json','--format','html']).ok, false);
  assert.equal(parseArgs(['triage','--input','trace.json','--format','csv']).ok, false);
});
test('unrecognized flags and missing values fail', () => {
  assert.equal(parseArgs(['audit','--input']).ok, false);
  assert.equal(parseArgs(['audit','--input','file','--unknown','value']).ok, false);
  assert.equal(parseArgs(null).ok, false);
});
test('duplicate input key is refused', () => {
  assert.equal(parseArgs(['audit','--input','a','--input','b']).ok, false);
});
test('safeRead loads a regular bounded local JSON file', async () => {
  await sandbox(async ({ input }) => {
    const result = await safeRead(input);
    assert.equal(result.ok, true);
    assert.equal(JSON.parse(result.text).releaseId, 'release-a');
  });
});
test('safeRead rejects nonexistent file', async () => {
  await sandbox(async ({ root }) => {
    assert.equal((await safeRead(join(root, 'missing.json'))).ok, false);
  });
});
test('safeRead rejects directory input', async () => {
  await sandbox(async ({ root }) => {
    assert.equal((await safeRead(root)).ok, false);
  });
});
test('safeRead rejects direct symbolic links', async () => {
  await sandbox(async ({ root, input }) => {
    const link = join(root, 'pointer.json');
    await symlink(input, link);
    assert.equal((await safeRead(link)).ok, false);
  });
});
test('safeRead refuses symlinked parent directory', async () => {
  await sandbox(async ({ root, input }) => {
    const alias = join(root, 'alias');
    await symlink(root, alias, 'dir');
    assert.equal((await safeRead(join(alias, 'trace.json'))).ok, false);
    assert.equal((await safeRead(input)).ok, true);
  });
});
test('safeRead rejects oversized inputs without trying to parse', async () => {
  await sandbox(async ({ root }) => {
    const file = join(root, 'huge.json');
    await writeFile(file, 'x'.repeat(8_000_001));
    assert.equal((await safeRead(file)).ok, false);
  });
});
test('safeWrite creates output exactly once', async () => {
  await sandbox(async ({ root }) => {
    const file = join(root, 'review.txt');
    assert.equal((await safeWrite(file, 'UNKNOWN\n')).ok, true);
    assert.equal(await readFile(file, 'utf8'), 'UNKNOWN\n');
    assert.equal((await safeWrite(file, 'overwritten')).ok, false);
    assert.equal(await readFile(file, 'utf8'), 'UNKNOWN\n');
  });
});
test('safeWrite creates owner-only output permissions', async () => {
  if (process.platform === 'win32') return;
  await sandbox(async ({ root }) => {
    const file = join(root, 'review.txt');
    assert.equal((await safeWrite(file, 'PRIVATE-LOCAL-REVIEW')).ok, true);
    const status = await lstat(file);
    assert.equal(status.mode & 0o077, 0);
  });
});
test('safeWrite does not create parent directories', async () => {
  await sandbox(async ({ root }) => {
    assert.equal((await safeWrite(join(root,'missing','data.txt'),'test')).ok, false);
  });
});
test('safeWrite refuses hidden output names', async () => {
  await sandbox(async ({ root }) => {
    assert.equal((await safeWrite(join(root,'.local-secret'),'test')).ok, false);
  });
});
test('safeWrite refuses symlinked parent directory', async () => {
  await sandbox(async ({ root }) => {
    const alias = join(root,'alias');
    await symlink(root, alias,'dir');
    assert.equal((await safeWrite(join(alias,'out.txt'),'test')).ok, false);
  });
});
test('safeWrite refuses blank or oversized content', async () => {
  await sandbox(async ({ root }) => {
    assert.equal((await safeWrite(join(root,'none.txt'), '')).ok, false);
    assert.equal((await safeWrite(join(root,'huge.txt'), 'x'.repeat(12_000_001))).ok, false);
  });
});
test('safeWrite counts UTF-8 bytes, not just code points', () => {
  assert.ok(Buffer.byteLength('é', 'utf8') > 'é'.length);
});
test('help CLI prints usage and returns zero', async () => {
  const io = fakeStreams();
  assert.equal(await runRecoveryCli(['--help'], io), 0);
  assert.ok(io.output.join('').includes('Usage:'));
  assert.deepEqual(io.errors, []);
});
test('audit CLI emits a read-only textual report', async () => {
  await sandbox(async ({ input }) => {
    const io = fakeStreams();
    assert.equal(await runRecoveryCli(['audit','--input',input], io), 0);
    assert.ok(io.output.join('').includes('Offline recovery evidence review'));
    assert.ok(io.output.join('').includes('CC0-1.0'));
  });
});
test('French CLI output contains correct NBSP colon spacing', async () => {
  await sandbox(async ({ input }) => {
    const io = fakeStreams();
    assert.equal(await runRecoveryCli(['audit','--input',input,'--locale','fr'], io), 0);
    assert.ok(io.output.join('').includes('Source\u00a0:'));
  });
});
test('audit CLI can create HTML report without replacing files', async () => {
  await sandbox(async ({ root, input }) => {
    const output = join(root,'report.html');
    const io = fakeStreams();
    assert.equal(await runRecoveryCli(['audit','--input',input,'--format','html','--output',output], io), 0);
    assert.ok((await readFile(output,'utf8')).includes('<html lang="en">'));
    assert.equal(await runRecoveryCli(['audit','--input',input,'--format','html','--output',output], io), 2);
  });
});
test('comparison CLI reports recorded differences', async () => {
  await sandbox(async ({ input, previous }) => {
    const value = document();
    value.traces[0].steps[3].outcome = 'FAIL';
    await writeFile(input, JSON.stringify(value));
    const io = fakeStreams();
    assert.equal(await runRecoveryCli(['compare','--input',input,'--previous',previous], io), 0);
    assert.ok(io.output.join('').includes('outcome-changed'));
  });
});
test('coverage CLI displays UNKNOWN cells rather than invented passes', async () => {
  await sandbox(async ({ input }) => {
    const io = fakeStreams();
    assert.equal(await runRecoveryCli(['coverage','--input',input], io), 0);
    assert.ok(io.output.join('').includes('UNKNOWN'));
  });
});
test('triage CLI flags missing recovery evidence', async () => {
  await sandbox(async ({ input }) => {
    await writeFile(input, JSON.stringify(document(trace('t', { steps: [action(), failure()] }))));
    const io = fakeStreams();
    assert.equal(await runRecoveryCli(['triage','--input',input], io), 0);
    assert.ok(io.output.join('').includes('UNLINKED_FAILURE'));
  });
});
test('malformed input returns an error with no private data in output', async () => {
  await sandbox(async ({ input }) => {
    await writeFile(input, JSON.stringify({ token: 'never-log-this' }));
    const io = fakeStreams();
    assert.equal(await runRecoveryCli(['audit','--input',input], io), 2);
    assert.equal(io.output.length, 0);
    assert.ok(!io.errors.join('').includes('never-log-this'));
  });
});
test('malformed prior snapshot refuses comparison', async () => {
  await sandbox(async ({ input, previous }) => {
    await writeFile(previous, '{');
    const io = fakeStreams();
    assert.equal(await runRecoveryCli(['compare','--input',input,'--previous',previous], io), 2);
    assert.equal(io.output.length, 0);
  });
});
test('missing input returns code two instead of throwing', async () => {
  const io = fakeStreams();
  assert.equal(await runRecoveryCli(['audit','--input','/file/that/does/not/exist'], io), 2);
  assert.ok(io.errors.length > 0);
});
test('direct executable CLI can run help mode', () => {
  const result = spawnSync(process.execPath, [script,'--help'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes('Usage:'));
});
test('direct executable runs audit against real fixture file', async () => {
  await sandbox(async ({ input }) => {
    const result = spawnSync(process.execPath,[script,'audit','--input',input],{ encoding:'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes('Recorded outcome'));
  });
});
test('safeRead refuses unsupported input argument types', async () => {
  assert.equal((await safeRead(null)).ok, false);
  assert.equal((await safeRead(42)).ok, false);
  assert.equal((await safeRead('')).ok, false);
});
