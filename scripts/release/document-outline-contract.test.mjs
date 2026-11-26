import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  UNKNOWN, LIMITS, LANGUAGES, STATES, MARKS, plain, lexical, hasExactKeys,
  dateValid, cleanText, docId, safePath, languageValid, provenanceValid,
  validateDocument, validateManifest, parseManifest, fictionalManifest,
} from './document-outline-contract.mjs';
const fixture = () => fictionalManifest();
const document = () => fixture().documents[0];
const withDocument = changes => ({ ...document(), ...changes });
const withManifest = changes => ({ ...fixture(), ...changes });
const invalid = (value, code) => validateManifest(value).errors.some(e => e.code === code);
const invalidDocument = (value, code) => validateDocument(value, '2026-11-21').some(e => e.code === code);

test('UNKNOWN uses an exact stable token', () => assert.equal(UNKNOWN, 'UNKNOWN'));
test('the recognized languages are English and French', () => assert.deepEqual(LANGUAGES, ['en', 'fr']));
test('documentation review states do not imply publication', () => assert.deepEqual(STATES, ['UNKNOWN', 'draft', 'reviewed']));
test('source evidence tiers retain UNKNOWN', () => assert.equal(MARKS[0], UNKNOWN));
test('manifest byte bound is finite', () => assert.ok(LIMITS.bytes < 2_000_000));
test('document character bound protects the reviewer', () => assert.ok(LIMITS.characters > 1000));
test('object detector accepts simple objects', () => assert.equal(plain({}), true));
test('object detector accepts null-prototype objects', () => assert.equal(plain(Object.create(null)), true));
test('object detector rejects arrays', () => assert.equal(plain([]), false));
test('object detector rejects strings', () => assert.equal(plain('x'), false));
test('object detector rejects null', () => assert.equal(plain(null), false));
test('object detector rejects dates', () => assert.equal(plain(new Date()), false));
test('lexical ordering compares stable identifiers', () => assert.deepEqual(['z','b','a'].sort(lexical), ['a','b','z']));
test('exact keys accept complete structure', () => assert.equal(hasExactKeys({ a: 1, b: 2 }, ['a','b']), true));
test('exact keys reject missing required fields', () => assert.equal(hasExactKeys({ a: 1 }, ['a','b']), false));
test('exact keys reject hidden extra fields', () => assert.equal(hasExactKeys({ a: 1, c: 3 }, ['a']), false));
test('exact keys support optional fields', () => assert.equal(hasExactKeys({ a: 1 }, ['a','b'], ['a']), true));
test('exact keys reject inherited values', () => assert.equal(hasExactKeys(Object.create({ a: 1 }), ['a']), false));

