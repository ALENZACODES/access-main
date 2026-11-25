import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile, readFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  parsePreflightArgs, runPreflight, formatPreflight, preflightMain,
} from './preflight.mjs';

const SCRIPT = fileURLToPath(new URL('./preflight.mjs', import.meta.url));
const rootCommand = 'npm run test --prefix scripts/release && node scripts/release/check.mjs --dir apps/web/dist && node scripts/release/audit.mjs --dir apps/web/dist && node scripts/release/deep-audit.mjs --dir apps/web/dist && node scripts/release/preflight.mjs --root . --dist apps/web/dist';
const localCommand = 'npm run test && node check.mjs --dir ../../apps/web/dist && node audit.mjs --dir ../../apps/web/dist && node deep-audit.mjs --dir ../../apps/web/dist && node preflight.mjs --root ../.. --dist ../../apps/web/dist';
const workflow = `name: CI
on:
  pull_request:
  push:
    branches: [main]
jobs:
  test:
    steps:
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run build
      - run: npm run verify
`;

async function fixture(action, overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), 'preflight-integration-'));
  const dist = join(root, 'apps/web/dist');
  const files = {
    'package.json': JSON.stringify({ scripts: { verify: rootCommand } }),
    'scripts/release/package.json': JSON.stringify({ scripts: { test: 'node --test *.test.mjs', verify: localCommand } }),
    '.github/workflows/ci.yml': workflow,
    'apps/web/dist/index.html': '<!doctype html><html lang="en"><head><title>the App</title></head><body><main>UNKNOWN</main></body></html>',
    'apps/web/dist/app.js': 'const accessibility = "UNKNOWN";',
    ...overrides,
  };
  try {
    for (const [name, data] of Object.entries(files)) {
      if (data === null) continue;
      const file = join(root, name);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, data);
    }
    return await action(root, dist);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const rules = (result) => [...result.policy.map((item) => item.rule), ...result.bundle.issues.map((item) => item.rule)];

test('argument parser requires both root and dist', () => {
  assert.throws(() => parsePreflightArgs([]), /Both/);
});

test('argument parser refuses only a root', () => {
  assert.throws(() => parsePreflightArgs(['--root', '.']), /Both/);
});

test('argument parser refuses only dist', () => {
  assert.throws(() => parsePreflightArgs(['--dist', '.']), /Both/);
});

test('argument parser rejects unsupported flags', () => {
  assert.throws(() => parsePreflightArgs(['--root', '.', '--dist', '.', '--unknown']), /Unsupported/);
});

test('argument parser rejects duplicate root', () => {
  assert.throws(() => parsePreflightArgs(['--root', '.', '--root', '.', '--dist', '.']), /Duplicate/);
});

test('argument parser rejects duplicate dist', () => {
  assert.throws(() => parsePreflightArgs(['--root', '.', '--dist', '.', '--dist', '.']), /Duplicate/);
});

test('argument parser normalises paths', () => {
  const parsed = parsePreflightArgs(['--root', '.', '--dist', './dist']);
  assert.equal(parsed.root.startsWith('/'), true);
  assert.equal(parsed.dist.startsWith('/'), true);
});

test('preflight succeeds on an internally consistent fixture', async () => {
  await fixture(async (root, dist) => {
    const result = await runPreflight(root, dist);
    assert.equal(result.ok, true);
    assert.deepEqual(result.policy, []);
    assert.deepEqual(result.bundle.issues, []);
  });
});

test('preflight retains the original Unknown sample', async () => {
  await fixture(async (root, dist) => {
    await runPreflight(root, dist);
    assert.match(await readFile(join(dist, 'index.html'), 'utf8'), /UNKNOWN/);
  });
});

test('preflight emits a content-addressed fingerprint', async () => {
  await fixture(async (root, dist) => {
    const result = await runPreflight(root, dist);
    assert.match(formatPreflight(result), /fingerprint [0-9a-f]{64}/);
  });
});

