import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  TECHNICAL_VALUES, replaceDisplayPhrase, rewriteModuleDisplayStrings,
  prepareCopiedModules, parsePrepareArgs,
} from './prepare-copy.mjs';

const examples = [
  ['Demonstration data — not a verified listing', 'Demonstration data — not a published listing'],
  ['No verified listings', 'No published listings'],
  ['Verification tier', 'Source tier'],
  ['Verification status', 'Source status'],
  ['This is unverified', 'This is not independently checked'],
  ['Verify a record', 'Check a record'],
  ['It was verified.', 'It was recorded.'],
  ['Vérification du trajet', 'Contrôle du trajet'],
  ['Vérifiez le formulaire', 'Contrôlez le formulaire'],
  ['À revérifier', 'À contrôler de nouveau'],
  ['Niveau de vérification', 'Niveau de contrôle'],
];

for (const [original, expected] of examples) {
  test(`rewrites visible phrase: ${original}`, () => {
    assert.equal(replaceDisplayPhrase(original), expected);
  });
}

for (const token of TECHNICAL_VALUES) {
  test(`preserves technical field or status: ${token}`, () => {
    assert.equal(replaceDisplayPhrase(token), token);
  });
}

test('does not rewrite underscore or camel-case protocol keys', () => {
  const items = ['source_verified', 'isVerified', 'verificationTier',
    'verification_status', 'verified_not_in_prototype', 'VERIFIED'];
  for (const token of items) assert.equal(replaceDisplayPhrase(token), token);
});

test('rewrites only literal payloads, leaving identifiers untouched', () => {
  const src = `const verificationTier = "verificationTier";\nconst label = "Verification tier";`;
  const result = rewriteModuleDisplayStrings(src);
  assert.match(result.content, /const verificationTier = "verificationTier"/);
  assert.match(result.content, /const label = "Source tier"/);
  assert.equal(result.changed, 1);
});

test('ignores comments and single-line comments', () => {
  const src = `// "Verification tier"\n/* "Verification tier" */\nconst label = 'Verification tier';`;
  const result = rewriteModuleDisplayStrings(src);
  assert.match(result.content, /^\/\/ "Verification tier"/);
  assert.match(result.content, /\/\* "Verification tier" \*\//);
  assert.match(result.content, /const label = 'Source tier'/);
  assert.equal(result.changed, 1);
});

test('does not corrupt escaped strings', () => {
  const src = `const label = "Verify \\"this record\\"";`;
  const { content } = rewriteModuleDisplayStrings(src);
  assert.match(content, /"Check \\"this record\\""/);
});

test('keeps template interpolations as source', () => {
  const src = 'const sentence = `Verification tier: ${tier}`;';
  assert.equal(rewriteModuleDisplayStrings(src).content, src);
});

test('is idempotent and deterministic', () => {
  const input = `const fr = "Vérifiez le formulaire";\nconst en = 'Verification status';`;
  const first = rewriteModuleDisplayStrings(input);
  const second = rewriteModuleDisplayStrings(first.content);
  assert.equal(first.changed, 2);
  assert.equal(second.changed, 0);
  assert.equal(second.content, first.content);
});

test('rejects invalid command arguments', () => {
  assert.deepEqual(parsePrepareArgs(['--root', 'here', '--strict']), { root: 'here', strict: true });
  assert.throws(() => parsePrepareArgs(['--bad']), /Unexpected argument/);
});

async function fixture(fn) {
  const root = await mkdtemp(join(tmpdir(), 'copy-prepare-'));
  try { await fn(root); } finally { await rm(root, { recursive: true, force: true }); }
}

test('missing copies are supported only when not strict', async () => {
  await fixture(async (root) => {
    assert.deepEqual(await prepareCopiedModules(root), { files: 0, changed: 0, skipped: true });
    await assert.rejects(() => prepareCopiedModules(root, { strict: true }), /Expected pinned/);
  });
});

test('rewrites source tree without touching tests or JSON protocols', async () => {
  await fixture(async (root) => {
    const dir = join(root, '.lanes', 'tools', 'packages', 'place', 'src');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'index.ts'), `export const label = 'Verification tier';`);
    await writeFile(join(dir, 'index.test.ts'), `throw Error('Verification tier');`);
    await writeFile(join(dir, 'schema.json'), '{"status":"VERIFIED"}');
    const result = await prepareCopiedModules(root, { strict: true });
    assert.equal(result.files, 1);
    assert.equal(result.changed, 1);
    assert.match(await readFile(join(dir, 'index.ts'), 'utf8'), /Source tier/);
    assert.match(await readFile(join(dir, 'index.test.ts'), 'utf8'), /Verification tier/);
    assert.match(await readFile(join(dir, 'schema.json'), 'utf8'), /VERIFIED/);
    const second = await prepareCopiedModules(root, { strict: true });
    assert.equal(second.changed, 0);
  });
});

test('rejects symlinked module copies rather than following outside paths', async () => {
  await fixture(async (root) => {
    const dir = join(root, '.lanes');
    await mkdir(dir);
    await symlink(root, join(dir, 'external'));
    await assert.rejects(() => prepareCopiedModules(root), /Symbolic link/);
  });
});

test('rejects the source replacement character', async () => {
  await fixture(async (root) => {
    const dir = join(root, '.lanes', 'pkg');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'index.ts'), 'const value = "\uFFFD"');
    await assert.rejects(() => prepareCopiedModules(root), /Invalid source character/);
  });
});


