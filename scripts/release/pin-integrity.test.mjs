import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));

test('the organisation-name detector imports its shared source without local reconstruction', async () => {
  const script = await readFile(resolve(root, 'scripts/release/check.mjs'), 'utf8');
  assert.match(script, /import\s*\{\s*forbiddenOrgNeedles\s*\}\s*from/);
  assert.match(script, /forbiddenOrgNeedles\(\)/);
  assert.doesNotMatch(script, /String\.fromCharCode|fromCodes\s*\(/);
});
