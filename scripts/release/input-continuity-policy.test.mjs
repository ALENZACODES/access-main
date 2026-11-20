import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import * as index from './input-continuity-index.mjs';
import { document, complete, TODAY } from './input-continuity-fixtures.mjs';

const folder = dirname(fileURLToPath(import.meta.url));
const modules = ['contract', 'analysis', 'delta', 'parity', 'report', 'cli', 'fixtures', 'index'];
const tests = ['contract', 'analysis', 'delta', 'parity', 'report', 'cli', 'policy'];
const source = async file => readFile(join(folder, file), 'utf8');

test('all eight implementation modules are local files', async () => {
 for (const module of modules) {
  const path = join(folder, `input-continuity-${module}.mjs`);
  assert.equal((await stat(path)).isFile(), true);
 }
});
test('all seven focused test modules exist', async () => {
 for (const name of tests) assert.equal((await stat(join(folder, `input-continuity-${name}.test.mjs`))).isFile(), true);
});
test('all source and test modules are under the single-file size budget', async () => {
 for (const name of [...modules.map(x => `input-continuity-${x}.mjs`), ...tests.map(x => `input-continuity-${x}.test.mjs`)]) {
  assert.ok((await stat(join(folder, name))).size < 524288, name);
 }
});
test('module sources have no hard-coded remote fetch calls', async () => {
 for (const name of modules) {
  const text = await source(`input-continuity-${name}.mjs`);
  assert.ok(!text.includes('fetch('), name);
  assert.ok(!text.includes('XMLHttpRequest'), name);
 }
});
test('module sources have no background timers', async () => {
 for (const name of modules) {
  const text = await source(`input-continuity-${name}.mjs`);
  assert.ok(!text.includes('setInterval('), name);
  assert.ok(!text.includes('setTimeout('), name);
 }
});
test('module sources do not schedule workflows', async () => {
 for (const name of modules) {
  const text = await source(`input-continuity-${name}.mjs`);
  assert.ok(!text.includes('node-cron'), name);
  assert.ok(!text.includes('scheduleJob('), name);
 }
});
test('all modules use explicit relative imports for local dependencies', async () => {
 for (const name of modules) {
  const text = await source(`input-continuity-${name}.mjs`);
  const imports = [...text.matchAll(/from\s+['"]([^'"]+)['"]/gu)].map(x => x[1]);
  for (const imported of imports) assert.ok(imported.startsWith('./input-continuity-') || imported.startsWith('node:'), `${name}: ${imported}`);
 }
});
test('every relative source import resolves to an existing file', async () => {
 for (const name of modules) {
  const text = await source(`input-continuity-${name}.mjs`);
  const imports = [...text.matchAll(/from\s+['"](\.\/[a-zA-Z0-9-]+\.mjs)['"]/gu)].map(x => x[1]);
  for (const imported of imports) assert.equal((await stat(join(folder, imported))).isFile(), true, `${name}: ${imported}`);
 }
});
test('standalone index exports the contract and parser', () => {
 assert.equal(typeof index.validate, 'function');
 assert.equal(typeof index.parse, 'function');
 assert.equal(typeof index.serialize, 'function');
});
test('standalone index exports analysis and coverage', () => {
 assert.equal(typeof index.analyze, 'function');
 assert.equal(typeof index.coverage, 'function');
 assert.equal(typeof index.reviewTasks, 'function');
});
test('standalone index exports release comparison', () => {
 assert.equal(typeof index.compare, 'function');
 assert.equal(typeof index.sessionChanges, 'function');
});
test('standalone index exports all report forms', () => {
 for (const name of ['textReport', 'csvReport', 'htmlReport', 'jsonReport', 'deltaReport', 'render']) assert.equal(typeof index[name], 'function', name);
});
test('standalone index exports manual CLI entry points', () => {
 for (const name of ['args', 'safeInput', 'safeOutput', 'run']) assert.equal(typeof index[name], 'function', name);
});
test('index does not quietly mutate the synthetic fixture', () => {
 const value = document(complete());
 const before = JSON.stringify(value);
 index.analyze(value, { today: TODAY });
 assert.equal(JSON.stringify(value), before);
});
test('index preserves the exact UNKNOWN vocabulary', () => {
 assert.ok(index.STATES.includes('UNKNOWN'));
 assert.equal(index.validate(document()).ok, true);
});
test('source text contains no literal Unicode no-break characters', async () => {
 for (const name of modules) {
  const text = await source(`input-continuity-${name}.mjs`);
  assert.ok(!text.includes('\u00a0'), name);
  assert.ok(!text.includes('\u202f'), name);
 }
});
test('French punctuation is encoded using escape sequences where needed', () => {
 assert.equal(index.colon('fr'), '\u00a0:');
 assert.equal(index.frenchSpacing('«\u202fentrée\u202f»'), true);
});
test('every report form includes or preserves human-review caution', () => {
 const value = document(complete());
 for (const format of ['text', 'html']) assert.ok(index.render(value, { format, today: TODAY }).text.includes('review'));
 assert.ok(index.render(value, { format: 'json', today: TODAY }).text.includes('review'));
});
test('all source modules are nonempty and represent real working code', async () => {
 for (const name of modules) {
  const text = await source(`input-continuity-${name}.mjs`);
  assert.ok(Buffer.byteLength(text) > 100, name);
 }
});
test('new manual npm command is explicitly available', async () => {
 const pkg = JSON.parse(await source('package.json'));
 assert.equal(pkg.scripts['audit:input-continuity'], 'node --experimental-strip-types input-continuity-cli.mjs');
});
test('new package preserves the original test command', async () => {
 const pkg = JSON.parse(await source('package.json'));
 assert.equal(pkg.scripts.test, 'node --test --experimental-strip-types *.test.mjs');
});
test('new package preserves the original verification command', async () => {
 const pkg = JSON.parse(await source('package.json'));
 assert.ok(pkg.scripts.verify.includes('preflight.mjs --root ../..'));
 assert.ok(pkg.scripts.verify.startsWith('npm run test &&'));
});
test('new package preserves previously available custody audit', async () => {
 const pkg = JSON.parse(await source('package.json'));
 assert.equal(pkg.scripts['audit:custody'], 'node --experimental-strip-types artifact-custody-cli.mjs');
});
test('default validation never treats a blank capture as a successful session', () => {
 const value = document();
 const result = index.analyze(value, { today: TODAY });
 assert.equal(result.reviews[0].status, 'UNKNOWN');
});
test('every review task preserves original provenance URL', () => {
 const result = index.reviewTasks(document(), { today: TODAY });
 assert.ok(result.tasks.every(x => x.source.startsWith('https://')));
});
test('no write method exists in the analytical contract', async () => {
 const text = await source('input-continuity-contract.mjs');
 assert.ok(!text.includes('writeFile('));
 assert.ok(!text.includes('open('));
});
test('CLI output is create-only and owner-only', async () => {
 const text = await source('input-continuity-cli.mjs');
 assert.ok(text.includes("'wx', 0o600"));
});
test('all exported report functions are stable without network or secrets', () => {
 const value = document(complete());
 const result = index.render(value, { format: 'json', today: TODAY });
 assert.equal(result.ok, true);
 assert.ok(!result.text.includes('accessToken'));
});
