import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_OPTIONS, assessJourney } from './model.ts';
import { initialScan, replayScan, targetsForJourney } from './scanner.ts';
import {
  EXPORT_FIELDS, comparison, coverage, csvCell, csvLine, detectRegressions,
  exportCsv, exportFilename, exportHandoff, exportJson, exportJsonLines,
  inspectSession, limitedSummary, safeCell, safeJsonReport, sanitizeReport,
  validateExportRequest,
} from './report.ts';

const copy = (en = 'Access entrance', fr = 'Entrée accessible') => ({ en, fr });
const source = (changes = {}) => ({ name: 'Open catalogue', url: 'https://example.org/data', licence: 'Open licence', collectedOn: '2026-11-18', tier: 'PRIMARY', ...changes });
const cached = (changes = {}) => ({ state: 'stored', path: '/offline/a.json', savedOn: '2026-11-19', ...changes });
const step = (changes = {}) => ({ id: 'first-step', kind: 'entrance', label: copy(), detail: copy('Use the door', 'Utiliser la porte'), access: 'supported',
  source: source(), offline: cached(), sequence: 0, needsReview: false, ...changes });
const journey = (changes = {}) => ({ id: 'journey', name: copy('My trip', 'Mon trajet'), createdOn: '2026-11-19', steps: [step()], ...changes });
const observations = (changes = {}) => ({ target: 'first-step',key:'Tab',before:null,after:'first-step',activated:false,visible:true,width:44,height:44,contained:true,...changes });
const announcements = (changes = {}) => ({ id: 'notice', locale: 'en', text: 'Local review', status: 'UNKNOWN',politeness:'polite',sequence:0,...changes });
const makeSession = (changes = {}) => {
  const j = journey();
  return { journey: j, locale: 'en', targets: targetsForJourney(j,'en'), keyboard: [observations()],
    announcements: [announcements()], scan: { controls: initialScan(), selected: null, issues: [] }, notes: '', ...changes };
};
const makeReport = changes => inspectSession(makeSession(changes),DEFAULT_OPTIONS);
const codes = list => list.map(f => f.code);
const has = (list, code) => assert.ok(codes(list).includes(code), `${code} absent`);

test('report has explicit status', () => assert.equal(makeReport().status, 'READY'));
test('report preserves locale', () => assert.equal(makeReport().locale, 'en'));
test('report preserves journey label', () => assert.equal(makeReport().name, 'My trip'));
test('report includes one step decision', () => assert.equal(makeReport().steps.length, 1));
test('report includes selection snapshot', () => assert.equal(makeReport().snapshot.controls, 1));
test('clean report has zero findings', () => assert.deepEqual(makeReport().findings, []));
test('clean report has READY keyboard status', () => assert.equal(makeReport().keyboardStatus,'READY'));
test('no keyboard observations keeps keyboard status unknown', () => assert.equal(makeReport({keyboard:[]}).keyboardStatus,'UNKNOWN'));
test('no keyboard observations keeps overall status unknown', () => assert.equal(makeReport({keyboard:[]}).status,'UNKNOWN'));
test('bad target label holds overall status', () => assert.equal(makeReport({targets:[{...makeSession().targets[0],name:''}]}).status,'HOLD'));
test('missing semantic target holds status', () => assert.equal(makeReport({keyboard:[observations({target:'other'})]}).status,'HOLD'));
test('small target holds status', () => assert.equal(makeReport({keyboard:[observations({width:20})]}).status,'HOLD'));
test('hidden focus holds status', () => assert.equal(makeReport({keyboard:[observations({visible:false})]}).status,'HOLD'));
test('missing announcement text holds status', () => assert.equal(makeReport({announcements:[announcements({text:''})]}).status,'HOLD'));
test('duplicate announcement identifier holds status', () => assert.equal(makeReport({announcements:[announcements(),announcements({sequence:1})]}).status,'HOLD'));
test('report collects source evidence findings', () => {
  const j=journey({steps:[step({source:source({url:'data:text/plain,example'})})]});
  has(inspectSession(makeSession({journey:j}),DEFAULT_OPTIONS).findings,'source.url');
});
test('report preserves unknown evidence', () => {
  const j=journey({steps:[step({access:'unknown'})]});
  assert.equal(inspectSession(makeSession({journey:j}),DEFAULT_OPTIONS).status,'UNKNOWN');
});
test('report preserves unsupported evidence as HOLD', () => {
  const j=journey({steps:[step({access:'unsupported'})]});
  assert.equal(inspectSession(makeSession({journey:j}),DEFAULT_OPTIONS).status,'HOLD');
});
test('overlong notes produce a review finding', () => has(makeReport({notes:'a'.repeat(2001)}).findings,'notes.length'));
test('normal notes do not create findings', () => assert.deepEqual(makeReport({notes:'A local comment'}).findings,[]));
test('scan issues enter final report', () => {
  const scan = replayScan(['NEXT'],[]);
  has(makeReport({scan}).findings,'scan.empty');
});
test('selected unknown step creates review issue', () => {
  const j=journey({steps:[step({access:'unknown'})]});
  has(inspectSession(makeSession({journey:j,scan:{controls:initialScan(),selected:'first-step',issues:[]}}),DEFAULT_OPTIONS).findings,'selection.unknown');
});
test('report does not mutate source session', () => {
  const s=makeSession(); const before=JSON.stringify(s);
  inspectSession(s,DEFAULT_OPTIONS);
  assert.equal(JSON.stringify(s),before);
});

