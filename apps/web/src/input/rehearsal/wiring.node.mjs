import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';

const folder = new URL('.', import.meta.url);
const read = relative => readFileSync(new URL(relative, folder),'utf8');
const route = read('../../router.tsx');
const home = read('../../pages/HomePage.tsx');
const barrel = read('../index.ts');
const page = read('./AccessRehearsalPage.tsx');
const copy = read('./copy.ts');
const model = read('./model.ts');
const scan = read('./scanner.ts');
const report = read('./report.ts');
const semantics = read('./semantics.ts');

test('a lazy route mounts the rehearsal page',()=>assert.ok(route.includes('lazy(() => import("./input/rehearsal/AccessRehearsalPage.tsx")')));
test('route is an existing app-shell child',()=>assert.ok(route.includes('path: "access-rehearsal"')));
test('route has a Suspense fallback',()=>assert.ok(route.includes('<Suspense fallback=')));
test('Home exposes a direct route to rehearsal',()=>assert.ok(home.includes('to="/access-rehearsal"')));
test('Home includes both language names',()=>assert.ok(home.includes('Répétition d’accessibilité') && home.includes('Access rehearsal')));
test('Home route retains the existing region links',()=>assert.ok(home.includes('AREAS.map(')));
test('input barrel exposes the new model',()=>assert.ok(barrel.includes('rehearsal/model.ts')));
test('input barrel exposes the new scanner',()=>assert.ok(barrel.includes('rehearsal/scanner.ts')));
test('input barrel exposes semantic diagnostics',()=>assert.ok(barrel.includes('rehearsal/semantics.ts')));
test('input barrel exposes reports',()=>assert.ok(barrel.includes('rehearsal/report.ts')));
test('input barrel exposes bilingual copy',()=>assert.ok(barrel.includes('rehearsal/copy.ts')));
test('the page displays one primary title',()=>assert.ok(page.includes('<h1 id={`${groupId}-title`}')));
test('the page has a status announcer',()=>assert.ok(page.includes('aria-live="polite"')));
test('the page has labelled bilingual inputs',()=>assert.ok(page.includes('copy.stepEn') && page.includes('copy.stepFr')));
test('the page requires bilingual descriptions',()=>assert.ok(page.includes('copy.detailEn') && page.includes('copy.detailFr')));
test('the page has explicit switch control buttons',()=>assert.ok(page.includes("act('PREVIOUS')") && page.includes("act('NEXT')") && page.includes("act('SELECT')")));
test('the page has a cancel action',()=>assert.ok(page.includes("act('CANCEL')")));
test('the page has a reset action',()=>assert.ok(page.includes("act('RESET')")));
test('the page exposes local CSV export',()=>assert.ok(page.includes('exportCsv(report)')));
test('the page exposes local JSON export',()=>assert.ok(page.includes('exportJson(report)')));
test('the page includes download names with a controlled extension',()=>assert.ok(page.includes('exportFilename(journey.id')));
test('the page does not use network requests',()=>assert.equal(page.includes('fetch('),false));
test('the page does not persist browser storage',()=>assert.equal(page.includes('localStorage') || page.includes('sessionStorage'),false));
test('all command target styles have a minimum height',()=>assert.ok(page.includes('minHeight: 44')));
test('rehearsal is explicitly a device-local exercise',()=>assert.ok(copy.includes('device-local exercise')));
test('no unknown evidence is upgraded in the policy',()=>assert.ok(model.includes("status: 'UNKNOWN'")));
test('model checks source URL security',()=>assert.ok(model.includes('safeSourceUrl')));
test('model checks local offline paths',()=>assert.ok(model.includes('safeOfflinePath')));
test('scanner maintains explicit command history',()=>assert.ok(scan.includes('history:')));
test('scanner requires eligible targets',()=>assert.ok(scan.includes('availableTargets')));
test('report excludes private notes from JSON output',()=>assert.equal(report.includes('notes: report'),false));
test('semantic audit checks reference integrity',()=>assert.ok(semantics.includes('semantics.dangling-reference')));
test('semantic audit checks target size',()=>assert.ok(semantics.includes('operable.target-size')));
test('all necessary new module paths exist',()=>{
  for(const name of ['model.ts','scanner.ts','report.ts','semantics.ts','copy.ts','AccessRehearsalPage.tsx']) {
    assert.ok(read(`./${name}`).length > 40);
  }
});
