import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CSV_FIELDS, HISTORY_FIELDS, displayText, spreadsheetCell, csvCell,
  csvLine, caseExportRow, exportCasebookCsv, safeCasebookObject,
  exportCasebookJson, exportCasebookJsonl, exportHistoryCsv,
  privacyAudit, buildHandoff, handoffChecklist, caseIndex,
  exportAuditCsv, reportSize, safeReportFilename,
} from "./export.mjs";
import {
  TODAY, caseRecord, secondCase, event, secondEvent,
  reference, cache, clone,
} from "./fixtures.node.mjs";

const cases=[caseRecord(),secondCase()];
const history=[event(),secondEvent()];

test("case CSV headers begin with the case ID",()=>assert.equal(CSV_FIELDS[0],"case_id"));
test("case CSV headers end with suggested actions",()=>assert.equal(CSV_FIELDS.at(-1),"actions"));
test("case CSV headers preserve source attribution",()=>assert.ok(CSV_FIELDS.includes("source_licences")));
test("case CSV headers preserve evidence state",()=>assert.ok(CSV_FIELDS.includes("evidence")));
test("case CSV headers preserve offline capture date",()=>assert.ok(CSV_FIELDS.includes("cache_captured_on")));
test("case CSV headers preserve decision",()=>assert.ok(CSV_FIELDS.includes("decision")));
test("history CSV headers begin with case ID",()=>assert.equal(HISTORY_FIELDS[0],"case_id"));
test("history CSV headers include sequence",()=>assert.ok(HISTORY_FIELDS.includes("sequence")));
test("history CSV headers include destination state",()=>assert.ok(HISTORY_FIELDS.includes("to_state")));
test("case CSV headers are immutable",()=>assert.equal(Object.isFrozen(CSV_FIELDS),true));
test("history CSV headers are immutable",()=>assert.equal(Object.isFrozen(HISTORY_FIELDS),true));

test("display text preserves ordinary prose",()=>assert.equal(displayText("Public data"),"Public data"));
test("display text preserves French accents",()=>assert.equal(displayText("Entrée accessible"),"Entrée accessible"));
test("display text removes ASCII null",()=>assert.equal(displayText("a\u0000b"),"ab"));
test("display text removes an ASCII tab",()=>assert.equal(displayText("a\tb"),"ab"));
test("display text removes an ASCII line break",()=>assert.equal(displayText("a\nb"),"ab"));
test("display text removes ASCII delete",()=>assert.equal(displayText("a\u007fb"),"ab"));
test("display text removes C1 controls",()=>assert.equal(displayText("a\u0085b"),"ab"));
test("display text normalizes decomposed Unicode",()=>assert.equal(displayText("e\u0301"),"é"));
test("display text turns absent input into empty",()=>assert.equal(displayText(null),""));
test("display text rejects objects",()=>assert.equal(displayText({secret:"abc"}),""));
test("display text accepts booleans",()=>assert.equal(displayText(false),"false"));
test("display text accepts numbers",()=>assert.equal(displayText(1200),"1200"));

for(const unsafe of ["=1+1","+SUM(A1)","-1+2","@command","  =42","\t=3"]){
  test(`spreadsheet formula prefix is neutralised ${JSON.stringify(unsafe)}`,()=>{
    assert.ok(spreadsheetCell(unsafe).startsWith("'"));
  });
}
for(const safe of ["Entrée","Public publisher","CC BY 4.0","https://example.org/a","2026-11-19"]){
  test(`safe spreadsheet cell is preserved ${safe}`,()=>assert.equal(spreadsheetCell(safe),safe));
}
test("empty spreadsheet cell stays empty",()=>assert.equal(spreadsheetCell(undefined),""));
test("spreadsheet value never includes a raw null",()=>assert.equal(spreadsheetCell("a\u0000b"),"ab"));
test("CSV quotes double embedded double quotes",()=>assert.equal(csvCell('A "quoted" value'),'"A ""quoted"" value"'));
test("CSV cell quotes a comma",()=>assert.equal(csvCell("one,two"),'"one,two"'));
test("CSV cell neutralises formulas",()=>assert.equal(csvCell("=1+1"),'"\'=1+1"'));
test("CSV line joins cells with commas",()=>assert.equal(csvLine(["a","b"]),'"a","b"'));
test("CSV line supports empty cells",()=>assert.equal(csvLine([null,"b"]),'"","b"'));

