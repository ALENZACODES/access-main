import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveAssetReference, extractAssetReferences, inspectRawReferences,
  edgesFor, graphCustody, reachableAssetSummary,
} from './artifact-custody-links.mjs';
import { classifyPath } from './artifact-custody-core.mjs';

const digest='a'.repeat(64);
const provenance={source:'https://example.org/source',licence:'CC0-1.0',retrievedOn:'2026-11-19',tier:0};
const entry=(path,references=[],extra={})=>({path,kind:classifyPath(path),bytes:100,sha256:digest,
  state:'PRESENT',provenance:{...provenance},...(references.length?{references}:{}),...extra});
const make=(files)=>({version:1,buildId:'bundle',provenance:{...provenance},files});
const issues=result=>result.problems.map(x=>x.code);

test('same-directory stylesheet reference resolves in its parent',()=>{
  assert.deepEqual(resolveAssetReference('theme.css','assets/index.html'),{path:'assets/theme.css',code:null});
});
test('parent reference resolves only while staying within bundle root',()=>{
  assert.deepEqual(resolveAssetReference('../shared.css','assets/index.html'),{path:'shared.css',code:null});
  assert.equal(resolveAssetReference('../../shared.css','assets/index.html').code,'REFERENCE_UNSAFE');
});
test('absolute bundle-local reference discards leading slash',()=>{
  assert.equal(resolveAssetReference('/assets/app.js','pages/index.html').path,'assets/app.js');
});
test('query and fragment are not part of an asset filename',()=>{
  assert.equal(resolveAssetReference('main.js?v=10#part','index.html').path,'main.js');
  assert.equal(resolveAssetReference('a.svg#pin','index.html').path,'a.svg');
});
test('fragment-only anchors do not become assets',()=>{
  assert.deepEqual(resolveAssetReference('#settings','index.html'),{path:null,code:null});
});
test('empty links are not counted as reachable files',()=>{
  assert.deepEqual(resolveAssetReference('','index.html'),{path:null,code:null});
  assert.deepEqual(resolveAssetReference(' ','index.html'),{path:null,code:null});
});
test('remote stylesheet and script URLs are identified',()=>{
  for(const value of ['https://example.org/app.js','http://example.org/a.css',
    '//cdn.example.org/a.css','javascript:alert(1)','file:///secret']){
    assert.equal(resolveAssetReference(value,'index.html').code,'EXTERNAL_ASSET',value);
  }
});
test('encoded traversal is refused rather than decoded into a path',()=>{
  const result=resolveAssetReference('%2e%2e/app.js','index.html');
  assert.equal(result.code,'REFERENCE_UNSAFE');
});
test('backslashes and control chars are not valid local references',()=>{
  for(const value of ['a\\b.css','bad\nname','a\0b']){
    assert.equal(resolveAssetReference(value,'index.html').code,'REFERENCE_UNSAFE');
  }
});
test('HTML src and href references are extracted',()=>{
  const html='<link rel="stylesheet" href="/base.css"><script src="app.js"></script>';
  assert.deepEqual(extractAssetReferences(html,'index.html'),['app.js','base.css']);
});
test('image src and poster references are extracted',()=>{
  const html='<img src="images/a.png"><video poster="images/poster.png"></video>';
  assert.deepEqual(extractAssetReferences(html,'index.html'),['images/a.png','images/poster.png']);
});
test('CSS url references resolve relative to containing stylesheet',()=>{
  const css='@font-face{src:url("../fonts/site.woff2")}body{background:url(../images/bg.webp)}';
  assert.deepEqual(extractAssetReferences(css,'css/site.css'),['fonts/site.woff2','images/bg.webp']);
});
test('CSS @import is parsed as a dependency',()=>{
  const css='@import "base.css";@import url("other.css");';
  assert.deepEqual(extractAssetReferences(css,'css/theme.css'),['css/base.css','css/other.css']);
});
test('duplicate references collapse to one edge',()=>{
  const html='<img src="same.png"><img src="same.png"><img src="same.png">';
  assert.deepEqual(extractAssetReferences(html,'index.html'),['same.png']);
});
test('query variants reference the same byte asset',()=>{
  const html='<script src="app.js?a=1"></script><script src="app.js?a=2"></script>';
  assert.deepEqual(extractAssetReferences(html,'index.html'),['app.js']);
});
test('source sets include every candidate',()=>{
  const html='<img srcset="images/1.webp 1x, images/2.webp 2x">';
  assert.deepEqual(extractAssetReferences(html,'index.html'),['images/1.webp','images/2.webp']);
});
test('data URLs are not added as local files',()=>{
  assert.deepEqual(extractAssetReferences('<img src="data:image/png;base64,AAAA">','index.html'),[]);
});
test('the raw-reference checker identifies remote dependencies',()=>{
  const errors=inspectRawReferences('<script src="https://example.org/x.js"></script>','index.html');
  assert.ok(errors.some(x=>x.code==='EXTERNAL_ASSET'));
});
test('raw-reference checker has no fetch side effects',()=>{
  const content='<img src="//example.org/a.png">';
  const before=content;
  assert.equal(inspectRawReferences(content,'index.html').length,1);
  assert.equal(content,before);
});
test('raw-reference checker rejects invalid source type',()=>{
  assert.equal(inspectRawReferences(18,'index.html')[0].code,'SOURCE_NOT_TEXT');
});
test('edges follow the path sort order of their inputs',()=>{
  const m=make([entry('index.html',['b.js','a.js']),entry('a.js'),entry('b.js')]);
  const edges=edgesFor(m);
  assert.deepEqual(edges.map(x=>x.to),['b.js','a.js']);
});
test('minimal connected offline shell passes structural graph audit',()=>{
  const m=make([entry('index.html',['assets/a.js']),entry('assets/a.js')]);
  const result=graphCustody(m);
  assert.equal(result.ok,true);
  assert.deepEqual(result.reachable,['assets/a.js','index.html']);
  assert.deepEqual(result.orphans,[]);
});
test('unknown offline content never receives PRESENT status through the graph',()=>{
  const m=make([entry('index.html',['a.js']),entry('a.js',[],{state:'UNKNOWN',sha256:null})]);
  const result=graphCustody(m);
  assert.equal(result.ok,false);
  assert.ok(issues(result).includes('REFERENCE_NOT_PRESENT'));
  assert.equal(m.files[1].state,'UNKNOWN');
});
test('missing linked stylesheet fails closed',()=>{
  const m=make([entry('index.html',['missing.css'])]);
  const result=graphCustody(m);
  assert.equal(result.ok,false);
  assert.ok(issues(result).includes('REFERENCE_MISSING'));
});
test('missing entry HTML fails even when other assets exist',()=>{
  const result=graphCustody(make([entry('app.js')]));
  assert.equal(result.ok,false);
  assert.ok(issues(result).includes('OFFLINE_ENTRY_MISSING'));
});
test('root index and nested page indexes are both entrypoints',()=>{
  const result=graphCustody(make([entry('index.html'),entry('pages/index.html')]));
  assert.equal(result.ok,true);
  assert.deepEqual(result.roots,['index.html','pages/index.html']);
});
test('unreferenced fonts are warnings, not fabricated failures',()=>{
  const result=graphCustody(make([entry('index.html'),entry('unused.woff2')]));
  assert.equal(result.ok,true);
  assert.deepEqual(result.orphans,['unused.woff2']);
  assert.ok(issues(result).includes('UNREFERENCED_ASSET'));
});
test('a link to itself is flagged',()=>{
  const result=graphCustody(make([entry('index.html',['index.html'])]));
  assert.equal(result.ok,false);
  assert.ok(issues(result).includes('SELF_REFERENCE'));
});
test('mutual CSS imports create an explicit cycle finding',()=>{
  const result=graphCustody(make([entry('index.html',['a.css']),entry('a.css',['b.css']),
    entry('b.css',['a.css'])]));
  assert.equal(result.ok,false);
  assert.ok(issues(result).includes('REFERENCE_CYCLE'));
});
test('a chain of references produces deterministic reachability',()=>{
  const m=make([entry('c.js'),entry('index.html',['a.js']),entry('a.js',['b.js']),entry('b.js',['c.js'])]);
  const result=graphCustody(m);
  assert.equal(result.ok,true);
  assert.deepEqual(result.reachable,['a.js','b.js','c.js','index.html']);
});
test('graph cannot bypass a missing source licence',()=>{
  const m=make([entry('index.html')]);m.provenance.licence='Private';
  const result=graphCustody(m);
  assert.equal(result.ok,false);
  assert.ok(issues(result).includes('LICENCE_REQUIRED'));
});
test('graph rejects duplicate filenames before building edges',()=>{
  const result=graphCustody(make([entry('index.html'),entry('INDEX.html')]));
  assert.equal(result.ok,false);
  assert.ok(issues(result).includes('PATH_COLLISION'));
});
test('graph summary counts reachable bytes rather than all bundle bytes',()=>{
  const m=make([entry('index.html',['a.js'],{bytes:10}),entry('a.js',[],{bytes:20}),
    entry('extra.css',[],{bytes:50})]);
  const result=reachableAssetSummary(m);
  assert.equal(result.ok,true);
  assert.equal(result.summary.bytes,30);
  assert.equal(result.summary.totalFiles,3);
  assert.equal(result.summary.reachableFiles,2);
});
test('graph summary counts kinds without inventing asset uses',()=>{
  const m=make([entry('index.html',['a.css']),entry('a.css')]);
  assert.deepEqual(reachableAssetSummary(m).summary.byKind,{html:1,style:1});
});
test('cycle detection is insensitive to input file order',()=>{
  const a=entry('a.css',['b.css']);const b=entry('b.css',['a.css']);const index=entry('index.html',['a.css']);
  const first=graphCustody(make([index,a,b]));
  const second=graphCustody(make([b,index,a]));
  assert.deepEqual(first.problems.map(x=>x.code).sort(),second.problems.map(x=>x.code).sort());
});
test('a structurally valid graph does not change original records',()=>{
  const m=make([entry('index.html',['a.css']),entry('a.css')]);
  const clone=JSON.parse(JSON.stringify(m));
  graphCustody(m);
  assert.deepEqual(m,clone);
});

test('large linear graph does not overflow the JavaScript call stack',()=>{
  const files=[entry('index.html',['asset00000.js'])];
  for(let i=0;i<3000;i++){
    const name=`asset${String(i).padStart(5,'0')}.js`;
    const next=i===2999?[]:[`asset${String(i+1).padStart(5,'0')}.js`];
    files.push(entry(name,next));
  }
  const result=graphCustody(make(files));
  assert.equal(result.ok,true);
  assert.equal(result.reachable.length,3001);
});

test('large cycle is reported without recursive traversal',()=>{
  const files=[entry('index.html',['asset00000.js'])];
  for(let i=0;i<1800;i++){
    const name=`asset${String(i).padStart(5,'0')}.js`;
    const next=i===1799?['asset00000.js']:[`asset${String(i+1).padStart(5,'0')}.js`];
    files.push(entry(name,next));
  }
  const result=graphCustody(make(files));
  assert.equal(result.ok,false);
  assert.ok(issues(result).includes('REFERENCE_CYCLE'));
});