for (const value of ['2026-11-21','2024-02-29','2000-02-29','2025-12-31']) {
  test(`valid calendar date ${value}`, () => assert.equal(dateValid(value), true));
}
for (const value of ['2026-02-29','2025-13-01','2025-00-01','2025-01-00','2025-04-31','tomorrow','2026/11/21','2026-1-1','']) {
  test(`reject malformed calendar date ${JSON.stringify(value)}`, () => assert.equal(dateValid(value), false));
}
for (const value of ['ok','école','UNKNOWN','A source of local observations','© OpenStreetMap contributors']) {
  test(`accept provenance label ${JSON.stringify(value)}`, () => assert.equal(cleanText(value), true));
}
for (const value of ['', ' leading', 'trailing ', '\nline','\tvalue','word\u007f','a\u2028b',null,4]) {
  test(`reject unsuitable provenance text ${JSON.stringify(value)}`, () => assert.equal(cleanText(value), false));
}
test('text limit is inclusive', () => assert.equal(cleanText('x'.repeat(12), 12), true));
test('text limit rejects excess', () => assert.equal(cleanText('x'.repeat(13), 12), false));
for (const value of ['intro','help-3','intro.en','help_notes','a0','0']) {
  test(`safe document id ${value}`, () => assert.equal(docId(value), true));
}
for (const value of ['','UPPER','has space','-begins','../outside','with/slash','\0','a'.repeat(81)]) {
  test(`unsafe document id ${JSON.stringify(value)}`, () => assert.equal(docId(value), false));
}
for (const value of ['index.md','help/introduction.en.md','docs/guide_2.md','documentation/2026-11/guide.md']) {
  test(`safe documentation path ${value}`, () => assert.equal(safePath(value), true));
}
for (const value of ['../outside.md','/absolute.md','.hidden.md','./relative.md','folder//doc.md','folder/../doc.md','folder\\file.md','document.html','https://example.org/doc.md','']) {
  test(`unsafe documentation path ${JSON.stringify(value)}`, () => assert.equal(safePath(value), false));
}
test('language validation accepts en', () => assert.equal(languageValid('en'), true));
test('language validation accepts fr', () => assert.equal(languageValid('fr'), true));
test('language validation refuses invented language', () => assert.equal(languageValid('es'), false));
test('provenance is present in fictional document', () => assert.equal(provenanceValid(document()), true));
test('missing licence rejects provenance', () => assert.equal(provenanceValid({ ...document(), licence: '' }), false));
test('missing source rejects provenance', () => assert.equal(provenanceValid({ ...document(), source: undefined }), false));
test('invalid tier rejects provenance', () => assert.equal(provenanceValid({ ...document(), tier: 'verified' }), false));
test('future retrieval dates are not silently accepted', () => assert.ok(invalidDocument(withDocument({retrievedOn: '2027-01-01'}), 'DOCUMENT_FUTURE_SOURCE')));
test('valid fiction source validates', () => assert.equal(validateDocument(document(), '2026-11-21').length, 0));
for (const [field, value, code] of [
  ['id','Bad ID','DOCUMENT_ID'], ['path','../../etc/passwd','DOCUMENT_PATH'],
  ['language','de','DOCUMENT_LANGUAGE'], ['pairId','NOT VALID','DOCUMENT_PAIR_ID'],
  ['title','', 'DOCUMENT_TITLE'], ['title','x'.repeat(200),'DOCUMENT_TITLE'],
  ['body','', 'DOCUMENT_BODY'], ['body','x'.repeat(LIMITS.characters + 1),'DOCUMENT_BODY'],
  ['state','approved','DOCUMENT_STATE'], ['retrievedOn','2025-02-29','DOCUMENT_PROVENANCE'],
  ['source','', 'DOCUMENT_PROVENANCE'], ['licence','', 'DOCUMENT_PROVENANCE'],
  ['tier','true','DOCUMENT_PROVENANCE'],
]) {
  test(`document rejects ${field}=${String(value).slice(0,24)}`, () => assert.ok(invalidDocument(withDocument({[field]:value}), code)));
}
test('optional pair identifier can be omitted', () => { const d = document(); delete d.pairId; assert.equal(validateDocument(d, '2026-11-21').length, 0); });
test('unknown extra document property is rejected', () => assert.ok(invalidDocument(withDocument({ injected: true }), 'DOCUMENT_FIELDS')));
test('document array is rejected', () => assert.ok(invalidDocument([], 'DOCUMENT_OBJECT')));
test('null document is rejected', () => assert.ok(invalidDocument(null, 'DOCUMENT_OBJECT')));
test('manifest validates fixture', () => assert.equal(validateManifest(fixture()).ok, true));
test('manifest returns the original value unchanged', () => { const m = fixture(); assert.equal(validateManifest(m).value, m); });
test('manifest schema must be 1', () => assert.ok(invalid(withManifest({ schemaVersion: 2 }), 'SCHEMA_VERSION')));
test('manifest date must be valid', () => assert.ok(invalid(withManifest({ capturedOn: 'yesterday' }), 'MANIFEST_DATE')));
test('manifest date must not be after review', () => assert.ok(invalid(withManifest({ capturedOn: '2028-01-01' }), 'MANIFEST_DATE')));
test('manifest without documents is rejected', () => assert.ok(invalid(withManifest({ documents: [] }), 'DOCUMENT_COUNT')));
test('manifest without array is rejected', () => assert.ok(invalid(withManifest({ documents: {} }), 'DOCUMENT_COUNT')));
test('manifest excessive documents are rejected', () => assert.ok(invalid(withManifest({ documents: Array.from({length: LIMITS.documents+1}, document) }), 'DOCUMENT_COUNT')));
test('manifest missing required field is rejected', () => { const m = fixture(); delete m.capturedOn; assert.ok(invalid(m,'MANIFEST_FIELDS')); });
test('manifest unexpected field is rejected', () => assert.ok(invalid(withManifest({ secret: 'ignored' }), 'MANIFEST_FIELDS')));
test('manifest duplicate ids rejected', () => { const m=fixture(); m.documents[1].id=m.documents[0].id; assert.ok(invalid(m,'DUPLICATE_ID')); });
test('manifest duplicate paths rejected', () => { const m=fixture(); m.documents[1].path=m.documents[0].path; assert.ok(invalid(m,'DUPLICATE_PATH')); });
test('invalid today is rejected', () => assert.ok(invalid(withManifest(), 'INVALID_TODAY')===false));
test('explicit invalid today returns a named error', () => assert.equal(validateManifest(fixture(),{today:'invalid'}).errors[0].code,'INVALID_TODAY'));
test('JSON parse round-trip is valid', () => assert.equal(parseManifest(JSON.stringify(fixture())).ok,true));
test('broken JSON is rejected without throwing', () => assert.equal(parseManifest('{').errors[0].code,'INVALID_JSON'));
test('invalid input type is rejected without throwing', () => assert.equal(parseManifest(null).errors[0].code,'FILE_SIZE'));
test('oversized JSON is rejected before parsing', () => assert.equal(parseManifest('a'.repeat(LIMITS.bytes+1)).errors[0].code,'FILE_SIZE'));
test('parse rejects documents that were changed after encoding', () => { const m=fixture();m.documents[0].state='approved';assert.equal(parseManifest(JSON.stringify(m)).ok,false); });
test('parsing retains UNKNOWN evidence tier', () => assert.equal(parseManifest(JSON.stringify(fixture())).value.documents[0].tier,UNKNOWN));
test('source path remains a relative string', () => assert.equal(fixture().documents[0].path.startsWith('/'),false));
test('multi-language fixture uses distinct document IDs', () => assert.notEqual(fixture().documents[0].id, fixture().documents[1].id));
test('multi-language fixture uses distinct file paths', () => assert.notEqual(fixture().documents[0].path,fixture().documents[1].path));