test("single case export row has bounded columns",()=>assert.equal(Object.keys(caseExportRow(caseRecord(),"READY")).length,CSV_FIELDS.length));
test("single case export includes source count",()=>assert.equal(caseExportRow(caseRecord(),"READY").source_count,1));
test("single case export includes source tier",()=>assert.equal(caseExportRow(caseRecord(),"READY").source_tiers,"PRIMARY"));
test("single case export includes licence",()=>assert.equal(caseExportRow(caseRecord(),"READY").source_licences,"CC BY 4.0"));
test("single case export includes most recent collection date",()=>assert.equal(caseExportRow(caseRecord(),"READY").latest_collected_on,"2026-11-18"));
test("single case export includes cache path",()=>assert.equal(caseExportRow(caseRecord(),"READY").cache_path,"/offline/cases/case-one.json"));
test("single case export includes readiness",()=>assert.equal(caseExportRow(caseRecord(),"READY").decision,"READY"));
test("single case export includes keep suggestion",()=>assert.equal(caseExportRow(caseRecord(),"READY").actions,"KEEP"));
test("case export excludes raw description",()=>assert.equal(JSON.stringify(caseExportRow(caseRecord(),"READY")).includes("Source-backed description"),false));
test("case export accepts non-object without throwing",()=>assert.equal(caseExportRow(null,"HOLD"),null));
test("unknown case remains unknown in export row",()=>assert.equal(caseExportRow(caseRecord({state:"UNKNOWN"}),"UNKNOWN").decision,"UNKNOWN"));
test("case export of absent cache emits no cache path",()=>assert.equal(caseExportRow(caseRecord({cache:{state:"ABSENT"}}),"HOLD").cache_path,""));
test("multiple source licences are sorted and deduplicated",()=>{
  const item=caseRecord({references:[reference(),reference({id:"second",licence:"CC0"})]});
  assert.equal(caseExportRow(item,"READY").source_licences,"CC BY 4.0|CC0");
});

test("complete casebook produces CSV with header",()=>assert.ok(exportCasebookCsv(cases).csv.startsWith('"case_id"')));
test("complete casebook CSV uses CRLF row separators",()=>assert.equal(exportCasebookCsv(cases).csv.split("\r\n").length,4));
test("complete casebook CSV reports readiness",()=>assert.equal(exportCasebookCsv(cases).decision,"READY"));
test("casebook CSV has one row per case",()=>assert.equal(exportCasebookCsv(cases).csv.trim().split("\r\n").length,3));
test("malformed casebook produces no CSV",()=>assert.equal(exportCasebookCsv([caseRecord({id:"bad id"})]).csv,""));
test("duplicate casebook IDs produce no CSV",()=>assert.equal(exportCasebookCsv([caseRecord(),caseRecord()]).csv,""));
test("unknown casebook retains uncertain status",()=>assert.equal(exportCasebookCsv([caseRecord({state:"UNKNOWN"})]).decision,"UNKNOWN"));
test("casebook CSV does not include private summary",()=>assert.equal(exportCasebookCsv(cases).csv.includes("Source-backed description"),false));
test("casebook CSV retains French source data by metadata only",()=>assert.ok(exportCasebookCsv(cases).csv.includes("CC BY 4.0")));
test("casebook CSV neutralises untrusted spreadsheet-like licence",()=>{
  const altered=caseRecord({references:[reference({licence:"=FORMULA"})]});
  assert.ok(exportCasebookCsv([altered]).csv.includes("'=FORMULA"));
});

