import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { forbiddenOrgNeedles } from '../../packages/shared/test/forbiddenOrg.ts';
import {
  auditCopiedJsxText, auditCopiedSourceStrings, auditPreparedModule,
  formatCopyFinding, isDisplayCandidate, prohibitedCopyPatterns,
} from './copy-source-audit.mjs';
import { prepareCopiedModules, rewriteModuleDisplayStrings } from './prepare-copy.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const codes = (source, path = 'module.ts') => auditPreparedModule(source, path).map((item) => item.code);

for (const clean of [
  'UNKNOWN', 'Inconnu', 'Non renseigné', 'Source', 'Licence', 'Date',
  'CC0-1.0', '2026-11-16', 'Step-free entrance', 'Entrée sans marche',
  'source_verification', 'verificationTier', 'verifiedClaimCount',
  'PROTOTYPE-UNVERIFIED', 'SEEDED-OPEN-DATA',
  './verification.ts', '../verification/index.js', '/verification',
  '#verification', '.verification', '@scope/verification',
  'https://example.org/verification',
]) {
  test(`source-copy audit leaves non-display or approved value: ${clean}`, () => {
    assert.deepEqual(codes(`export const value=${JSON.stringify(clean)};`), []);
  });
}

for (const banned of [
  'This place is verified', 'Verification tier for this place',
  'Not a verified local service', 'Vérification du trajet',
  'Vérifiez le formulaire', 'Non vérifié', 'véRIFICATION du lieu',
]) {
  test(`source-copy audit refuses natural-language phrase: ${banned}`, () => {
    assert.ok(codes(`const message=${JSON.stringify(banned)};`).includes('SOURCE_COPY'));
  });
}

for (const [index, value] of forbiddenOrgNeedles().entries()) {
  test(`uses shared organisation-name helper ${index}`, () => {
    assert.ok(prohibitedCopyPatterns(`Endorsed by ${value}`).length > 0);
  });
}

for (const element of ['p','button','span','label','li','h1','h2','h3','h4','h5','h6','td','th','caption','title','legend','summary','option','a']) {
  test(`flags raw visible text in <${element}>`, () => {
    const sample = `<${element}>Vérification du lieu</${element}>`;
    assert.deepEqual(codes(`const view=${sample};`, 'view.tsx'), ['JSX_COPY']);
  });
}

for (const source of [
  '// <p>Vérification du lieu</p>',
  'const view=<p>{verificationTier}</p>;',
  'const view=<p className="verificationTier">{status}</p>;',
  'const expr = count > verificationTier;',
]) {
  test(`does not treat JSX expressions or comment examples as visible text: ${source.slice(0,25)}`, () => {
    assert.deepEqual(codes(source,'view.tsx'), []);
  });
}

test('reports stable file locations without leaking the literal', () => {
  const found = auditCopiedSourceStrings('const text="Vérification du lieu";', 'example.ts');
  assert.equal(found.length, 1);
  assert.deepEqual(found[0], {
    file: 'example.ts', offset: 11, code: 'SOURCE_COPY',
    detail: 'Prohibited display wording remains',
  });
  assert.equal(formatCopyFinding(found[0]), 'example.ts:11 [SOURCE_COPY] Prohibited display wording remains');
});

test('explicit JSX scan covers text, while unrelated JavaScript is unchanged', () => {
  const jsx = '<p>Verification tier</p>';
  assert.equal(auditCopiedJsxText(jsx, 'view.tsx').length, 1);
  assert.deepEqual(auditCopiedJsxText('const verificationTier=0;', 'view.tsx'), []);
});

test('candidate filter rejects technical tokens but preserves readable sentences', () => {
  assert.equal(isDisplayCandidate('UNKNOWN'), false);
  assert.equal(isDisplayCandidate('verificationTier'), false);
  assert.equal(isDisplayCandidate('Source tier for this record'), true);
});

test('preparation closes the gate on an unsafe source claim', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'release-preparation-gate-'));
  try {
    const copy = join(dir, '.lanes', 'example', 'packages', 'sample', 'src');
    await mkdir(copy, { recursive: true });
    await writeFile(join(copy, 'index.ts'), 'const label = '+JSON.stringify('Endorsed by '+forbiddenOrgNeedles()[0])+';');
    await assert.rejects(prepareCopiedModules(dir, {strict:true}), /unresolved display issue/);
    assert.equal(await readFile(join(copy,'index.ts'),'utf8'), 'const label = '+JSON.stringify('Endorsed by '+forbiddenOrgNeedles()[0])+';');
  } finally { await rm(dir, {recursive:true,force:true}); }
});

test('preparation repairs bilingual source in place and passes a second run', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'release-preparation-clean-'));
  try {
    const copy = join(dir, '.lanes', 'example', 'packages', 'sample', 'src');
    await mkdir(copy, { recursive: true });
    await writeFile(join(copy, 'index.tsx'), 'export const a=<p>Verification tier</p>;\nexport const b="Vérifiez le formulaire";');
    const first = await prepareCopiedModules(dir, {strict:true});
    assert.equal(first.files, 1);
    assert.equal(first.changed, 2);
    const second = await prepareCopiedModules(dir, {strict:true});
    assert.equal(second.changed, 0);
  } finally { await rm(dir, {recursive:true,force:true}); }
});

test('unclosed source literal fails closed before build', () => {
  assert.deepEqual(codes('const label="unterminated'), ['SOURCE_LEX']);
});

test('release source check does not replace protocol terms in exported types', () => {
  const source = 'export type VerificationTier = "VERIFIED" | "UNVERIFIED";';
  assert.equal(rewriteModuleDisplayStrings(source).content, source);
  assert.deepEqual(codes(source), []);
});

test('root release and build commands include source preparation', async () => {
  const manifest = JSON.parse(await readFile(join(root,'package.json'),'utf8'));
  for (const name of ['build','prebuild','pretest','pretypecheck']) {
    assert.match(manifest.scripts[name], /scripts\/release\/prepare-copy\.mjs/);
  }
  assert.match(manifest.scripts.build, /prepare-copy\.mjs --root \./);
  assert.match(manifest.scripts.prebuild, /prepare-copy\.mjs --root \./);
  assert.match(manifest.scripts.verify, /scripts\/release\/check\.mjs/);
});

test('non-strict mode still refuses unsafe text when pinned sources exist', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'release-present-copy-'));
  try {
    const copy = join(dir, '.lanes', 'module', 'src');
    await mkdir(copy, { recursive: true });
    await writeFile(join(copy, 'view.ts'), 'export const label='+JSON.stringify('Endorsed by '+forbiddenOrgNeedles()[0])+';');
    await assert.rejects(prepareCopiedModules(dir), /unresolved display issue/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
