import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import {
  CUSTODY_VERSION, CUSTODY_STATES, CUSTODY_TYPES, CUSTODY_LIMITS,
  issue, isRecord, safeId, cleanPath, classifyPath, sha256, stableEntries,
  utf8Size, pathPointer, sensitiveFieldPaths, checkProvenance, checkEntry,
  boundedLimits, validateCustody, canonicalCustody, custodyFingerprint,
  compareCustody, parseCustody, serializeCustody,
} from './artifact-custody-core.mjs';

const SHA='a'.repeat(64);
const date='2026-11-19';
const source=()=>({source:'https://example.org/catalogue',licence:'CC0-1.0',retrievedOn:date,tier:0});
const file=(path='index.html',overrides={})=>({path,kind:classifyPath(path),bytes:12,
  sha256:SHA,state:'PRESENT',provenance:source(),...overrides});
const manifest=(files=[file()],overrides={})=>({version:CUSTODY_VERSION,
  buildId:'build-1',provenance:source(),files,...overrides});
const codes=r=>r.problems.map(x=>x.code);

test('single synthetic file passes and remains unchanged',()=>{
  const m=manifest();const copy=JSON.parse(JSON.stringify(m));
  assert.equal(validateCustody(m).ok,true);
  assert.deepEqual(m,copy);
});
test('custody states are explicit and do not include inferred boolean status',()=>{
  assert.deepEqual(CUSTODY_STATES,['UNKNOWN','PRESENT','MISSING','CHANGED']);
  assert.equal(CUSTODY_STATES.includes('YES'),false);
});
test('resource kinds are finite and stable',()=>{
  assert.equal(new Set(CUSTODY_TYPES).size,CUSTODY_TYPES.length);
  assert.ok(CUSTODY_TYPES.includes('html'));
  assert.ok(CUSTODY_TYPES.includes('other'));
});
test('report issue helper defaults to errors',()=>{
  assert.deepEqual(issue('A','/x'),{code:'A',path:'/x',severity:'error'});
  assert.equal(issue('A','/x','warning').severity,'warning');
});
test('plain object check distinguishes arrays and prototypes',()=>{
  assert.equal(isRecord({}),true);
  assert.equal(isRecord(Object.create(null)),true);
  assert.equal(isRecord([]),false);
  assert.equal(isRecord(new Date()),false);
  assert.equal(isRecord(null),false);
});
test('safe ids refuse reserved names and separators',()=>{
  for(const bad of ['',null,3,'__proto__','constructor','prototype','../path','folder/name','x'.repeat(129)]){
    assert.equal(safeId(bad),false,String(bad));
  }
  assert.equal(safeId('release_10.4'),true);
  assert.equal(safeId('local-build'),true);
});
test('path normalization is stable for root resources',()=>{
  assert.equal(cleanPath('index.html'),'index.html');
  assert.equal(cleanPath('assets/app.js'),'assets/app.js');
  assert.equal(cleanPath('a/b/c/style.css'),'a/b/c/style.css');
});
test('path normalization refuses traversal and absolute paths',()=>{
  for(const path of ['/index.html','../x','a/../b','./x','a//b','a/./b','\\server\\share',
    'C:/program','a\\b','a/%2e%2e/b','a/file#frag','a/file?x=2','a/b:3']){
    assert.equal(cleanPath(path),null,path);
  }
});
test('path normalization refuses controls and ambiguous trailing dots',()=>{
  for(const path of ['a\nx','a\0b','a\tb','a/b.','a/b ','a/constructor/x','a/__proto__/x']){
    assert.equal(cleanPath(path),null,JSON.stringify(path));
  }
});
test('path limit stops deeply nested resources',()=>{
  const path=Array.from({length:CUSTODY_LIMITS.maxDepth+1},()=> 'part').join('/');
  assert.equal(cleanPath(path),null);
});
test('file extension classification is case-insensitive',()=>{
  const samples=[['index.HTML','html'],['A.mjs','script'],['styles.CSS','style'],
    ['a.PNG','image'],['a.woff2','font'],['a.webmanifest','json'],['a.txt','other']];
  for(const [path,kind] of samples)assert.equal(classifyPath(path),kind);
});
test('stable paths do not depend on operating system locale',()=>{
  const input=[file('z.js'),file('a.js'),file('m.js')];
  assert.deepEqual(stableEntries(input).map(x=>x.path),['a.js','m.js','z.js']);
  assert.equal(input[0].path,'z.js');
});
test('hashing is deterministic and byte sensitive',()=>{
  assert.equal(sha256('hello'),sha256(Buffer.from('hello')));
  assert.notEqual(sha256('hello'),sha256('Hello'));
  assert.equal(sha256(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});
test('UTF-8 size counts multibyte characters',()=>{
  assert.equal(utf8Size('A'),1);
  assert.equal(utf8Size('é'),2);
  assert.equal(utf8Size('😀'),4);
});
test('JSON pointer encoding escapes slashes and tildes',()=>{
  assert.equal(pathPointer('a/b~c'),'a~1b~0c');
});
test('privacy scan reports paths only',()=>{
  const input={a:[{token:'private-test',email:'someone@example.org',nested:{api_key:'secret'}}]};
  const found=sensitiveFieldPaths(input);
  assert.equal(found.length,3);
  assert.ok(found.some(x=>x.path==='/a/0/token'));
  assert.ok(found.some(x=>x.path==='/a/0/nested/api_key'));
  assert.equal(JSON.stringify(found).includes('private-test'),false);
});
test('privacy scan never rejects a technical source label',()=>{
  const data={source:'Local source name',name:'fixture',licence:'CC0-1.0'};
  assert.deepEqual(sensitiveFieldPaths(data),[]);
});
test('cyclic data is refused without indefinite recursion',()=>{
  const data={a:1};data.self=data;
  assert.ok(sensitiveFieldPaths(data).some(x=>x.code==='CYCLIC_DATA'));
});
test('source metadata requires all four fields',()=>{
  assert.deepEqual(checkProvenance(source()),[]);
  const result=checkProvenance({});
  for(const code of ['SOURCE_REQUIRED','LICENCE_REQUIRED','DATE_REQUIRED','TIER_REQUIRED']){
    assert.ok(result.some(x=>x.code===code),code);
  }
});
test('source metadata refuses unsafe URL schemes',()=>{
  for(const value of ['http://example.org','javascript:alert(1)','https://u:p@example.org',
    'https://localhost/page','file:///etc/passwd','https://x.localhost/a']){
    assert.ok(checkProvenance({...source(),source:value}).some(x=>x.code==='SOURCE_URL_UNSAFE'),value);
  }
});
test('source metadata accepts named, non-URL documents without assuming credibility',()=>{
  assert.deepEqual(checkProvenance({...source(),source:'Synthetic test document'}),[]);
});
test('invalid dates do not roll over',()=>{
  for(const bad of ['2026-02-30','2026-13-01','2026-11-1','yesterday']){
    assert.ok(checkProvenance({...source(),retrievedOn:bad}).length>0,bad);
  }
});
test('tier UNKNOWN is a missing tier, not a source class',()=>{
  assert.ok(checkProvenance({...source(),tier:'UNKNOWN'}).some(x=>x.code==='TIER_REQUIRED'));
});
test('entry checking enforces exact type relationship',()=>{
  assert.deepEqual(checkEntry(file()),[]);
  assert.ok(checkEntry(file('index.html',{kind:'script'})).some(x=>x.code==='KIND_INVALID'));
});
test('a present entry requires SHA-256',()=>{
  for(const digest of [null,'abc','A'.repeat(64),0]){
    assert.ok(checkEntry(file('index.html',{sha256:digest})).some(x=>x.code==='DIGEST_REQUIRED'));
  }
});
test('an UNKNOWN entry must not claim a digest',()=>{
  assert.deepEqual(checkEntry(file('index.html',{state:'UNKNOWN',sha256:null})),[]);
  assert.ok(checkEntry(file('index.html',{state:'UNKNOWN'})).some(x=>x.code==='ABSENT_DIGEST'));
});
test('MISSING state yields review warning, not a passing access claim',()=>{
  const result=checkEntry(file('index.html',{state:'MISSING',sha256:null}));
  assert.equal(result.every(x=>x.severity==='warning'),true);
  assert.equal(result[0].code,'STATE_REQUIRES_REVIEW');
});
test('bounds reject negative or oversized entry lengths',()=>{
  for(const bytes of [-1,NaN,Infinity,1.1,50_000_001]){
    assert.ok(checkEntry(file('index.html',{bytes})).some(x=>x.code==='SIZE_INVALID'));
  }
});
test('bounded limits refuse zero or out-of-range overrides',()=>{
  assert.equal(boundedLimits({maxFiles:0}),null);
  assert.equal(boundedLimits({maxFiles:10000000}),null);
  assert.equal(boundedLimits({maxIssues:2}).maxIssues,2);
});
test('no records means no invented resources',()=>{
  const m=manifest([]);
  assert.equal(validateCustody(m).ok,true);
  assert.equal(m.files.length,0);
});
test('case-insensitive duplicate assets are not silently merged',()=>{
  const m=manifest([file('a.js'),file('A.js')]);
  assert.ok(codes(validateCustody(m)).includes('PATH_COLLISION'));
});
test('source and licence belong to every manifest',()=>{
  const m=manifest();delete m.provenance;
  assert.ok(codes(validateCustody(m)).includes('SOURCE_METADATA_REQUIRED'));
});
test('extra manifest fields are refused',()=>{
  assert.ok(codes(validateCustody(manifest(undefined,{extra:'sample'}))).includes('EXTRA_FIELD'));
});
test('private values cause fail-closed validation',()=>{
  const m=manifest();m.token='do-not-echo';
  const result=validateCustody(m);
  assert.equal(result.ok,false);
  assert.equal(JSON.stringify(result).includes('do-not-echo'),false);
});
test('invalid options cannot suppress issues by allowing zero findings',()=>{
  const result=validateCustody(manifest(),{maxIssues:0});
  assert.equal(result.ok,false);
  assert.ok(codes(result).includes('LIMITS_INVALID'));
});
test('issue limits are not silent truncation',()=>{
  const result=validateCustody(manifest(Array.from({length:15},(_,i)=>file(`a${i}.html`,{sha256:''}))),{maxIssues:3});
  assert.equal(result.ok,false);
  assert.ok(codes(result).includes('ISSUE_LIMIT'));
});
test('canonical serialization sorts records and references without mutating input',()=>{
  const m=manifest([file('z.js',{references:['b.js','a.js']}),file('a.js')]);
  const canonical=canonicalCustody(m);
  assert.deepEqual(canonical.files.map(x=>x.path),['a.js','z.js']);
  assert.deepEqual(canonical.files[1].references,['a.js','b.js']);
  assert.deepEqual(m.files[0].references,['b.js','a.js']);
});
test('fingerprint remains stable across file insertion order',()=>{
  const a=manifest([file('a.js'),file('b.js')]);
  const b=manifest([file('b.js'),file('a.js')]);
  assert.equal(custodyFingerprint(a).fingerprint,custodyFingerprint(b).fingerprint);
});
test('fingerprint changes when source evidence changes',()=>{
  const a=manifest();const b=manifest(undefined,{provenance:{...source(),retrievedOn:'2026-11-18'}});
  assert.notEqual(custodyFingerprint(a).fingerprint,custodyFingerprint(b).fingerprint);
});
test('fingerprinting invalid snapshots never reports a hash',()=>{
  assert.equal(custodyFingerprint(manifest(undefined,{buildId:'../wrong'})).fingerprint,null);
});
test('comparison of identical manifests reports nothing',()=>{
  const a=manifest();const result=compareCustody(a,JSON.parse(JSON.stringify(a)));
  assert.equal(result.ok,true);
  assert.deepEqual(result.changes,[]);
});
test('comparison detects additions and removals separately',()=>{
  const result=compareCustody(manifest([file('a.js')]),manifest([file('b.js')]));
  assert.deepEqual(result.changes.map(x=>x.kind),['REMOVED','ADDED']);
});
test('comparison detects bytes, hash and state changes independently',()=>{
  const result=compareCustody(manifest(),manifest([file('index.html',{bytes:20,sha256:'b'.repeat(64),state:'CHANGED'})]));
  assert.ok(result.changes.some(x=>x.kind==='BYTES_CHANGED'));
  assert.ok(result.changes.some(x=>x.kind==='SHA256_CHANGED'));
  assert.ok(result.changes.some(x=>x.kind==='STATE_CHANGED'));
});
test('comparison detects metadata changes without disclosing unrelated text',()=>{
  const result=compareCustody(manifest(),manifest(undefined,{provenance:{...source(),licence:'MIT'}}));
  assert.ok(result.changes.some(x=>x.kind==='SOURCE_LICENCE_CHANGED'));
});
test('invalid later snapshot cannot masquerade as a clean comparison',()=>{
  const result=compareCustody(manifest(),manifest([file('bad.txt',{state:'YES'})]));
  assert.equal(result.ok,false);
  assert.equal(result.summary,null);
});
test('text parsing round-trips canonical JSON',()=>{
  const m=manifest();const serialized=serializeCustody(m);
  assert.equal(serialized.ok,true);
  const parsed=parseCustody(serialized.text);
  assert.equal(parsed.ok,true);
  assert.equal(parsed.manifest.buildId,'build-1');
});
test('parsing malformed JSON gives only issue codes',()=>{
  const result=parseCustody('{');
  assert.equal(result.ok,false);
  assert.equal(result.problems[0].code,'INVALID_JSON');
});
test('oversized JSON never reaches JSON.parse',()=>{
  const result=parseCustody(' '.repeat(CUSTODY_LIMITS.maxBytes+1));
  assert.ok(codes(result).includes('INPUT_LIMIT'));
});
test('serialization fails closed rather than emitting partial data',()=>{
  const result=serializeCustody(manifest([file('x.html',{sha256:null})]));
  assert.equal(result.ok,false);
  assert.equal(result.text,null);
});