test("safe JSON object has explicit schema",()=>assert.equal(safeCasebookObject(cases).schema,"p16-casebook-v1"));
test("safe JSON object has explicit assessment date",()=>assert.equal(safeCasebookObject(cases).asOf,TODAY));
test("safe JSON object reports readiness",()=>assert.equal(safeCasebookObject(cases).status,"READY"));
test("safe JSON object includes case count",()=>assert.equal(safeCasebookObject(cases).inventory.count,2));
test("safe JSON object includes case IDs",()=>assert.equal(safeCasebookObject(cases).decisions[0].id,"case-one"));
test("safe JSON object excludes raw source URL",()=>assert.equal(JSON.stringify(safeCasebookObject(cases)).includes("https://example.org/data"),false));
test("safe JSON object excludes raw case summary",()=>assert.equal(JSON.stringify(safeCasebookObject(cases)).includes("Source-backed description"),false));
test("JSON export parses successfully",()=>assert.equal(JSON.parse(exportCasebookJson(cases)).status,"READY"));
test("JSON export ends in newline",()=>assert.ok(exportCasebookJson(cases).endsWith("\n")));
test("unknown JSON export preserves unknown",()=>assert.equal(JSON.parse(exportCasebookJson([caseRecord({state:"UNKNOWN"})])).status,"UNKNOWN"));

test("JSONL export has two lines for two cases",()=>assert.equal(exportCasebookJsonl(cases).content.trim().split("\n").length,2));
test("JSONL export retains evidence source tier",()=>assert.ok(exportCasebookJsonl(cases).content.includes('"source_tiers":"PRIMARY"')));
test("JSONL export blocks malformed casebook",()=>assert.equal(exportCasebookJsonl([caseRecord({id:"bad id"})]).content,""));
test("JSONL export does not expose raw source description",()=>assert.equal(exportCasebookJsonl(cases).content.includes("Source-backed description"),false));
test("JSONL export indicates uncertain case",()=>assert.equal(exportCasebookJsonl([caseRecord({state:"UNKNOWN"})]).decision,"UNKNOWN"));
test("JSONL export line follows CSV field vocabulary",()=>assert.deepEqual(Object.keys(JSON.parse(exportCasebookJsonl(cases).content.split("\n")[0])),CSV_FIELDS));

test("valid event history produces CSV",()=>assert.ok(exportHistoryCsv(history).csv.startsWith('"case_id"')));
test("event history CSV has a header and two rows",()=>assert.equal(exportHistoryCsv(history).csv.trim().split("\r\n").length,3));
test("event history CSV includes resolution type",()=>assert.ok(exportHistoryCsv(history).csv.includes("RESOLVE")));
test("invalid event history blocks CSV",()=>assert.equal(exportHistoryCsv([event({sequence:3})]).csv,""));
test("event history CSV excludes freeform event message",()=>assert.equal(exportHistoryCsv([event({message:"Private note"})]).csv.includes("Private note"),false));
test("event history retains event sequence",()=>assert.ok(exportHistoryCsv(history).csv.includes('"2"')));

test("privacy audit records case count",()=>assert.equal(privacyAudit(cases,history).cases,2));
test("privacy audit records event count",()=>assert.equal(privacyAudit(cases,history).eventCount,2));
test("privacy audit records zero orphan events",()=>assert.equal(privacyAudit(cases,history).orphanEvents,0));
test("privacy audit records source review count",()=>assert.equal(privacyAudit(cases,[event({type:"REVIEW"})]).reviewEvents,1));
test("privacy audit retains uncertain case count",()=>assert.equal(privacyAudit([caseRecord({state:"UNKNOWN"})],[]).unknown,0));
test("privacy audit excludes private description",()=>assert.equal(JSON.stringify(privacyAudit(cases,history)).includes("Source-backed description"),false));

test("complete handoff has readiness status",()=>assert.equal(buildHandoff(cases,history).decision,"READY"));
test("complete handoff contains two case decisions",()=>assert.equal(buildHandoff(cases,history).contents.cases.length,2));
test("complete handoff contains two events",()=>assert.equal(buildHandoff(cases,history).contents.events,2));
test("malformed history blocks handoff exports",()=>assert.equal(buildHandoff(cases,[event({sequence:5})]).exports.csv,""));
test("malformed cases block handoff exports",()=>assert.equal(buildHandoff([caseRecord({id:"bad id"})],history).exports.jsonl,""));
test("unknown handoff retains unknown status",()=>assert.equal(buildHandoff([caseRecord({state:"UNKNOWN"})],[]).decision,"UNKNOWN"));
test("handoff does not mutate inputs",()=>{
  const originals=clone([cases,history]);
  buildHandoff(cases,history);assert.deepEqual([cases,history],originals);
});

