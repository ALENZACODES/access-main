/** Explicit hostile-input and localization regression tests across the full opt-in feature. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fictionalManifest, validateManifest, parseManifest, LIMITS, UNKNOWN } from './document-outline-contract.mjs';
import { analyzeMarkdown, normalizeLinkDestination } from './document-outline-parser.mjs';
import { reviewManifest } from './document-outline-review.mjs';
import { compareManifest } from './document-outline-delta.mjs';
import { reconcileReview, makePendingLedger } from './document-outline-policy.mjs';
import { coverageReview } from './document-outline-coverage.mjs';
import { inspectNavigation } from './document-outline-navigation.mjs';
import { renderReport } from './document-outline-report.mjs';
const fixture = () => fictionalManifest();
const changed = body => {const m=fixture();m.documents[0].body=body;return m;};
const errorCodes = manifest => validateManifest(manifest).errors.map(x=>x.code);
const output = (manifest,format='html',language='en') => renderReport(manifest,{format,language});
test('prototype pollution key cannot be accepted in a manifest',()=>{
  const m=fixture();Object.defineProperty(m,'__proto__',{value:{admin:true},enumerable:true});
  assert.ok(errorCodes(m).includes('MANIFEST_FIELDS'));
});
test('constructor key cannot be accepted as a manifest field',()=>{
  const m=fixture();m.constructor={admin:true};
  assert.ok(errorCodes(m).includes('MANIFEST_FIELDS'));
});
test('unexpected top-level action request cannot run',()=>{
  const m=fixture();m.execute='deleteFiles';
  assert.ok(errorCodes(m).includes('MANIFEST_FIELDS'));
});
test('unexpected document action request is rejected',()=>{
  const m=fixture();m.documents[0].command='rm -rf /';
  assert.ok(errorCodes(m).includes('DOCUMENT_FIELDS'));
});
test('unexpected document authentication field is rejected',()=>{
  const m=fixture();m.documents[0].password='not-a-real-password';
  assert.ok(errorCodes(m).includes('DOCUMENT_FIELDS'));
});
test('unexpected document admin flag is rejected',()=>{
  const m=fixture();m.documents[0].admin=true;
  assert.ok(errorCodes(m).includes('DOCUMENT_FIELDS'));
});
test('JSON input with prototype-like key cannot bypass contract',()=>{
  const raw=JSON.stringify(fixture()).replace('"schemaVersion":1','"__proto__":{},"schemaVersion":1');
  assert.equal(parseManifest(raw).ok,false);
});
test('JSON input with a trailing comma is rejected',()=>{
  assert.equal(parseManifest('{"schemaVersion":1,}').ok,false);
});
test('JSON input with duplicate doc IDs is rejected',()=>{
  const m=fixture();m.documents[1].id=m.documents[0].id;
  assert.ok(errorCodes(m).includes('DUPLICATE_ID'));
});
test('JSON input with duplicate paths is rejected',()=>{
  const m=fixture();m.documents[1].path=m.documents[0].path;
  assert.ok(errorCodes(m).includes('DUPLICATE_PATH'));
});
test('JSON input above maximum size is rejected',()=>{
  assert.equal(parseManifest(' '.repeat(LIMITS.bytes+1)).errors[0].code,'FILE_SIZE');
});
test('unknown path traversal before path prefix is rejected',()=>{
  assert.equal(normalizeLinkDestination('../guide.md').kind,'invalid');
});
test('unknown path traversal after prefix is rejected',()=>{
  assert.equal(normalizeLinkDestination('a/../guide.md').kind,'invalid');
});
test('absolute local file reference is rejected',()=>{
  assert.equal(normalizeLinkDestination('/etc/passwd').kind,'invalid');
});
test('Windows-like file reference is rejected',()=>{
  assert.equal(normalizeLinkDestination('C:\\private\\guide.md').kind,'invalid');
});
test('protocol-relative remote URL is rejected',()=>{
  assert.equal(normalizeLinkDestination('//attacker.example').kind,'invalid');
});
test('script URL cannot be interpreted as a safe link',()=>{
  assert.equal(normalizeLinkDestination('javascript:alert(1)').kind,'invalid');
});
test('data URL cannot be interpreted as a safe link',()=>{
  assert.equal(normalizeLinkDestination('data:text/html,%3Ch1%3EHi').kind,'invalid');
});
test('file URL cannot be interpreted as a safe link',()=>{
  assert.equal(normalizeLinkDestination('file:///etc/passwd').kind,'invalid');
});
test('blob URL cannot be interpreted as safe link',()=>{
  assert.equal(normalizeLinkDestination('blob:https://site/123').kind,'invalid');
});
test('FTP link is not a supported external reference',()=>{
  assert.equal(normalizeLinkDestination('ftp://example.org/file').kind,'invalid');
});
test('external HTTP URL is retained only with an insecure marker',()=>{
  const dest=normalizeLinkDestination('http://example.org');
  assert.equal(dest.kind,'external');
  assert.equal(dest.insecure,true);
});
test('external HTTPS URL with embedded password is rejected',()=>{
  assert.equal(normalizeLinkDestination('https://user:pass@example.org').kind,'invalid');
});
test('fragment URL decoding refuses to crash on invalid percent encoding',()=>{
  assert.equal(normalizeLinkDestination('#%ZZ').kind,'fragment');
});
test('document with full script markup is not executed by parser',()=>{
  const parsed=analyzeMarkdown('# Title\n<script>globalThis.hacked=true</script>');
  assert.equal(parsed.headings.length,1);
  assert.equal(globalThis.hacked,undefined);
});
test('document with script markup remains ordinary source text',()=>{
  const r=reviewManifest(changed('# Title\n<script>alert(1)</script>'));
  assert.equal(r.ok,true);
});
test('HTML exporter escapes script tags introduced through document path source',()=>{
  const m=fixture();m.documents[0].title='A <script>alert(1)</script> title';
  assert.equal(output(m).ok,true);
  assert.ok(!output(m).content.includes('<script>alert(1)</script>'));
});
test('HTML exporter never puts raw script tags from finding details',()=>{
  const m=changed('# Title\n[Danger](javascript:alert(1))');
  assert.ok(!/<script>/u.test(output(m).content));
});
test('HTML exporter does not load remote fonts',()=>{
  const html=output(fixture()).content;
  assert.ok(!/@import\b/u.test(html));
  assert.ok(!/fonts\.googleapis\.com/u.test(html));
});
test('HTML exporter retains CSS property declarations in French',()=>{
  const html=output(fixture(),'html','fr').content;
  assert.ok(html.includes('font-family:system-ui'));
  assert.ok(html.includes('max-width:80rem'));
  assert.ok(html.includes('color:#172b42'));
});
test('HTML exporter retains English CSS property declarations',()=>{
  const html=output(fixture(),'html','en').content;
  assert.ok(html.includes('font-family:system-ui'));
  assert.ok(html.includes('outline:3px'));
});
test('French report uses nonbreaking space in displayed colon',()=>{
  const html=output(fixture(),'html','fr').content;
  assert.ok(html.includes('Date du rapport\u00a0:'));
});
test('French report uses narrow NBSP at displayed semicolon',()=>{
  const html=output(fixture(),'html','fr').content;
  assert.ok(html.includes('\u202f;'));
});
test('French report never replaces UNKNOWN with localized token',()=>{
  const html=output(fixture(),'html','fr').content;
  assert.ok(html.includes(UNKNOWN));
  assert.ok(!html.includes('Inconnu'));
});
test('CSV escaped leading equals expression from issue detail',()=>{
  const m=changed('# Title\n[Bad](=HYPERLINK)');
  const csv=output(m,'csv','en').content;
  assert.ok(csv.includes("'=HYPERLINK"));
});
test('CSV quotes paths to prevent cell boundaries',()=>{
  const csv=output(fixture(),'csv','en').content;
  assert.ok(csv.startsWith('"Path","Severity"'));
});
test('JSON export does not turn a source value into an executable object',()=>{
  const m=fixture();m.documents[0].title='Not an executable expression';
  const value=JSON.parse(output(m,'json').content);
  assert.equal(Object.getPrototypeOf(value),Object.prototype);
});
test('HTML export uses named main landmark in French and English',()=>{
  for (const language of ['en','fr']) assert.ok(output(fixture(),'html',language).content.includes('<main id="main">'));
});
test('HTML exporter honors reduced-motion preference',()=>{
  assert.ok(output(fixture()).content.includes('prefers-reduced-motion'));
});
test('HTML exporter never generates a form post',()=>{
  assert.ok(!/<form\b/iu.test(output(fixture()).content));
});
test('HTML exporter never generates a clickable automatic submit control',()=>{
  assert.ok(!/<button[^>]*type="submit"/iu.test(output(fixture()).content));
});
test('HTML exporter does not create an embedded iframe',()=>{
  assert.ok(!/<iframe\b/iu.test(output(fixture()).content));
});
test('HTML report is not a network availability check',()=>{
  const r=output(fixture());
  assert.ok(!Object.hasOwn(r.review.value,'networkStatus'));
});
test('documentation parser does not invent image descriptions',()=>{
  const m=changed('# Title\n![](missing.png)');
  assert.ok(reviewManifest(m).value.issues.some(i=>i.code==='IMAGE_NO_ALT'));
});
test('documentation parser does not invent heading titles',()=>{
  const m=changed('# ');
  assert.ok(reviewManifest(m).value.issues.some(i=>i.code==='HEADING_EMPTY'));
});
test('broken link causes a blocking issue without fetching destination',()=>{
  const m=changed('# Title\n[Broken](missing.md)');
  assert.ok(reviewManifest(m).value.issues.some(i=>i.code==='LINK_TARGET'));
});
test('broken link remains unresolved in navigation inventory',()=>{
  const m=changed('# Title\n[Broken](missing.md)');
  assert.equal(inspectNavigation(m).value.unresolved.length,1);
});
test('invalid manifest cannot produce an approved coverage review',()=>{
  assert.equal(coverageReview({schemaVersion:1,capturedOn:'2026-11-21',documents:[]}).ok,false);
});
test('unpaired language is a coverage finding not a fabricated translation',()=>{
  const m=fixture();m.documents.pop();
  assert.equal(coverageReview(m).value.counts.missingLanguage,1);
});
test('pair outline mismatch is not silently normalized',()=>{
  const m=fixture();m.documents[1].body='# Intro\n#### Details';
  assert.ok(reviewManifest(m).value.issues.some(i=>i.code==='PAIR_OUTLINE_MISMATCH'));
});
test('source tier UNKNOWN does not create accepted human decisions',()=>{
  const r=reviewManifest(fixture());
  const decisions=makePendingLedger(r);
  assert.ok(decisions.value.decisions.every(d=>d.decision===UNKNOWN));
});
test('empty decision ledger leaves current findings outstanding',()=>{
  const r=reviewManifest(fixture());
  const reconciled=reconcileReview(r,{schemaVersion:1,decisions:[]});
  assert.equal(reconciled.value.outstanding.length,r.value.issues.length);
});
test('stale accepted issue cannot close a different issue',()=>{
  const r=reviewManifest(fixture());
  const row={key:'previous|HEADING_MISSING|1|',decision:'accepted',reviewer:'Fictional',reviewedOn:'2026-11-21',note:'Historical review'};
  const reconciled=reconcileReview(r,{schemaVersion:1,decisions:[row]});
  assert.equal(reconciled.value.accepted.length,0);
  assert.equal(reconciled.value.stale.length,1);
});
test('revision comparison adds issues when input becomes unsafe',()=>{
  const before=fixture(),after=changed('# Title\n[Bad](javascript:alert(1))');
  assert.ok(compareManifest(before,after).value.findings.added.some(f=>f.code==='LINK_UNSAFE'));
});
test('revision comparison does not invent an acceptance decision',()=>{
  const before=fixture(),after=changed('# Changed');
  assert.equal(compareManifest(before,after).value.requireReview,true);
});
test('source document keeps exact user-supplied body after review',()=>{
  const m=changed('# Title\nL’accessibilité est une question.');
  const original=m.documents[0].body;
  reviewManifest(m);coverageReview(m);inspectNavigation(m);
  assert.equal(m.documents[0].body,original);
});
test('combined reports remain deterministic for a fixed review date',()=>{
  const m=fixture(),opts={format:'json',today:'2026-11-21'};
  assert.equal(renderReport(m,opts).content,renderReport(m,opts).content);
});