for (const [label, before, after, expected] of [
  ['same step',journey(),journey(),'RETAIN'],
  ['added step',journey({steps:[]}),journey(),'ADD'],
  ['retired step',journey(),journey({steps:[]}), 'RETIRE'],
  ['kind change',journey(),journey({steps:[step({kind:'exit'})]}),'REPLACE'],
  ['step order',journey(),journey({steps:[step({sequence:3})]}),'REPLACE'],
  ['access change',journey(),journey({steps:[step({access:'limited'})]}),'REPLACE'],
  ['label change',journey(),journey({steps:[step({label:copy('New title','Nouveau titre')})]}),'REPLACE'],
  ['detail change',journey(),journey({steps:[step({detail:copy('New detail','Nouveau détail')})]}),'REPLACE'],
  ['source date change',journey(),journey({steps:[step({source:source({collectedOn:'2026-11-19'})})]}),'REPLACE'],
  ['source URL change',journey(),journey({steps:[step({source:source({url:'https://example.org/other'})})]}),'REPLACE'],
  ['source tier change',journey(),journey({steps:[step({source:source({tier:'SECONDARY'})})]}),'REPLACE'],
  ['licence change',journey(),journey({steps:[step({source:source({licence:'CC BY-SA 4.0'})})]}),'REPLACE'],
  ['cache path change',journey(),journey({steps:[step({offline:cached({path:'/offline/b.json'})})]}),'REPLACE'],
  ['cache state change',journey(),journey({steps:[step({offline:{state:'absent'}})]}),'REPLACE'],
  ['cache date change',journey(),journey({steps:[step({offline:cached({savedOn:'2026-11-18'})})]}),'REPLACE'],
  ['manual review change',journey(),journey({steps:[step({needsReview:true})]}),'REPLACE'],
  ['unknown status after update',journey(),journey({steps:[step({access:'unknown'})]}),'REVIEW'],
  ['unknown status before update',journey({steps:[step({access:'unknown'})]}),journey(),'REVIEW'],
]) {
  test(`comparison action for ${label}`,()=>assert.equal(comparison(before,after)[0].action,expected));
}
test('comparison emits sorted stable identifiers',()=>{
  const before=journey({steps:[step({id:'z'}),step({id:'a',sequence:1})]});
  const result=comparison(before,journey({steps:[]}));
  assert.deepEqual(result.map(x=>x.id),['a','z']);
});
test('comparison gives explicit reasons for source changes',()=>{
  const result=comparison(journey(),journey({steps:[step({source:source({tier:'COMMUNITY'})})]}));
  assert.ok(result[0].reasons.includes('source.changed'));
});
test('comparison does not modify either journey',()=>{
  const a=journey(),b=journey({steps:[step({access:'unknown'})]});
  const snapshot=JSON.stringify([a,b]);comparison(a,b);
  assert.equal(JSON.stringify([a,b]),snapshot);
});
test('change detection finds access reduction',()=>has(detectRegressions(journey(),journey({steps:[step({access:'unsupported'})]})),'change.access-reduced'));
test('change detection finds older source revision',()=>has(detectRegressions(journey(),journey({steps:[step({source:source({collectedOn:'2026-11-17'})})]})),'change.source-regressed'));
test('change detection finds older cached copy',()=>has(detectRegressions(journey(),journey({steps:[step({offline:cached({savedOn:'2026-11-18'})})]})),'change.cache-regressed'));
test('review clearance without source update requires review',()=>has(detectRegressions(journey({steps:[step({needsReview:true})]}),journey()),'change.review-cleared-without-source'));
test('missing previous step does not create regression',()=>assert.deepEqual(detectRegressions(journey({steps:[]}),journey()),[]));
test('unchanged journey has no regression',()=>assert.deepEqual(detectRegressions(journey(),journey()),[]));