test('does not edit quoted strings inside regex expressions', () => {
  const src = `const match = /"Verification tier"/i;\nconst label = "Verification tier";`;
  const out = rewriteModuleDisplayStrings(src);
  assert.match(out.content, /match = \/"Verification tier"\/i/);
  assert.match(out.content, /label = "Source tier"/);
  assert.equal(out.changed, 1);
});

test('preserves single-token status values and names', () => {
  const src = `const status = "verified"; const other = "unverified";`;
  assert.equal(rewriteModuleDisplayStrings(src).content, src);
});

test('release preparation is connected to root build and preflight tasks', async () => {
  const { readFile } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const { dirname, resolve } = await import('node:path');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const json = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  for (const name of ['build', 'pretest', 'pretypecheck']) {
    assert.match(json.scripts[name], /scripts\/release\/prepare-copy\.mjs/);
  }
  assert.match(json.scripts.verify, /scripts\/release\/check\.mjs/);
});

// JSX raw text is turned into JavaScript string constants by the web bundler.
// These cases must be repaired before minification without changing TSX code.
test('plain TSX paragraphs and buttons receive bilingual display wording', async () => {
  const { rewriteStaticJsxText } = await import('./prepare-copy.mjs');
  const source = [
    'const view = <><p>Verification status</p><button>Vérifiez le formulaire</button></>;',
    'const another = <h2>Unverified</h2>;',
  ].join('\n');
  const result = rewriteStaticJsxText(source);
  assert.match(result.content, /<p>Source status<\/p>/);
  assert.match(result.content, /<button>Contrôlez le formulaire<\/button>/);
  assert.match(result.content, /<h2>Not independently checked<\/h2>/);
  assert.equal(result.changed, 3);
  assert.equal(rewriteStaticJsxText(result.content).changed, 0);
});

test('JSX repair leaves identifiers, expressions and protocol labels untouched', async () => {
  const { rewriteStaticJsxText } = await import('./prepare-copy.mjs');
  const source = [
    'const verificationTier = "verificationTier";',
    'const first = <p>{verificationTier}</p>;',
    'const second = <p className="verified">{status}</p>;',
    'const third = <p>Before {status} verified after</p>;',
    'const comparison = a > verified < b;',
    '// <p>verified</p>',
  ].join('\n');
  assert.equal(rewriteStaticJsxText(source).content, source);
});

test('TSX source pass edits raw markup and quoted strings together', async () => {
  await fixture(async (root) => {
    const folder = join(root, '.lanes', 'access-tools', 'packages', 'some-package', 'src');
    await mkdir(folder, { recursive: true });
    const filepath = join(folder, 'view.tsx');
    await writeFile(filepath, 'export const view = <p>Verification tier</p>;\nexport const label = "Vérifiez la date";\n');
    const result = await prepareCopiedModules(root, { strict: true });
    assert.equal(result.changed, 2);
    const updated = await readFile(filepath, 'utf8');
    assert.match(updated, /<p>Source tier<\/p>/);
    assert.match(updated, /"Contrôlez la date"/);
    assert.equal((await prepareCopiedModules(root, { strict: true })).changed, 0);
  });
});

test('protects import paths, URLs, hash routes and selectors', () => {
  const protectedValues = [
    './verification.ts', '../verification/index.js',
    '/verification', '@scope/verification',
    'https://example.org/verification', 'mailto:verification@example.org',
    '#verification', '.verification', 'assets/verification.js',
  ];
  for (const value of protectedValues) {
    assert.equal(replaceDisplayPhrase(value), value, value);
  }
  const source = `import helper from './verification.ts';\nconst url = 'https://example.org/verification';\nconst button = 'Verify the record';`;
  const result = rewriteModuleDisplayStrings(source);
  assert.match(result.content, /from '\.\/verification\.ts'/);
  assert.match(result.content, /https:\/\/example\.org\/verification/);
  assert.match(result.content, /'Check the record'/);
  assert.equal(result.changed, 1);
});

test('native interactive JSX text is covered without changing expressions', async () => {
  const { rewriteStaticJsxText } = await import('./prepare-copy.mjs');
  const elements = ['option', 'legend', 'summary', 'title', 'td', 'th', 'caption', 'textarea'];
  for (const tag of elements) {
    const before = `<${tag}>Verification status</${tag}>`;
    const after = rewriteStaticJsxText(before);
    assert.equal(after.content, `<${tag}>Source status</${tag}>`, tag);
    assert.equal(after.changed, 1, tag);
  }
  for (const tag of elements) {
    const before = `<${tag}>{verificationTier}</${tag}>`;
    assert.equal(rewriteStaticJsxText(before).content, before, tag);
  }
});

test('UNKNOWN and source tokens are unaffected during EN and FR changes', () => {
  const before = [
    `const value = "UNKNOWN";`,
    `const protocol = "PROTOTYPE-UNVERIFIED";`,
    `const english = "Verification tier: UNKNOWN";`,
    `const french = "Niveau de vérification : UNKNOWN";`,
  ].join('\n');
  const after = rewriteModuleDisplayStrings(before).content;
  assert.match(after, /value = "UNKNOWN"/);
  assert.match(after, /protocol = "PROTOTYPE-UNVERIFIED"/);
  assert.match(after, /english = "Source tier: UNKNOWN"/);
  assert.match(after, /french = "Niveau de contrôle : UNKNOWN"/);
});
