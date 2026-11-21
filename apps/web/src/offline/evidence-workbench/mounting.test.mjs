import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const router=readFileSync(new globalThis.URL('../../router.tsx',import.meta.url),'utf8');
const page=readFileSync(new globalThis.URL('./EvidenceWorkbench.tsx',import.meta.url),'utf8');
const model=readFileSync(new globalThis.URL('./model.ts',import.meta.url),'utf8');
const analysis=readFileSync(new globalThis.URL('./analysis.ts',import.meta.url),'utf8');
const ops=readFileSync(new globalThis.URL('./operations.ts',import.meta.url),'utf8');
const report=readFileSync(new globalThis.URL('./export.ts',import.meta.url),'utf8');

test('offline route retains the original pack route contract',()=>{
 assert.match(router,/path: "offline"/u);
 assert.match(router,/OfflineWithEvidenceWorkbench/u);
});
test('the existing offline pack component remains mounted',()=>{
 assert.match(router,/<OfflinePackPage\s*\/>/u);
});
test('the workbench is loaded with dynamic import',()=>{
 assert.match(router,/lazy\(\(\) => import\("\.\/offline\/evidence-workbench\/EvidenceWorkbench\.tsx"\)/u);
});
test('the workbench does not import itself during initial rendering',()=>{
 assert.doesNotMatch(router,/^import \{ EvidenceWorkbench \} from/mu);
});
test('the workbench is only rendered after opening',()=>{
 assert.match(router,/\{open \? <Suspense/u);
});
test('the workbench has a local control with expanded state',()=>{
 assert.match(router,/aria-expanded=\{open\}/u);
});
test('the open control identifies the content it opens',()=>{
 assert.match(router,/aria-controls="offline-evidence-workbench-host"/u);
 assert.match(router,/id="offline-evidence-workbench-host"/u);
});
test('the open and close labels exist in English',()=>{
 assert.match(router,/Open workbench/u);
 assert.match(router,/Close workbench/u);
});
test('the open and close labels exist in French',()=>{
 assert.match(router,/Ouvrir l’atelier/u);
 assert.match(router,/Fermer l’atelier/u);
});
test('the mount button has a minimum touch target size',()=>{
 assert.match(router,/minWidth: 44, minHeight: 44/u);
});
test('the mount retains the existing default route',()=>{
 assert.match(router,/<HomePage\s*\/>/u);
});
test('the mount retains the existing developer route',()=>{
 assert.match(router,/path: "dev\/narrow"/u);
});
test('the mount retains the existing map route',()=>{
 assert.match(router,/path: "map"/u);
});
test('the mount does not replace the existing offline region package',()=>{
 assert.match(router,/routePage\("\/offline"/u);
});
test('the workbench is announced with a visible heading',()=>{
 assert.match(page,/<h2 id="local-evidence-workbench">/u);
});
test('the workbench has an identifiable section',()=>{
 assert.match(page,/data-testid="offline-evidence-workbench"/u);
});
test('form submission prevents unintended navigation',()=>{
 assert.match(page,/event\.preventDefault\(\);save\(\);/u);
});
test('form input labels wrap inputs or selects',()=>{
 assert.match(page,/<label>\{w\.source\}<input/u);
 assert.match(page,/<label>\{w\.licence\}<input/u);
 assert.match(page,/<label>\{w\.tier\}<select/u);
});
test('date entry is bounded by today',()=>{
 assert.match(page,/type="date" value=\{current\.retrievedOn\} max=\{today\}/u);
});
test('the record description has a maximum input length',()=>{
 assert.match(page,/value=\{current\.label\} maxLength=\{120\}/u);
});
test('the source input has a length limit',()=>{
 assert.match(page,/value=\{current\.source\} maxLength=\{400\}/u);
});
test('the licence input has a length limit',()=>{
 assert.match(page,/value=\{current\.licence\} maxLength=\{120\}/u);
});
test('the note editor limits its free-form text length',()=>{
 assert.match(page,/value=\{current\.note\} maxLength=\{1200\}/u);
});
test('there is no automatic upload behavior',()=>{
 assert.doesNotMatch(page,/fetch\(|XMLHttpRequest|sendBeacon/u);
});
test('there is no scheduled background workflow',()=>{
 assert.doesNotMatch(page,/setInterval\(|setTimeout\(|cron|serviceWorker\.register/u);
});
test('export uses an explicit button action',()=>{
 assert.match(page,/onClick=\{download\}>\{w\.download\}/u);
});
test('export does not silently send data to a server',()=>{
 assert.doesNotMatch(page,/axios\.|http\.post|navigator\.sendBeacon/u);
});
test('file import is explicitly chosen by the user',()=>{
 assert.match(page,/type="file" accept="application\/json,\.json"/u);
});
test('file import performs contract validation',()=>{
 assert.match(page,/parseDocument\(await file\.text\(\),today\)/u);
});
test('the file input is labelled for screen readers',()=>{
 assert.match(page,/aria-label=\{w\.read\}/u);
});
test('the editor heading receives focus on entry',()=>{
 assert.match(page,/formHeading\.current\?\.focus\(\)/u);
});
test('the editor includes a resettable cancel control',()=>{
 assert.match(page,/onClick=\{\(\)=>setCurrent\(null\)\}>\{w\.cancel\}/u);
});
test('the clear button requires an explicit follow-up choice',()=>{
 assert.match(page,/setClearPrompt\(true\)/u);
 assert.match(page,/\{clearPrompt&&/u);
});
test('cancelling clear returns focus to the initiating control',()=>{
 assert.match(page,/clearTrigger\.current\?\.focus\(\)/u);
});
test('the workbench reports filter results in a status region',()=>{
 assert.match(page,/<p role="status">\{w\.filtered\}/u);
});
test('import outcomes use polite live feedback',()=>{
 assert.match(page,/aria-live="polite"/u);
});
test('filter inputs have visible labels',()=>{
 assert.match(page,/<label>\{w\.search\}<input/u);
 assert.match(page,/<label>\{w\.feature\}<select/u);
 assert.match(page,/<label>\{w\.decision\}<select/u);
});
test('the page never stores personal notes in localStorage by default',()=>{
 assert.doesNotMatch(page,/localStorage\.|sessionStorage\.|indexedDB\.open\(/u);
});
test('the page explicitly explains storage limitations in both languages',()=>{
 assert.match(page,/Nothing is transmitted or automatically saved/u);
 assert.match(page,/Aucune donnée n’est transmise ni enregistrée automatiquement/u);
});
test('French open control does not use ASCII apostrophe',()=>{
 assert.doesNotMatch(router,/Ouvrir l'atelier/u);
});
test('French UI caution retains the uppercase UNKNOWN token',()=>{
 assert.match(page,/UNKNOWN reste UNKNOWN/u);
});
test('the form includes all required provenance controls',()=>{
 for(const field of ['source','licence','retrievedOn','tier']){
  assert.ok(page.includes(field),field);
 }
});
test('the form has human review decisions separate from status',()=>{
 assert.match(page,/DECISIONS\.map/u);
 assert.match(page,/STATES\.map/u);
});
test('the form does not provide accessibility certification controls',()=>{
 assert.doesNotMatch(page,/certify accessible|endorsement checkbox|benefits eligibility/iu);
});
test('all primary workbench buttons inherit a 44 pixel target',()=>{
 assert.match(page,/const BUTTON_STYLE=\{minHeight:44,minWidth:44\}/u);
});
test('the evidence report has a screen-reader heading hierarchy',()=>{
 assert.match(report,/<h1>/u);
 assert.match(report,/<h2 id="records">/u);
 assert.match(report,/<h3>/u);
});
test('the export report includes keyboard-visible focus',()=>{
 assert.match(report,/:focus-visible/u);
});
test('the export report does not dynamically request remote media',()=>{
 assert.doesNotMatch(report,/fetch\(|XMLHttpRequest|<script src=/u);
});
test('all export report user strings pass through HTML escaping',()=>{
 assert.match(report,/escapeHtml\(item\.source\)/u);
 assert.match(report,/escapeHtml\(item\.code\)/u);
});
test('the data contract rejects extra fields by default',()=>{
 assert.match(model,/UNKNOWN_FIELD/u);
});
test('the data contract does not support a guaranteed-access field',()=>{
 assert.doesNotMatch(model,/guaranteedAccessible|officiallyApproved/u);
});
test('the review engine can remove and edit without network access',()=>{
 assert.match(ops,/updateWorkspace/u);
 assert.doesNotMatch(ops,/fetch\(|XMLHttpRequest/u);
});
test('coverage returns UNKNOWN rather than a guessed place fact',()=>{
 assert.match(analysis,/if\(rows\.length===0\)return UNKNOWN/u);
});
test('the workbench can be fully closed without network state',()=>{
 assert.match(router,/setOpen\(value => !value\)/u);
});
test('the user must click before the async editor chunk renders',()=>{
 assert.match(router,/\{open \? <Suspense fallback=/u);
});
test('no new release budget gate or workaround is introduced',()=>{
 assert.doesNotMatch(router,/check-install-budget|globIgnores|INSTALL_BUDGET/u);
});
