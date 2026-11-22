import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultControl, defaultProject, safeCsvCell } from './model.ts';
import { initialMachine, replay } from './engine.ts';
import {
  HEADERS, buildHandoff, buildReport, compareReports, csvLine,
  exportCsv, exportHandoff, exportJson, exportJsonl, exportSummary,
  reportIssues, reportStats, safeFilename, summarizeReview,
} from './report.ts';
const source=()=>({title:'Example catalogue',url:'https://example.org/catalogue',licence:'Open licence',accessed:'2026-11-18'});
const control=(id='first',changes={})=>({...defaultControl(id),evidence:'DOCUMENTED',source:source(),reviewed:true,...changes});
const project=(controls=[control()])=>({id:'practice',title:{en:'Practice',fr:'Essai'},locale:'en',controls,focusOrder:controls.map(x=>x.id)});
const report=(p=project(),events=['NEXT'])=>buildReport(p,replay(p,events));
const codes=(list)=>list.map(x=>x.code);
const has=(list,code)=>assert.ok(codes(list).includes(code),`${code} absent`);

test('header exposes severity',()=>assert.equal(HEADERS[0],'severity'));
test('header exposes code',()=>assert.equal(HEADERS[1],'code'));
test('header exposes path',()=>assert.equal(HEADERS[2],'path'));
test('header has three columns',()=>assert.equal(HEADERS.length,3));
test('report version is one',()=>assert.equal(report().version,1));
test('report ID is project ID',()=>assert.equal(report().id,'practice'));
test('report locale is English',()=>assert.equal(report().locale,'en'));
test('report counts one control',()=>assert.equal(report().controlCount,1));
test('report counts one focus stop',()=>assert.equal(report().focusStops,1));
test('report counts one switch action',()=>assert.equal(report().eventCount,1));
test('report counts one accepted action',()=>assert.equal(report().accepted,1));
test('report counts zero rejected actions',()=>assert.equal(report().rejected,0));
test('report counts one source',()=>assert.equal(report().sourceCount,1));
test('report counts zero unknown controls',()=>assert.equal(report().unknownCount,0));
test('report has no findings with clean control',()=>assert.deepEqual(report().findings,[]));
test('report without browser snapshot stays UNKNOWN',()=>assert.equal(report().decision,'UNKNOWN'));
test('empty project has UNKNOWN status',()=>assert.equal(report(defaultProject(),[]).decision,'UNKNOWN'));
test('empty project counts no source',()=>assert.equal(report(defaultProject(),[]).sourceCount,0));
test('empty project counts no focus',()=>assert.equal(report(defaultProject(),[]).focusStops,0));
test('empty project counts no controls',()=>assert.equal(report(defaultProject(),[]).controlCount,0));
test('unknown source remains unknown',()=>assert.equal(report(project([defaultControl()])).unknownCount,1));
test('unknown source does not produce READY',()=>assert.notEqual(report(project([defaultControl()])).decision,'READY'));
test('small target produces REVIEW',()=>assert.equal(report(project([control('first',{width:20})])).decision,'REVIEW'));
test('small target appears in findings',()=>has(report(project([control('first',{width:20})])).findings,'control.target-size'));
test('invalid source produces REVIEW',()=>assert.equal(report(project([control('first',{source:{...source(),url:'data:text/plain,example'}})])).decision,'REVIEW'));
test('missing reference produces REVIEW',()=>assert.equal(report(project([control('first',{refs:['missing']})])).decision,'REVIEW'));
test('repeated control ID produces REVIEW',()=>assert.equal(report(project([control('first'),control('first')])).decision,'REVIEW'));
test('invalid title produces REVIEW',()=>assert.equal(report({...project(),title:{en:'',fr:'Essai'}}).decision,'REVIEW'));
test('invalid project locale produces REVIEW',()=>assert.equal(report({...project(),locale:'de'}).decision,'REVIEW'));
test('missing source produces unknown count',()=>assert.equal(report(project([control('first',{source:null,evidence:'UNKNOWN'})])).unknownCount,1));
test('unreviewed observation counts unknown',()=>assert.equal(report(project([control('first',{reviewed:false})])).unknownCount,1));
test('two controls increment count',()=>assert.equal(report(project([control('first'),control('second')])).controlCount,2));
test('two sources increment source count',()=>assert.equal(report(project([control('first'),control('second')])).sourceCount,2));
test('only one source is counted',()=>assert.equal(report(project([control('first'),control('second',{source:null,evidence:'UNKNOWN'})])).sourceCount,1));
test('second focus stop counted',()=>assert.equal(report(project([control('first'),control('second')])).focusStops,2));
test('multiple switch steps counted',()=>assert.equal(report(project(),['NEXT','NEXT','SELECT']).eventCount,3));
test('selection counted as accepted',()=>assert.equal(report(project(),['NEXT','SELECT']).accepted,2));
test('rejected select counted',()=>assert.equal(report(project(),['SELECT']).rejected,1));
test('rejected select does not count as accepted',()=>assert.equal(report(project(),['SELECT']).accepted,0));
test('report findings are sorted',()=>assert.deepEqual(report(project([control('first',{width:20,name:{en:'',fr:'Entrée'}})])).findings.map(x=>x.path),[...report(project([control('first',{width:20,name:{en:'',fr:'Entrée'}})])).findings.map(x=>x.path)].sort()));
test('report validator accepts built report',()=>assert.deepEqual(reportIssues(report()),[]));
test('report validator rejects null',()=>has(reportIssues(null),'report.invalid'));
test('report validator rejects array',()=>has(reportIssues([]),'report.invalid'));
test('report validator rejects text',()=>has(reportIssues('report'),'report.invalid'));
test('report validator rejects version two',()=>has(reportIssues({...report(),version:2}),'report.version'));
test('report validator rejects invalid locale',()=>has(reportIssues({...report(),locale:'de'}),'report.locale'));
test('report validator rejects invalid decision',()=>has(reportIssues({...report(),decision:'PASS'}),'report.decision'));
test('report validator rejects empty ID',()=>has(reportIssues({...report(),id:''}),'report.id'));
test('report validator rejects missing findings',()=>has(reportIssues({...report(),findings:null}),'report.findings'));
test('report validator rejects malformed finding',()=>has(reportIssues({...report(),findings:[{code:'x'}]}),'report.finding'));
for(const field of ['controlCount','focusStops','eventCount','accepted','rejected','errorCount','reviewCount','sourceCount','unknownCount']){
  test(`report validator rejects negative ${field}`,()=>has(reportIssues({...report(),[field]:-1}),'report.count'));
  test(`report validator rejects decimal ${field}`,()=>has(reportIssues({...report(),[field]:0.5}),'report.count'));
  test(`report validator rejects text ${field}`,()=>has(reportIssues({...report(),[field]:'one'}),'report.count'));
}
for(const [label,input,expected] of [
  ['ordinary','Hello','"Hello"'],
  ['empty','','""'],
  ['null',null,'""'],
  ['number',42,'"42"'],
  ['quoted','a"b','"a""b"'],
  ['comma','one,two','"one,two"'],
  ['newline','one\ntwo','"one two"'],
  ['formula','=A1','"\'=A1"'],
  ['plus formula','+A1','"\'+A1"'],
  ['minus formula','-A1','"\'-A1"'],
  ['at formula','@A1','"\'@A1"'],
]){
  test(`CSV cell: ${label}`,()=>assert.equal(safeCsvCell(input),expected));
}
test('CSV row contains quoted items',()=>assert.equal(csvLine(['a','b']),'"a","b"'));
test('CSV export starts with fixed header',()=>assert.ok(exportCsv(report()).startsWith('"severity","code","path"')));
test('CSV export has CRLF',()=>assert.ok(exportCsv(report()).endsWith('\r\n')));
test('CSV export does not contain source URL',()=>assert.ok(!exportCsv(report()).includes('example.org')));
test('CSV export does not contain control description',()=>assert.ok(!exportCsv(report()).includes('Go forward')));
test('CSV export contains finding code',()=>assert.ok(exportCsv(report(project([control('first',{width:10})]))).includes('control.target-size')));
test('CSV export contains severity',()=>assert.ok(exportCsv(report(project([control('first',{width:10})]))).includes('error')));
test('CSV export contains structural path',()=>assert.ok(exportCsv(report(project([control('first',{width:10})]))).includes('controls[0]')));
test('JSON export parses',()=>assert.doesNotThrow(()=>JSON.parse(exportJson(report()))));
test('JSON export ends in newline',()=>assert.ok(exportJson(report()).endsWith('\n')));
test('JSON export keeps version',()=>assert.equal(JSON.parse(exportJson(report())).version,1));
test('JSON export keeps UNKNOWN decision',()=>assert.equal(JSON.parse(exportJson(report())).decision,'UNKNOWN'));
test('JSON export omits source URL',()=>assert.ok(!exportJson(report()).includes('example.org')));
test('JSON export omits personal names',()=>assert.ok(!exportJson(report()).includes('Continue')));
test('JSON export includes event count',()=>assert.equal(JSON.parse(exportJson(report())).eventCount,1));
test('JSONL export empty findings is empty',()=>assert.equal(exportJsonl(report()),''));
test('JSONL finding export parses',()=>assert.doesNotThrow(()=>JSON.parse(exportJsonl(report(project([control('first',{width:10})]))).trim().split('\n')[0])));
test('summary export has two lines',()=>assert.equal(exportSummary(report()).trim().split('\r\n').length,2));
test('summary export includes UNKNOWN',()=>assert.ok(exportSummary(report()).includes('UNKNOWN')));
test('summary export avoids source URL',()=>assert.ok(!exportSummary(report()).includes('example.org')));
test('safe filename includes suffix',()=>assert.equal(safeFilename('practice','json'),'practice-input-audit.json'));
test('safe CSV filename includes suffix',()=>assert.equal(safeFilename('practice','csv'),'practice-input-audit.csv'));
test('safe JSONL filename includes suffix',()=>assert.equal(safeFilename('practice','jsonl'),'practice-input-audit.jsonl'));
test('safe filename handles spaces',()=>assert.equal(safeFilename('My Project','csv'),'my-project-input-audit.csv'));
test('safe filename strips path separators',()=>assert.equal(safeFilename('../private','json'),'private-input-audit.json'));
test('safe filename handles empty name',()=>assert.equal(safeFilename('','json'),'workbench-input-audit.json'));
test('safe filename bounds size',()=>assert.ok(safeFilename('a'.repeat(200),'csv').length<75));
test('safe filename removes periods',()=>assert.ok(!safeFilename('a.b','json').includes('a.b')));
test('safe filename removes emoji',()=>assert.ok(!safeFilename('🧭test','json').includes('🧭')));
test('handoff privacy is local',()=>assert.equal(buildHandoff(report()).privacy,'LOCAL_ONLY'));
test('handoff contains six checklist items',()=>assert.equal(buildHandoff(report()).checklist.length,6));
test('handoff contains control review',()=>assert.ok(buildHandoff(report()).checklist.some(x=>x.id==='controls')));
test('handoff contains keyboard review',()=>assert.ok(buildHandoff(report()).checklist.some(x=>x.id==='focus')));
test('handoff contains switch review',()=>assert.ok(buildHandoff(report()).checklist.some(x=>x.id==='switch')));
test('handoff contains source review',()=>assert.ok(buildHandoff(report()).checklist.some(x=>x.id==='sources')));
test('handoff contains browser review',()=>assert.ok(buildHandoff(report()).checklist.some(x=>x.id==='browser')));
test('handoff JSON parses',()=>assert.doesNotThrow(()=>JSON.parse(exportHandoff(buildHandoff(report())))));
test('handoff JSON privacy remains local',()=>assert.equal(JSON.parse(exportHandoff(buildHandoff(report()))).privacy,'LOCAL_ONLY'));
test('handoff JSON excludes source URL',()=>assert.ok(!exportHandoff(buildHandoff(report())).includes('example.org')));
test('comparison of identical reports empty',()=>assert.deepEqual(compareReports(report(),report()),[]));
test('comparison detects added finding',()=>assert.ok(compareReports(report(),report(project([control('first',{width:20})]))).some(x=>x.kind==='ADDED')));
test('comparison detects removed finding',()=>assert.ok(compareReports(report(project([control('first',{width:20})])),report()).some(x=>x.kind==='REMOVED')));
test('comparison detects control-count change',()=>assert.ok(compareReports(report(),report(project([control('first'),control('second')]))).some(x=>x.code==='controls.changed')));
test('comparison detects focus-count change',()=>assert.ok(compareReports(report(),report({...project(),focusOrder:[]})).some(x=>x.code==='focus.changed')));
test('comparison detects unknown-count change',()=>assert.ok(compareReports(report(),report(project([defaultControl()]))).some(x=>x.code==='unknown.changed')));
test('report stats count actions',()=>assert.equal(reportStats(report()).actions,1));
test('report stats count observed controls',()=>assert.equal(reportStats(report()).observed,1));
test('report stats count unresolved unknown',()=>assert.equal(reportStats(report(project([defaultControl()]))).unresolved,1));
test('summarize review returns READY with empty issues',()=>assert.equal(summarizeReview({decision:'READY',errors:0,reviews:0},{rejected:0,issues:[]}), 'READY'));
test('summarize review returns UNKNOWN for missing evidence',()=>assert.equal(summarizeReview({decision:'UNKNOWN',errors:0,reviews:0},{rejected:0,issues:[]}), 'UNKNOWN'));
test('summarize review returns REVIEW for errors',()=>assert.equal(summarizeReview({decision:'REVIEW',errors:2,reviews:0},{rejected:0,issues:[]}), 'REVIEW'));
test('summarize review returns UNKNOWN for rejected scan command',()=>assert.equal(summarizeReview({decision:'READY',errors:0,reviews:0},{rejected:1,issues:[]}), 'UNKNOWN'));
test('report preserves browser snapshot uncertainty',()=>assert.equal(buildReport(project(),initialMachine()).decision,'UNKNOWN'));
