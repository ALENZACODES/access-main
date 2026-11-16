import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));

async function packages(filename) {
  const input = JSON.parse(await readFile(resolve(root, filename), 'utf8'));
  assert.equal(input.version, 1);
  assert.ok(Array.isArray(input.packages));
  return input.packages;
}

test('all tool and help packages are pinned to published complete commits', async () => {
  const locks = await Promise.all([packages('lanes.lock.json'), packages('lanes.hub.json')]);
  const selected = locks.flat().filter((entry) => /access-(?:tools|help)$/.test(entry.repo));
  assert.ok(selected.length >= 10);
  for (const entry of selected) {
    assert.match(entry.commit, /^[a-f\d]{40}$/);
  }
  for (const repository of new Set(selected.map(({ repo }) => repo))) {
    const unique = new Set(selected.filter(({ repo }) => repo === repository).map(({ commit }) => commit));
    assert.equal(unique.size, 1, `${repository} must use the same commit for all its packages`);
  }
});

test('the build runs the strict copied-source pass after both sync steps', async () => {
  const config = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  for (const script of ['build', 'pretest', 'pretypecheck']) {
    const command = config.scripts[script];
    assert.ok(command.indexOf('npm run lanes:ensure') !== -1, script);
    assert.ok(command.indexOf('npm run hub:sync') !== -1, script);
    assert.ok(command.indexOf('scripts/release/prepare-copy.mjs') !== -1, script);
    assert.ok(command.indexOf('scripts/release/prepare-copy.mjs') > command.indexOf('npm run hub:sync'), script);
  }
  assert.ok(config.scripts.verify.includes('scripts/release/check.mjs'));
});

test('the organisation-name detector imports its shared source without local reconstruction', async () => {
  const script = await readFile(resolve(root, 'scripts/release/check.mjs'), 'utf8');
  assert.match(script, /import\s*\{\s*forbiddenOrgNeedles\s*\}\s*from/);
  assert.match(script, /forbiddenOrgNeedles\(\)/);
  assert.doesNotMatch(script, /String\.fromCharCode|fromCodes\s*\(/);
});