test('preflight results are stable across repeated runs', async () => {
  await fixture(async (root, dist) => {
    assert.deepEqual(await runPreflight(root, dist), await runPreflight(root, dist));
  });
});

test('preflight fails on changed root wiring', async () => {
  await fixture(async (root, dist) => {
    await writeFile(join(root, 'package.json'), JSON.stringify({ scripts: { verify: 'echo skip' } }));
    const result = await runPreflight(root, dist);
    assert.equal(result.ok, false);
    assert.ok(rules(result).includes('VERIFY_GATE_MISSING'));
  });
});

test('preflight fails when CI does not call the release command', async () => {
  await fixture(async (root, dist) => {
    await writeFile(join(root, '.github/workflows/ci.yml'), workflow.replace('npm run verify', 'npm run other'));
    const result = await runPreflight(root, dist);
    assert.equal(result.ok, false);
    assert.ok(rules(result).includes('CI_GATE_MISSING'));
  });
});

test('preflight fails when CI gates run before build', async () => {
  await fixture(async (root, dist) => {
    await writeFile(join(root, '.github/workflows/ci.yml'), workflow.replace('npm run build\n      - run: npm run verify', 'npm run verify\n      - run: npm run build'));
    const result = await runPreflight(root, dist);
    assert.equal(result.ok, false);
    assert.ok(rules(result).includes('CI_GATE_ORDER'));
  });
});

test('preflight fails when an extra workflow schedules work', async () => {
  await fixture(async (root, dist) => {
    await writeFile(join(root, '.github/workflows/nightly.yml'), 'on:\n  schedule:\n    - cron: "0 0 * * *"');
    const result = await runPreflight(root, dist);
    assert.equal(result.ok, false);
    assert.ok(rules(result).includes('CRON_EVENT'));
  });
});

test('preflight fails when the release bundle is empty', async () => {
  await fixture(async (root, dist) => {
    await rm(dist, { recursive: true });
    await mkdir(dist);
    const result = await runPreflight(root, dist);
    assert.equal(result.ok, false);
    assert.ok(rules(result).includes('EMPTY_BUILD'));
  });
});

test('preflight fails when an artifact contains U+FFFD', async () => {
  await fixture(async (root, dist) => {
    await writeFile(join(dist, 'app.js'), 'const text = "\uFFFD";');
    const result = await runPreflight(root, dist);
    assert.equal(result.ok, false);
    assert.ok(rules(result).includes('REPLACEMENT_CHARACTER'));
  });
});

test('preflight fails on malformed UTF-8 artifacts', async () => {
  await fixture(async (root, dist) => {
    await writeFile(join(dist, 'app.js'), Buffer.from([0xff, 0xfe]));
    const result = await runPreflight(root, dist);
    assert.equal(result.ok, false);
    assert.ok(rules(result).includes('INVALID_UTF8'));
  });
});

test('preflight fails on packaged source maps', async () => {
  await fixture(async (root, dist) => {
    await writeFile(join(dist, 'app.js.map'), '{}');
    const result = await runPreflight(root, dist);
    assert.equal(result.ok, false);
    assert.ok(rules(result).includes('SOURCE_MAP'));
  });
});

test('preflight fails on packaged sensitive file names', async () => {
  await fixture(async (root, dist) => {
    await writeFile(join(dist, 'database.sqlite'), 'private');
    const result = await runPreflight(root, dist);
    assert.equal(result.ok, false);
    assert.ok(rules(result).includes('SENSITIVE_FILENAME'));
  });
});

test('preflight fails when an artifact exceeds the total byte budget', async () => {
  await fixture(async (root, dist) => {
    await writeFile(join(dist, 'large.bin'), Buffer.alloc(4_718_593));
    const result = await runPreflight(root, dist);
    assert.equal(result.ok, false);
    assert.ok(rules(result).includes('BUDGET_TOTALBYTES'));
  });
});

test('preflight refuses a symlink within the production build', async () => {
  await fixture(async (root, dist) => {
    await symlink(join(dist, 'index.html'), join(dist, 'alias.html'));
    const result = await runPreflight(root, dist);
    assert.equal(result.ok, false);
    assert.ok(rules(result).includes('SYMLINK'));
  });
});

