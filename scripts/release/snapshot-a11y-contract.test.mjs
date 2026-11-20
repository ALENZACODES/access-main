import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import {
 SNAPSHOT_VERSION, LANGUAGES, ENVIRONMENTS, OUTCOMES, ROLES, KEY_ACTIONS, LIMITS,
 isObject, makeIssue, pointer, goodId, hasControls, goodText, validDay, goodUrl,
 goodRoute, goodAssetPath, frenchTextProblems, copyProblems, sensitiveFields,
 provenanceProblems, controlProblems, announcementProblems, captureProblems,
 inspectSnapshots, canonicalSnapshots, fingerprintSnapshots, parseSnapshots, serializeSnapshots,
} from './snapshot-a11y-contract.mjs';
import { TODAY, provenance, control, announcement, asset, capture, document, clone } from './snapshot-a11y-fixtures.mjs';
const check=x=>inspectSnapshots(x,{today:TODAY});
const codes=x=>x.problems.map(p=>p.code);
const contains=(x,code)=>assert.ok(codes(x).includes(code),`${code} expected in ${JSON.stringify(codes(x))}`);

test('contract version and vocabularies are stable',()=>{
 assert.equal(SNAPSHOT_VERSION,1);
 assert.deepEqual(LANGUAGES,['en','fr']);
 assert.ok(ENVIRONMENTS.includes('offline'));
 assert.deepEqual(OUTCOMES,['PASS','FAIL','UNKNOWN']);
 assert.ok(ROLES.includes('button'));
 assert.ok(KEY_ACTIONS.includes('tab'));
 assert.ok(LIMITS.maxBytes<50_000_000);
});
test('plain objects exclude null arrays and builtins',()=>{
 for(const x of [{},Object.create(null)])assert.equal(isObject(x),true);
 for(const x of [null,[],new Date(),0,'x',undefined])assert.equal(isObject(x),false);
});
test('issue factory supplies no private values',()=>{
 assert.deepEqual(makeIssue('INVALID','/a'),{code:'INVALID',path:'/a',severity:'block'});
});
test('JSON pointer escaping protects delimiters',()=>{
 assert.equal(pointer('a/b~c'),'a~1b~0c');
 assert.equal(pointer('identifier'),'identifier');
});
test('identifiers accept ordinary values but no protocol keys',()=>{
 for(const id of ['a','A-1','foo_bar','x:part','a.b'])assert.equal(goodId(id),true,id);
 for(const id of ['',null,9,'7abc','a/b','a b','constructor','prototype','__proto__','x'.repeat(150)])assert.equal(goodId(id),false,String(id));
});
test('control character detection uses code points',()=>{
 for(const x of ['x\0','x\t','x\n','x\x1f','x\x7f','x\ufffd'])assert.equal(hasControls(x),true);
 for(const x of ['', 'École fictive','A\u00a0: B','Oui\u202f!'])assert.equal(hasControls(x),false);
});
test('bounded strings are printable',()=>{
 for(const x of ['', ' ', '\n', 'a'.repeat(LIMITS.maxText+1),null,{}])assert.equal(goodText(x),false);
 assert.equal(goodText('Example source'),true);
});
test('date parser handles leap years precisely',()=>{
 for(const x of ['2024-02-29','2000-02-29',TODAY,'1900-01-01'])assert.equal(validDay(x),true,x);
 for(const x of ['2025-02-29','1900-02-29','2026-02-30','2026-13-01','2026-00-01','2026-11-31','0000-01-01','2026-1-1','today','2026-11-20T00:00:00Z',null])assert.equal(validDay(x),false,String(x));
});
test('URLs are HTTPS and carry no credentials or local address',()=>{
 assert.equal(goodUrl('https://example.org/source'),true);
 for(const x of ['http://example.org','javascript:alert(1)','file:///tmp/a','https://user:pass@example.org','https://localhost/a','https://127.0.0.1/a','https://[::1]/','https://example.org/#one','text',''])assert.equal(goodUrl(x),false,x);
});
test('routes are local application routes',()=>{
 for(const x of ['/','/offline','/data/status','/a-b'])assert.equal(goodRoute(x),true,x);
 for(const x of ['http://example.org','//example.org','a/b','/a/../b','/a?secret=1','/a#fragment','/\n',null])assert.equal(goodRoute(x),false,String(x));
});
test('asset paths reject escapes and URLs',()=>{
 for(const x of ['assets/a.js','index.html','fr/messages.json'])assert.equal(goodAssetPath(x),true,x);
 for(const x of ['/absolute','../parent','a/../b','a//b','a/./b','a\\b','https://example.org/file','a?b','a#b','','file:///a'])assert.equal(goodAssetPath(x),false,String(x));
});
test('French colon uses a no-break space',()=>{
 assert.deepEqual(frenchTextProblems('Source\u00a0: dossier'),[]);
 assert.ok(frenchTextProblems('Source : dossier').some(p=>p.code==='FR_COLON'));
});
test('French semicolon exclamation and question use narrow spaces',()=>{
 assert.deepEqual(frenchTextProblems('Oui\u202f! Non\u202f; pourquoi\u202f?'),[]);
 for(const x of ['Oui !','Non ;','Pourquoi ?','Oui\u00a0!'])assert.ok(frenchTextProblems(x).some(p=>p.code==='FR_NARROW'));
});
test('French guillemets use narrow no-break spaces',()=>{
 assert.deepEqual(frenchTextProblems('«\u202fcontenu\u202f»'),[]);
 assert.equal(frenchTextProblems('«contenu»').length,2);
 assert.equal(frenchTextProblems('«\u00a0contenu\u00a0»').length,2);
});
test('French apostrophes reject straight elisions',()=>{
 assert.equal(frenchTextProblems('l’appli').length,0);
 assert.ok(frenchTextProblems("l'appli").some(p=>p.code==='FR_APOSTROPHE'));
});
test('localised pairs require both languages and no extras',()=>{
 assert.deepEqual(copyProblems({en:'Example',fr:'Exemple'}),[]);
 for(const x of [null,{en:'Only'},{fr:'Seulement'},{en:'x',fr:'y',de:'z'},[]])assert.ok(copyProblems(x).length);
});
test('private scanner detects sensitive nested keys',()=>{
 const input={captures:[{token:'sensitive',state:{email:'user@example.org'}}]};
 const results=sensitiveFields(input);
 assert.ok(results.some(x=>x.path==='/captures/0/token'));
 assert.ok(results.some(x=>x.path==='/captures/0/state/email'));
 assert.equal(JSON.stringify(results).includes('sensitive'),false);
});
test('private scanner catches cycles',()=>{
 const x={id:'a'};x.self=x;
 assert.ok(sensitiveFields(x).some(p=>p.code==='CYCLE'));
});
test('private scanner catches depth limit without stack overflow',()=>{
 let x={};const root=x;
 for(let i=0;i<35;i++){x.child={};x=x.child;}
 assert.ok(sensitiveFields(root).some(p=>p.code==='DEPTH'));
});
test('provenance requires full source licence date and tier',()=>{
 assert.deepEqual(provenanceProblems(provenance(),'/p',TODAY),[]);
 const broken={};
 const found=provenanceProblems(broken,'/p',TODAY).map(p=>p.code);
 for(const code of ['SOURCE','LICENCE','RETRIEVED','TIER'])assert.ok(found.includes(code));
});
test('unsupported open-licence wording is rejected',()=>{
 assert.ok(provenanceProblems({...provenance(),licence:'open'},'/p',TODAY).length);
 assert.ok(provenanceProblems({...provenance(),licence:'All rights reserved'},'/p',TODAY).length);
});
test('future retrieval date is rejected against supplied clock',()=>{
 assert.ok(provenanceProblems({...provenance(),retrievedOn:'2026-11-21'},'/p',TODAY).some(p=>p.code==='RETRIEVED'));
});
test('missing tier is not guessed from source name',()=>{
 const p={...provenance(),tier:'UNKNOWN'};
 assert.ok(provenanceProblems(p,'/p',TODAY).some(x=>x.code==='TIER'));
});
test('provenance refuses unknown fields',()=>{
 assert.ok(provenanceProblems({...provenance(),note:'extra'},'/p',TODAY).some(x=>x.code==='PROVENANCE_EXTRA'));
});
test('valid control with measured bounds and keyboard evidence',()=>{
 assert.deepEqual(controlProblems(control(),'/control'),[]);
});
test('control names permit explicitly UNKNOWN but not empty',()=>{
 assert.deepEqual(controlProblems(control('c',{name:'UNKNOWN'}),'/c'),[]);
 assert.ok(controlProblems(control('c',{name:''}),'/c').some(x=>x.code==='NAME'));
});
test('control bounds permit UNKNOWN but not invalid numbers',()=>{
 assert.deepEqual(controlProblems(control('c',{bounds:{width:'UNKNOWN',height:48}}),'/c'),[]);
 for(const x of [-1,Infinity,NaN,'12px',null])assert.ok(controlProblems(control('c',{bounds:{width:x,height:44}}),'/c').some(p=>p.code==='BOUNDS_VALUE'));
});
test('keyboard controls require known action values',()=>{
 assert.ok(controlProblems(control('c',{keyboard:{enter:'MAYBE'}}),'/c').some(p=>p.code==='KEY_ACTION'));
 assert.ok(controlProblems(control('c',{keyboard:{navigate:'PASS'}}),'/c').some(p=>p.code==='KEY_ACTION'));
});
test('focus outcomes are tri-state, not booleans',()=>{
 assert.ok(controlProblems(control('c',{focusVisible:true}),'/c').some(p=>p.code==='FOCUS'));
 assert.ok(controlProblems(control('c',{tabReachable:false}),'/c').some(p=>p.code==='TAB_REACHABLE'));
});
test('control unknown keys are not silently ignored',()=>{
 assert.ok(controlProblems(control('c',{extra:true}),'/c').some(p=>p.code==='CONTROL_EXTRA'));
});
test('announcement records require spoken evidence state',()=>{
 assert.deepEqual(announcementProblems(announcement(),'/a'),[]);
 assert.deepEqual(announcementProblems(announcement('a',{text:'UNKNOWN',announced:'UNKNOWN'}),'/a'),[]);
 assert.ok(announcementProblems(announcement('a',{announced:true}),'/a').some(p=>p.code==='ANNOUNCEMENT_RESULT'));
});
test('announcement live roles are bounded',()=>{
 assert.ok(announcementProblems(announcement('a',{live:'unbounded'}),'/a').some(x=>x.code==='ANNOUNCEMENT_LIVE'));
});
test('capture accepts explicit complete synthetic observation',()=>{
 assert.deepEqual(captureProblems(capture(),'/c',TODAY),[]);
 assert.equal(check(document()).ok,true);
});
test('capture requires source even for UNKNOWN results',()=>{
 const x=capture('x',{provenance:{...provenance(),source:''},offlineShell:'UNKNOWN'});
 contains(check(document(x)),'SOURCE');
});
test('invalid capture route blocks record',()=>{
 contains(check(document(capture('x',{route:'https://example.org'}))),'ROUTE');
});
test('duplicate control IDs are rejected',()=>{
 contains(check(document(capture('x',{controls:[control('x'),control('x')]}))),'DUPLICATE_CONTROL');
});
test('duplicate announcement IDs are rejected',()=>{
 contains(check(document(capture('x',{announcements:[announcement('a'),announcement('a')]}))),'DUPLICATE_ANNOUNCEMENT');
});
test('duplicate capture IDs are rejected',()=>{
 contains(check(document(capture('x'),capture('x'))),'DUPLICATE_CAPTURE');
});
test('invalid asset path is not accepted',()=>{
 contains(check(document(capture('x',{assets:[asset('../escape')]}))),'ASSET');
});
test('unrecognized environment is rejected',()=>{
 contains(check(document(capture('x',{environment:'online-now'}))),'ENVIRONMENT');
});
test('missing controls or announcements arrays fail',()=>{
 contains(check(document(capture('x',{controls:null}))),'CONTROLS');
 contains(check(document(capture('x',{announcements:null}))),'ANNOUNCEMENTS');
});
test('document-level extra keys are rejected',()=>{
 contains(check({...document(),extra:1}),'DOCUMENT_EXTRA');
});
test('capture rejects extra keys rather than leaking',()=>{
 contains(check(document(capture('x',{extra:1}))),'CAPTURE_EXTRA');
});
test('capture count is bounded before full traversal',()=>{
 const many=Array.from({length:LIMITS.maxCaptures+1},(_,i)=>capture(`x${i}`));
 contains(check(document(...many)),'CAPTURE_LIMIT');
});
test('control and announcement counts are bounded',()=>{
 contains(check(document(capture('x',{controls:Array.from({length:LIMITS.maxControls+1},(_,i)=>control(`c${i}`))}))),'CONTROLS');
 contains(check(document(capture('x',{announcements:Array.from({length:LIMITS.maxAnnouncements+1},(_,i)=>announcement(`a${i}`))}))),'ANNOUNCEMENTS');
});
test('canonical order is stable across input order',()=>{
 const a=document(capture('b'),capture('a'));
 const b=document(capture('a'),capture('b'));
 assert.deepEqual(canonicalSnapshots(a),canonicalSnapshots(b));
});
test('serialization preserves UNKNOWN and provenance',()=>{
 const x=document(capture('x',{offlineShell:'UNKNOWN'}));
 const out=serializeSnapshots(x,{today:TODAY});
 assert.equal(out.ok,true);
 assert.ok(out.text.includes('"UNKNOWN"'));
 assert.ok(out.text.includes('"licence"'));
});
test('fingerprints ignore capture ordering',()=>{
 const a=fingerprintSnapshots(document(capture('b'),capture('a')));
 const b=fingerprintSnapshots(document(capture('a'),capture('b')));
 assert.equal(a.sha256,b.sha256);
 assert.equal(a.sha256.length,64);
});
test('fingerprints change on evidence changes',()=>{
 const a=fingerprintSnapshots(document()).sha256;
 const b=fingerprintSnapshots(document(capture('sample-en',{controls:[control('submit',{focusVisible:'FAIL'})]}))).sha256;
 assert.notEqual(a,b);
});
test('invalid fingerprint rejects without manufacturing digest',()=>{
 const x=fingerprintSnapshots(document(capture('x',{provenance:null})));
 assert.equal(x.ok,false);assert.equal(x.sha256,null);
});
test('parse accepts valid JSON and rejects malformed input',()=>{
 const good=parseSnapshots(JSON.stringify(document()),{today:TODAY});
 assert.equal(good.ok,true);
 assert.equal(parseSnapshots('{').ok,false);
 assert.equal(parseSnapshots('').ok,false);
});
test('parse refuses oversized payload without allocating parsed result',()=>{
 const text='x'.repeat(LIMITS.maxBytes+1);
 const out=parseSnapshots(text);
 assert.equal(out.ok,false);assert.equal(out.value,null);
 assert.equal(Buffer.byteLength(text)>LIMITS.maxBytes,true);
});
test('parse refuses boolean substitute for UNKNOWN',()=>{
 const x=clone(document());x.captures[0].offlineShell=true;
 assert.equal(parseSnapshots(JSON.stringify(x)).ok,false);
});
test('serialize refuses invalid data',()=>{
 const x=serializeSnapshots(document(capture('x',{environment:'maybe'})));
 assert.equal(x.ok,false);assert.equal(x.text,null);
});
test('input arrays do not become documents',()=>{
 for(const value of [null,{},[],true,42])assert.equal(inspectSnapshots(value).ok,false);
});
