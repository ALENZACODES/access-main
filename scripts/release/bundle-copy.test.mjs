import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeStaticString, extractShippedStrings,
  findForbiddenShippedCopy, isLegacyTechnicalToken, scriptKindFor,
} from './bundle-copy.mjs';
import { auditCopiedSourceStrings } from './copy-source-audit.mjs';
import { BANNED_PATTERNS, inspectRelease } from './check.mjs';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function built(files, run) {
  const folder = await mkdtemp(join(tmpdir(), 'p19-bundle-'));
  try {
    for (const [path, value] of Object.entries(files)) {
      const name = join(folder, path);
      await mkdir(join(name, '..'), { recursive: true });
      await writeFile(name, value);
    }
    return await run(folder);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

test('technical identifiers are not released labels', () => {
  const scan = findForbiddenShippedCopy('function verificationTier(verifiedClaimCount){return verifiedClaimCount}', BANNED_PATTERNS);
  assert.deepEqual(scan.issues, []);
});

test('natural-language English copy is refused inside JS', () => {
  const result = findForbiddenShippedCopy('const title="This place is verified";', BANNED_PATTERNS);
  assert.ok(result.issues.length >= 1);
});

test('natural-language French copy is refused inside JS', () => {
  for (const message of ['Vérification du lieu', 'Vérifier la source', 'Non vérifié']) {
    assert.ok(findForbiddenShippedCopy(`const message=${JSON.stringify(message)};`, BANNED_PATTERNS).issues.length > 0, message);
  }
});

test('legacy schema values remain technical values, not public assertions', () => {
  assert.equal(isLegacyTechnicalToken('PROTOTYPE-UNVERIFIED'), true);
  assert.equal(isLegacyTechnicalToken('Vérifié'), false);
});

test('rejects a lowercase status presented as a label', () => {
  assert.ok(findForbiddenShippedCopy('const label="verified";', BANNED_PATTERNS).issues.length > 0);
});

test('code-only regular expressions and comments are not labels', () => {
  const js = '/* verified comment */ const pattern=/verified/i; // verification\nconst result="UNKNOWN";';
  assert.deepEqual(findForbiddenShippedCopy(js, BANNED_PATTERNS).issues, []);
});

test('Unicode and hexadecimal escapes cannot hide the offending text', () => {
  assert.equal(decodeStaticString('v\\u00e9rification'), 'vérification');
  assert.ok(findForbiddenShippedCopy('const label="v\\u00e9rification";', BANNED_PATTERNS).issues.length);
});

test('extractor retains Unicode text and stable source offsets', () => {
  const result = extractShippedStrings('const a="UNKNOWN",b="Inconnu";');
  assert.deepEqual(result.strings.map(({ value }) => value), ['UNKNOWN', 'Inconnu']);
  assert.equal(result.strings[0]?.offset, 8);
});

test('unclosed string fails closed', () => {
  assert.match(findForbiddenShippedCopy('const a="unfinished', BANNED_PATTERNS).issues[0], /unterminated/);
});

test('integration: identifier-only bundles pass while a visible claim fails', async () => {
  await built({ 'index.html': '<html lang="en"><main>UNKNOWN</main></html>', 'assets/app.js': 'const verificationTier=1;' }, async (folder) => {
    assert.deepEqual((await inspectRelease(folder)).issues, []);
  });
  await built({ 'assets/app.js': 'const text="The information is verified";' }, async (folder) => {
    assert.ok((await inspectRelease(folder)).issues.length > 0);
  });
});

test('integration: replacement characters are refused in JS irrespective of lexical context', async () => {
  await built({ 'assets/app.js': 'const bad=\uFFFD;' }, async (folder) => {
    assert.ok((await inspectRelease(folder)).issues.some((value) => value.includes('U+FFFD')));
  });
});

test('minified CSV and interpolated template syntax remains inspectable', () => {
  const js = 'const rows=[["a","b"]]; const csv=rows.map(x=>x.join(",")).join("\\r\\n"); const f=n=>`\\uFEFF${n}`;';
  assert.equal(extractShippedStrings(js).error, null);
  assert.deepEqual(findForbiddenShippedCopy(js, BANNED_PATTERNS).issues, []);
  assert.ok(findForbiddenShippedCopy(js + 'const alert="Vérifiez";', BANNED_PATTERNS).issues.length > 0);
});

test('TypeScript and TSX sources are parsed in their own mode, not as JavaScript', () => {
  const typed = 'export const byId = new Map<string, readonly number[]>();\n'
    + 'export const label: string = "Saved places";\n'
    + 'export const first = (["a"] as const)[0]!;\n';
  // Read as JavaScript, explicit type arguments on a call or constructor are a lexical error.
  assert.notEqual(extractShippedStrings(typed).error, null);
  const asTs = extractShippedStrings(typed, 'module.ts');
  assert.equal(asTs.error, null);
  assert.deepEqual(asTs.strings.map((item) => item.value), ['Saved places', 'a']);
  const view = 'export function View({ items }: { items: string[] }) { const seen = new Set<string>(items); return <ul>{[...seen].map((item) => <li key={item}>{item}</li>)}</ul>; }\n'
    + 'export const title = "Places";\n';
  const asTsx = extractShippedStrings(view, 'View.tsx');
  assert.equal(asTsx.error, null);
  assert.deepEqual(asTsx.strings.map((item) => item.value), ['Places']);
  assert.deepEqual(auditCopiedSourceStrings(typed, 'packages/sample/src/module.ts'), []);
  assert.deepEqual(auditCopiedSourceStrings(view, 'packages/sample/src/View.tsx'), []);
});

test('a malformed TypeScript source still fails closed', () => {
  const broken = 'export const label: string = "open;\nexport const next = ;\n';
  assert.notEqual(extractShippedStrings(broken, 'broken.ts').error, null);
  assert.equal(auditCopiedSourceStrings(broken, 'broken.ts')[0]?.code, 'SOURCE_LEX');
});

test('parser mode follows the file extension', () => {
  const kinds = ['a.js', 'a.mjs', 'a.jsx', 'a.ts', 'a.mts', 'a.tsx', undefined].map((name) => scriptKindFor(name));
  assert.equal(kinds[0], kinds[1]);
  assert.equal(kinds[0], kinds[6]);
  assert.equal(new Set([kinds[0], kinds[2], kinds[3], kinds[5]]).size, 4);
  assert.equal(kinds[3], kinds[4]);
});
