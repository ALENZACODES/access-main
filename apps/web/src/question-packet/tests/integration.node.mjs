import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url));
const project=resolve(here,'../../../../..');
const src=resolve(project,'apps/web/src');
const root=resolve(project,'package.json');
const read=(path)=>readFileSync(path,'utf8');
const ui=read(resolve(src,'question-packet/QuestionPacketPage.tsx'));
const router=read(resolve(src,'router.tsx'));
const home=read(resolve(src,'pages/HomePage.tsx'));
const pkg=JSON.parse(read(root));
test('route integration mounts question packet lazily',()=>{
 assert.ok(router.includes('lazy(() => import("./question-packet/QuestionPacketPage.tsx")'));
 assert.ok(router.includes('path: "question-packet"'));
});
test('route mount retains existing access rehearsal route',()=>assert.ok(router.includes('path: "access-rehearsal"')));
test('route mount retains places, help, offline and map',()=>{
 for(const token of ['path: "places"','path: "offline"','path: "help"','path: "map"'])assert.ok(router.includes(token),token);
});
test('home page links to new packet route',()=>assert.ok(home.includes('to="/question-packet"')));
test('home card uses EN and FR copy',()=>{
 assert.ok(home.includes('Accessibility questions packet'));
 assert.ok(home.includes('Fiche de questions sur l’accessibilité'));
});
test('question packet uses document-title hook',()=>assert.ok(ui.includes('useDocumentTitle(c.title)')));
test('question packet has accessible validation messages',()=>{
 assert.ok(ui.includes('StateNotice'));
 assert.ok(ui.includes('aria-live="polite"'));
});
test('question packet does not create network requests',()=>{
 assert.equal(/\bfetch\s*\(|XMLHttpRequest/.test(ui),false);
});
test('touch targets are set to >= 44 pixels',()=>{
 assert.ok(ui.includes('minHeight: 44'));
 assert.ok(ui.includes('minWidth: 44'));
});
test('new feature has a public barrel',()=>{
 const index=read(resolve(src,'question-packet/index.ts'));
 for(const item of ['model.ts','report.ts','copy.ts','history.ts','triage.ts','templates.ts','audit.ts','QuestionPacketPage.tsx'])assert.ok(index.includes(item),item);
});
test('all eight new suites registered without duplication',()=>{
 const names=['model','actions','copy','report','history','triage','templates','audit','integration'];
 const args=pkg.scripts['test:scripts'].split(' ');
 for(const name of names){const path=`apps/web/src/question-packet/tests/${name}.node.mjs`;
  assert.equal(args.filter(x=>x===path).length,1,path);
  assert.equal(existsSync(resolve(project,path)),true,path);
 }
});
test('main test registrations retained',()=>{
 const script=pkg.scripts['test:scripts'];
 for(const prefix of ['p20aj-evidence','p20aj-replay','p20am-browser','p20am-model','scripts/sync-lanes.test.mjs'])assert.ok(script.includes(prefix),prefix);
});
test('new question packet has complete local relative imports',()=>{
 const files=['QuestionPacketPage.tsx','model.ts','copy.ts','report.ts','history.ts','triage.ts','templates.ts','audit.ts','index.ts'];
 for(const file of files){
  const code=read(resolve(src,'question-packet',file));
  for(const match of code.matchAll(/from\s+['"](\.[^'"]+)['"]/g)){
   const path=resolve(src,'question-packet',match[1]);
   assert.ok(existsSync(path),`${file} imports missing ${match[1]}`);
  }
 }
});