test('preflight reports multiple independent failures together', async () => {
  await fixture(async (root, dist) => {
    await writeFile(join(root, 'package.json'), JSON.stringify({ scripts: {} }));
    await writeFile(join(dist, 'app.js'), Buffer.from([0xff]));
    const result = await runPreflight(root, dist);
    assert.equal(result.ok, false);
    assert.ok(rules(result).includes('VERIFY_MISSING'));
    assert.ok(rules(result).includes('INVALID_UTF8'));
  });
});

test('preflight output includes a stable rule identifier', async () => {
  await fixture(async (root, dist) => {
    await writeFile(join(dist, 'app.js'), Buffer.from([0xff]));
    const output = formatPreflight(await runPreflight(root, dist));
    assert.match(output, /app\.js: INVALID_UTF8:/);
  });
});

test('preflightMain returns zero on a passing fixture', async () => {
  await fixture(async (root, dist) => {
    const original = console.log;
    console.log = () => {};
    try { assert.equal(await preflightMain(['--root', root, '--dist', dist]), 0); }
    finally { console.log = original; }
  });
});

test('preflightMain returns nonzero on a failed fixture', async () => {
  await fixture(async (root, dist) => {
    await writeFile(join(dist, 'app.js'), Buffer.from([0xff]));
    const original = console.error;
    console.error = () => {};
    try { assert.equal(await preflightMain(['--root', root, '--dist', dist]), 1); }
    finally { console.error = original; }
  });
});

test('preflightMain catches argument errors rather than throwing', async () => {
  const original = console.error;
  console.error = () => {};
  try { assert.equal(await preflightMain(['--unsupported']), 1); }
  finally { console.error = original; }
});

test('preflight executable succeeds in its own process', async () => {
  await fixture(async (root, dist) => {
    const result = spawnSync(process.execPath, [SCRIPT, '--root', root, '--dist', dist], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /fingerprint/);
  });
});

test('preflight executable fails in its own process', async () => {
  await fixture(async (root, dist) => {
    await writeFile(join(dist, 'app.js'), Buffer.from([0xff]));
    const result = spawnSync(process.execPath, [SCRIPT, '--root', root, '--dist', dist], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /INVALID_UTF8/);
  });
});

test('preflight executable rejects absent arguments', () => {
  const result = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Both --root and --dist/);
});

test('preflight scans the exact directory it is given', async () => {
  await fixture(async (root, dist) => {
    const other = join(root, 'alternate');
    await mkdir(other);
    await writeFile(join(other, 'index.html'), 'UNKNOWN');
    const result = await runPreflight(root, other);
    assert.equal(result.ok, true);
    assert.equal(result.bundle.counts.files, 1);
    assert.equal(result.bundle.entries[0].path, 'index.html');
    assert.equal((await runPreflight(root, dist)).bundle.counts.files, 2);
  });
});

test('preflight does not write metadata to the source build', async () => {
  await fixture(async (root, dist) => {
    const before = await readFile(join(dist, 'index.html'));
    await runPreflight(root, dist);
    assert.deepEqual(await readFile(join(dist, 'index.html')), before);
  });
});

test('preflight preserves an explicitly negative accessibility string', async () => {
  await fixture(async (root, dist) => {
    await writeFile(join(dist, 'app.js'), 'const status = "NO";');
    const result = await runPreflight(root, dist);
    assert.equal(result.ok, true);
    assert.match(await readFile(join(dist, 'app.js'), 'utf8'), /"NO"/);
  });
});

test('preflight preserves an explicitly unknown accessibility string', async () => {
  await fixture(async (root, dist) => {
    await writeFile(join(dist, 'app.js'), 'const status = "UNKNOWN";');
    const result = await runPreflight(root, dist);
    assert.equal(result.ok, true);
    assert.match(await readFile(join(dist, 'app.js'), 'utf8'), /"UNKNOWN"/);
  });
});
