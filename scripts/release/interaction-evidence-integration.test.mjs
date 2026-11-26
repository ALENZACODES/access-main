import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { example, validate, analyze, queue, render } from './interaction-evidence-index.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'));
test('explicit audit command invokes the included CLI', () => {
  assert.equal(pkg.scripts['audit:interaction-evidence'], 'node --experimental-strip-types interaction-evidence-cli.mjs');
});
test('all existing release audit commands are preserved', () => {
  for (const id of ['custody', 'conflicts', 'recovery-traces', 'ui-snapshots', 'input-continuity', 'evidence-review', 'update-rehearsal', 'review-ledger']) {
    assert.ok(pkg.scripts[`audit:${id}`], id);
  }
});
test('integration runs only through the existing manual command', () => {
  assert.doesNotMatch(JSON.stringify(pkg.scripts), /schedule|cron|keep-awake|setInterval/);
});
test('release test entry includes node test files automatically', () => {
  assert.match(pkg.scripts.test, /\*\.test\.mjs/);
});
test('the index exports the exact parser contract', () => {
  assert.equal(validate(example()).ok, true);
});
test('the index exports the explicit review queue', () => {
  assert.equal(queue(example()).ok, true);
});
test('the index exports the grounded analysis', () => {
  assert.equal(analyze(example()).value.checkCount, 1);
});
test('the index exports the bilingual report renderer', () => {
  assert.match(render(example(), { language: 'fr' }).text, /lang="fr"/);
});
test('the index cannot infer an accessible place from its fictional fixture', () => {
  assert.match(render(example(), { format: 'text' }).text, /UNKNOWN/);
});