test("handoff checklist has three gates",()=>assert.equal(handoffChecklist(cases,history).gates.length,3));
test("handoff checklist includes case gate",()=>assert.ok(handoffChecklist(cases,history).gates.some(g=>g.id==="cases")));
test("handoff checklist includes history gate",()=>assert.ok(handoffChecklist(cases,history).gates.some(g=>g.id==="history")));
test("handoff checklist includes decision gate",()=>assert.ok(handoffChecklist(cases,history).gates.some(g=>g.id==="decisions")));
test("handoff checklist is ready for complete records",()=>assert.equal(handoffChecklist(cases,history).decision,"READY"));
test("handoff checklist is held for invalid records",()=>assert.equal(handoffChecklist([caseRecord({id:"bad id"})],[]).decision,"HOLD"));
test("handoff checklist stays unknown for uncertain records",()=>assert.equal(handoffChecklist([caseRecord({state:"UNKNOWN"})],[]).decision,"UNKNOWN"));

test("case index lists existing cases",()=>assert.equal(caseIndex(cases,history).length,2));
test("case index has event count for first case",()=>assert.equal(caseIndex(cases,history)[0].eventCount,2));
test("case index has no events for second case",()=>assert.equal(caseIndex(cases,history)[1].eventCount,0));
test("case index keeps latest event date",()=>assert.equal(caseIndex(cases,history)[0].lastEvent,"2026-11-18"));
test("case index sorts keys",()=>assert.deepEqual(caseIndex([secondCase(),caseRecord()],[]).map(c=>c.id),["case-one","case-two"]));
test("case index avoids raw description",()=>assert.equal(JSON.stringify(caseIndex(cases,history)).includes("Source-backed description"),false));
test("case index handles invalid input",()=>assert.deepEqual(caseIndex(null,history),[]));

test("audit CSV includes case count",()=>assert.ok(exportAuditCsv(cases,history).includes('"2"')));
test("audit CSV includes a header",()=>assert.ok(exportAuditCsv(cases,history).startsWith('"status","cases"')));
test("audit CSV ends with CRLF",()=>assert.ok(exportAuditCsv(cases,history).endsWith("\r\n")));
test("audit CSV never includes source URL",()=>assert.equal(exportAuditCsv(cases,history).includes("https://example.org"),false));
test("report size uses UTF-8 byte count",()=>assert.equal(reportSize("abc"),3));
test("report size accepts JSON objects",()=>assert.ok(reportSize({a:1})>0));
test("report size reflects multibyte accents",()=>assert.equal(reportSize("é"),2));

test("safe CSV filename is allowed",()=>assert.equal(safeReportFilename("casebook"),"casebook.csv"));
test("safe JSON filename is allowed",()=>assert.equal(safeReportFilename("casebook","json"),"casebook.json"));
test("safe JSONL filename is allowed",()=>assert.equal(safeReportFilename("casebook","jsonl"),"casebook.jsonl"));
test("filename path traversal is rejected",()=>assert.equal(safeReportFilename("../casebook"),null));
test("filename path separator is rejected",()=>assert.equal(safeReportFilename("folder/casebook"),null));
test("filename extension outside allowlist is rejected",()=>assert.equal(safeReportFilename("casebook","exe"),null));
test("filename text with spaces is rejected",()=>assert.equal(safeReportFilename("my casebook"),null));
test("filename empty name is rejected",()=>assert.equal(safeReportFilename(""),null));
test("filename missing name is rejected",()=>assert.equal(safeReportFilename(null),null));
test("filename uppercase letters are accepted",()=>assert.equal(safeReportFilename("CaseBook"),"CaseBook.csv"));