for (const [label,input,expected] of [
  ['plain text','Normal title','Normal title'],
  ['null',null,''],
  ['undefined',undefined,''],
  ['formula equals','=1+1',"'=1+1"],
  ['formula plus','+SUM(A1)',"'+SUM(A1)"],
  ['formula minus','-1+2',"'-1+2"],
  ['formula at','@cmd',"'@cmd"],
  ['leading whitespace formula','  =42',"'=42"],
  ['line feed','a\nb','a b'],
  ['carriage return','a\rb','a b'],
  ['tab','a\tb','a b'],
  ['null byte','a\u0000b','ab'],
  ['French text','Entrée accessible','Entrée accessible'],
]) {
  test(`CSV safe cell ${label}`,()=>assert.equal(safeCell(input),expected));
}
test('CSV quote doubles embedded quotes',()=>assert.equal(csvCell('a"b'),'"a""b"'));
test('CSV row uses quoted cells',()=>assert.equal(csvLine(['a','b']),'"a","b"'));
test('CSV row preserves commas',()=>assert.equal(csvLine(['a,b']),'"a,b"'));
test('CSV row neutralizes formula injection',()=>assert.equal(csvLine(['=1+1']),'"\'=1+1"'));
test('export headers are stable',()=>assert.deepEqual(EXPORT_FIELDS,['category','path','severity','code','status','locale']));
test('CSV export begins with header',()=>assert.ok(exportCsv(makeReport()).startsWith('"category"')));
test('CSV export has CRLF rows',()=>assert.ok(exportCsv(makeReport()).includes('\r\n')));
test('CSV export includes status column',()=>assert.ok(exportCsv(makeReport()).includes('"READY"')));
test('CSV export includes diagnostic rows',()=>assert.ok(exportCsv(makeReport({keyboard:[]})).includes('"no-findings"')));
test('CSV export excludes private step details',()=>assert.equal(exportCsv(makeReport()).includes('Use the door'),false));
test('JSON report contains status field',()=>assert.equal(JSON.parse(exportJson(makeReport())).status,'READY'));
test('JSON report contains step statuses',()=>assert.equal(JSON.parse(exportJson(makeReport())).steps[0].status,'READY'));
test('JSON report excludes private journey label',()=>assert.equal(exportJson(makeReport()).includes('My trip'),false));
test('JSON report excludes descriptions',()=>assert.equal(exportJson(makeReport()).includes('Use the door'),false));
test('JSONL clean report is empty',()=>assert.equal(exportJsonLines(makeReport()),''));
test('JSONL output includes one entry per finding',()=>{
  const report=makeReport({keyboard:[observations({visible:false})]});
  assert.equal(exportJsonLines(report).trim().split('\n').length,report.findings.length);
});
test('JSONL output contains code and locale',()=>{
  const item=JSON.parse(exportJsonLines(makeReport({keyboard:[observations({visible:false})]})).trim());
  assert.equal(item.locale,'en'); assert.equal(item.code,'keyboard.not-visible');
});
test('JSON output is deterministic',()=>assert.equal(exportJson(makeReport()),exportJson(makeReport())));
test('CSV output is deterministic',()=>assert.equal(exportCsv(makeReport()),exportCsv(makeReport())));
test('handoff stores local journey title only as explicit output',()=>assert.equal(exportHandoff(makeReport()).title,'My trip'));
test('handoff counts review findings',()=>assert.equal(exportHandoff(makeReport({notes:'a'.repeat(2001)})).summary.review,1));
test('handoff counts error findings',()=>assert.equal(exportHandoff(makeReport({keyboard:[observations({visible:false})]})).summary.error,1));
test('handoff codes are sorted',()=>{
  const list=exportHandoff(makeReport({keyboard:[observations({visible:false,width:20})]})).checks;
  assert.deepEqual(list,[...list].sort());
});
for (const format of ['csv','json','jsonl']) {
  test(`filename uses ${format} extension`,()=>assert.equal(exportFilename('local-test','en',format),`access-rehearsal-local-test-en.${format}`));
}
test('French report filename includes fr locale',()=>assert.ok(exportFilename('local-test','fr','csv').includes('-fr.')));
test('unsafe file identifier is rejected',()=>assert.throws(()=>exportFilename('../private','en','json'),TypeError));
test('invalid file language is rejected',()=>assert.throws(()=>exportFilename('safe','de','json'),TypeError));
test('invalid file format is rejected',()=>assert.throws(()=>exportFilename('safe','en','exe'),TypeError));
test('coverage counts total steps',()=>assert.equal(coverage(makeReport()).total,1));
test('coverage counts ready steps',()=>assert.equal(coverage(makeReport()).ready,1));
test('coverage counts no held steps',()=>assert.equal(coverage(makeReport()).hold,0));
test('coverage counts unknown steps',()=>{
  const j=journey({steps:[step({access:'unknown'})]});
  assert.equal(coverage(inspectSession(makeSession({journey:j}),DEFAULT_OPTIONS)).unknown,1);
});
test('coverage counts errors',()=>assert.equal(coverage(makeReport({keyboard:[observations({visible:false})]})).errors,1));
test('coverage counts reviews',()=>assert.equal(coverage(makeReport({notes:'a'.repeat(2001)})).reviews,1));
test('limited summary does not expose description',()=>assert.equal(limitedSummary(makeReport()).includes('Use the door'),false));
test('limited summary includes status',()=>assert.ok(limitedSummary(makeReport()).includes('READY')));
test('safe JSON report contains snapshot',()=>assert.equal(safeJsonReport(makeReport()).snapshot.controls,1));
test('sanitized report omits title',()=>assert.equal(sanitizeReport(makeReport()).name,''));
test('sanitized report preserves status',()=>assert.equal(sanitizeReport(makeReport()).status,'READY'));
for (const [label,request,expected] of [
  ['ordinary CSV',{id:'local',locale:'en',format:'csv'},true],
  ['French JSON',{id:'local',locale:'fr',format:'json'},true],
  ['JSONL',{id:'local',locale:'en',format:'jsonl'},true],
  ['missing ID',{locale:'en',format:'csv'},false],
  ['invalid locale',{id:'local',locale:'es',format:'csv'},false],
  ['invalid format',{id:'local',locale:'en',format:'exe'},false],
  ['invalid name',{id:'local',locale:'en',format:'csv',name:'\n'},false],
  ['null',null,false],
  ['number',4,false],
]) {
  test(`export request: ${label}`,()=>assert.equal(validateExportRequest(request),expected));
}
test('report session does not write source objects',()=>{
  const s=makeSession();const before=JSON.stringify(s);
  inspectSession(s,DEFAULT_OPTIONS);
  assert.equal(JSON.stringify(s),before);
});
test('assessment aligns report readiness with supplied evidence',()=>{
  const s=makeSession();
  assert.equal(inspectSession(s,DEFAULT_OPTIONS).sourceStatus,assessJourney(s.journey,DEFAULT_OPTIONS).status);
});
