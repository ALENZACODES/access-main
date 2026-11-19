import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CASE_STATES, SEVERITIES, EVENTS, EVIDENCE_STATES, SOURCE_TIERS,
  object, safeId, safeDescription, safeDate, copyIssues, referenceIssues,
  cacheIssues, caseIssues, auditCasebook, casebookInventory, casebookGroups,
} from "./model.mjs";
import { TODAY, copy, reference, cache, caseRecord, secondCase, clone, findingCodes } from "./fixtures.node.mjs";

const codes = value => findingCodes(value);
const issues = changes => codes(caseIssues(caseRecord(changes),"case",TODAY));

test("case states enumerate open, review, and uncertain workflows",()=>{
  assert.deepEqual(CASE_STATES,["OPEN","NEEDS_SOURCE","NEEDS_LANGUAGE","NEEDS_CACHE","RESOLVED","UNKNOWN"]);
});
test("case state vocabulary is immutable",()=>assert.equal(Object.isFrozen(CASE_STATES),true));
test("case severity includes unknown",()=>assert.ok(SEVERITIES.includes("unknown")));
test("event vocabulary includes reopening",()=>assert.ok(EVENTS.includes("REOPEN")));
test("evidence vocabulary preserves unknown",()=>assert.ok(EVIDENCE_STATES.includes("UNKNOWN")));
test("source tiers include independent community tier",()=>assert.ok(SOURCE_TIERS.includes("COMMUNITY")));
test("plain object guard accepts ordinary objects",()=>assert.equal(object({}),true));
test("plain object guard accepts null prototype",()=>assert.equal(object(Object.create(null)),true));
test("plain object guard rejects arrays",()=>assert.equal(object([]),false));
test("plain object guard rejects null",()=>assert.equal(object(null),false));
test("plain object guard rejects primitives",()=>assert.equal(object("hello"),false));
test("stable identifier accepts lower-case hyphens",()=>assert.equal(safeId("case-one"),true));
test("stable identifier rejects spaces",()=>assert.equal(safeId("case one"),false));
test("stable identifier rejects empty input",()=>assert.equal(safeId(""),false));
test("stable identifier rejects non-string input",()=>assert.equal(safeId(44),false));
test("stable identifier rejects overlong input",()=>assert.equal(safeId("a".repeat(97)),false));
test("safe description accepts French accents",()=>assert.equal(safeDescription("Entrée accessible"),true));
test("safe description rejects empty text",()=>assert.equal(safeDescription(" "),false));
test("safe description rejects controls",()=>assert.equal(safeDescription("A\u0000B"),false));
test("safe description rejects huge text",()=>assert.equal(safeDescription("a".repeat(1201)),false));
test("calendar date accepts leap day",()=>assert.equal(safeDate("2024-02-29"),true));
test("calendar date rejects impossible day",()=>assert.equal(safeDate("2026-02-29"),false));
test("calendar date rejects shorthand",()=>assert.equal(safeDate("2026-2-9"),false));
test("complete bilingual copy has no findings",()=>assert.deepEqual(copyIssues(copy()),[]));
test("missing translation object is rejected",()=>assert.deepEqual(codes(copyIssues(null)),["copy.object"]));
test("missing English translation is detected",()=>assert.ok(codes(copyIssues({fr:"Bonjour"})).includes("copy.missing")));
test("missing French translation is detected",()=>assert.ok(codes(copyIssues({en:"Hello"})).includes("copy.missing")));
test("blank English translation is detected",()=>assert.ok(codes(copyIssues(copy(" ","Bonjour"))).includes("copy.missing")));
test("blank French translation is detected",()=>assert.ok(codes(copyIssues(copy("Hi"," "))).includes("copy.missing")));
test("French straight apostrophe is rejected",()=>assert.ok(codes(copyIssues(copy("A","L'entrée"))).includes("fr.apostrophe")));
test("French curly apostrophe is accepted",()=>assert.deepEqual(copyIssues(copy("A","L’entrée")),[]));
test("French colon must have normal no-break space",()=>assert.ok(codes(copyIssues(copy("A","Note: texte"))).includes("fr.colon-space")));
test("French colon with escaped no-break space passes",()=>assert.deepEqual(copyIssues(copy("A","Note\u00A0: texte")),[]));
test("French semicolon requires narrow no-break space",()=>assert.ok(codes(copyIssues(copy("A","Bonjour ; oui"))).includes("fr.narrow-space")));
test("French semicolon with narrow no-break space passes",()=>assert.deepEqual(copyIssues(copy("A","Bonjour\u202F; oui")),[]));
test("French exclamation requires narrow space",()=>assert.ok(codes(copyIssues(copy("A","Bonjour !"))).includes("fr.narrow-space")));
test("French exclamation with narrow no-break space passes",()=>assert.deepEqual(copyIssues(copy("A","Bonjour\u202F!")),[]));
test("French question requires narrow no-break space",()=>assert.ok(codes(copyIssues(copy("A","Bonjour ?"))).includes("fr.narrow-space")));
test("French question with narrow no-break space passes",()=>assert.deepEqual(copyIssues(copy("A","Bonjour\u202F?")),[]));
test("French guillemets need inside narrow spaces",()=>assert.ok(codes(copyIssues(copy("A","«Bonjour»"))).includes("fr.guillemet-open")));
test("French guillemets with narrow spaces pass",()=>assert.deepEqual(copyIssues(copy("A","«\u202FBonjour\u202F»")),[]));

test("valid public source reference passes",()=>assert.deepEqual(referenceIssues(reference()),[]));
test("missing reference object is rejected",()=>assert.deepEqual(codes(referenceIssues(null)),["reference.object"]));
test("invalid source ID is reported",()=>assert.ok(codes(referenceIssues(reference({id:"bad id"}))).includes("reference.id")));
test("missing publisher is reported",()=>assert.ok(codes(referenceIssues(reference({publisher:""}))).includes("reference.publisher")));
test("missing licence is reported",()=>assert.ok(codes(referenceIssues(reference({licence:""}))).includes("reference.licence")));
test("insecure source URL is reported",()=>assert.ok(codes(referenceIssues(reference({url:"http://example.org"}))).includes("reference.url")));
test("embedded source credentials are reported",()=>assert.ok(codes(referenceIssues(reference({url:"https://a:b@example.org"}))).includes("reference.url")));
test("invalid collection date is reported",()=>assert.ok(codes(referenceIssues(reference({collectedOn:"2026-02-30"}))).includes("reference.date")));
test("invalid source tier is reported",()=>assert.ok(codes(referenceIssues(reference({tier:"PREMIUM"}))).includes("reference.tier")));
test("unknown source tier remains allowed",()=>assert.deepEqual(referenceIssues(reference({tier:"UNKNOWN"})),[]));
test("invalid source claim is reported",()=>assert.ok(codes(referenceIssues(reference({claim:"CONFIRMED"}))).includes("reference.claim")));
test("unsupported source claim is permitted as uncertainty data",()=>assert.deepEqual(referenceIssues(reference({claim:"UNSUPPORTED"})),[]));
test("absent optional source claim is permitted",()=>{
  const source=reference();delete source.claim;
  assert.deepEqual(referenceIssues(source),[]);
});

test("complete local cache metadata passes",()=>assert.deepEqual(cacheIssues(cache()),[]));
test("missing cache object is reported",()=>assert.deepEqual(codes(cacheIssues(null)),["cache.object"]));
test("invalid cache state is reported",()=>assert.ok(codes(cacheIssues(cache({state:"READY"}))).includes("cache.state")));
test("unsafe cache path is reported",()=>assert.ok(codes(cacheIssues(cache({path:"/offline/../x"}))).includes("cache.path")));
test("external cache location is rejected",()=>assert.ok(codes(cacheIssues(cache({path:"https://example.org/data"}))).includes("cache.path")));
test("missing cache capture date is reported",()=>assert.ok(codes(cacheIssues(cache({capturedOn:""}))).includes("cache.date")));
test("negative cache bytes are rejected",()=>assert.ok(codes(cacheIssues(cache({bytes:-1}))).includes("cache.bytes")));
test("fractional cache bytes are rejected",()=>assert.ok(codes(cacheIssues(cache({bytes:2.5}))).includes("cache.bytes")));
test("zero-byte cache is accepted as a recorded observation",()=>assert.deepEqual(cacheIssues(cache({bytes:0})),[]));
test("unknown cache state is preserved",()=>assert.deepEqual(cacheIssues({state:"UNKNOWN"}),[]));
test("absent cache state is preserved",()=>assert.deepEqual(cacheIssues({state:"ABSENT"}),[]));
test("unknown cache cannot advertise a path",()=>assert.ok(codes(cacheIssues({state:"UNKNOWN",path:"/offline/x"})).includes("cache.unexpectedMetadata")));
test("absent cache cannot claim a capture date",()=>assert.ok(codes(cacheIssues({state:"ABSENT",capturedOn:TODAY})).includes("cache.unexpectedMetadata")));

test("complete case record has no issues",()=>assert.deepEqual(caseIssues(caseRecord()),[]));
test("non-object case is rejected",()=>assert.deepEqual(codes(caseIssues(null)),["case.object"]));
test("case identifier is required",()=>assert.ok(issues({id:""}).includes("case.id")));
test("case record key is required",()=>assert.ok(issues({recordKey:"bad key"}).includes("case.recordKey")));
test("unknown case state vocabulary is rejected",()=>assert.ok(issues({state:"WAITING"}).includes("case.state")));
test("unknown case severity vocabulary is rejected",()=>assert.ok(issues({severity:"urgent"}).includes("case.severity")));
test("unknown evidence vocabulary is rejected",()=>assert.ok(issues({evidence:"SURE"}).includes("case.evidence")));
test("missing creation date is rejected",()=>assert.ok(issues({createdOn:""}).includes("case.createdOn")));
test("invalid update date is rejected",()=>assert.ok(issues({updatedOn:"yesterday"}).includes("case.updatedOn")));
test("future creation date is rejected",()=>assert.ok(issues({createdOn:"2026-11-20"}).includes("case.futureCreated")));
test("future update date is rejected",()=>assert.ok(issues({updatedOn:"2026-11-20"}).includes("case.futureUpdated")));
test("creation cannot follow update",()=>assert.ok(issues({createdOn:"2026-11-19",updatedOn:"2026-11-18"}).includes("case.reverseDates")));
test("case title must be bilingual",()=>assert.ok(issues({title:{en:"Hello"}}).includes("copy.missing")));
test("case summary must be bilingual",()=>assert.ok(issues({summary:{fr:"Bonjour"}}).includes("copy.missing")));
test("a source reference list is mandatory",()=>assert.ok(issues({references:[]}).includes("case.references")));
test("non-array source references are rejected",()=>assert.ok(issues({references:null}).includes("case.references")));
test("duplicate source IDs are rejected",()=>assert.ok(issues({references:[reference(),reference()]}).includes("case.duplicateReference")));
test("malformed source reference is diagnosed",()=>assert.ok(issues({references:[null]}).includes("reference.object")));
test("malformed cache is diagnosed",()=>assert.ok(issues({cache:null}).includes("cache.object")));
test("resolved unknown evidence cannot become certain",()=>assert.ok(issues({evidence:"UNKNOWN"}).includes("case.unknownResolved")));
test("resolved unknown cache cannot become certain",()=>assert.ok(issues({cache:{state:"UNKNOWN"}}).includes("case.cacheUnknownResolved")));
test("open case with unknown evidence is a valid pending observation",()=>assert.deepEqual(caseIssues(caseRecord({state:"OPEN",evidence:"UNKNOWN"})),[]));
test("assessing invalid date throws",()=>assert.throws(()=>caseIssues(caseRecord(),"case","nonsense"),TypeError));
test("case audit leaves source records untouched",()=>{
  const original=caseRecord(),snapshot=clone(original);
  caseIssues(original);assert.deepEqual(original,snapshot);
});

test("casebook accepts a clean case",()=>assert.deepEqual(auditCasebook([caseRecord()]).findings,[]));
test("casebook rejects non-arrays",()=>assert.ok(codes(auditCasebook(null).findings).includes("book.array")));
test("casebook rejects duplicate case IDs",()=>assert.ok(codes(auditCasebook([caseRecord(),caseRecord()]).findings).includes("book.duplicateId")));
test("casebook rejects shared cache ownership",()=>assert.ok(codes(auditCasebook([caseRecord(),secondCase({cache:cache()})]).findings).includes("book.sharedCache")));
test("independent cache ownership is allowed",()=>assert.deepEqual(auditCasebook([caseRecord(),secondCase()]).findings,[]));
test("casebook rejects too many cases",()=>assert.ok(codes(auditCasebook([caseRecord(),secondCase()],{maxCases:1}).findings).includes("book.limit")));
test("casebook rejects invalid date policy",()=>assert.throws(()=>auditCasebook([],{asOf:"invalid"}),TypeError));
test("casebook rejects zero maximum",()=>assert.throws(()=>auditCasebook([],{maxCases:0}),TypeError));
test("casebook keeps count even when one entry invalid",()=>assert.equal(auditCasebook([null,caseRecord()]).count,2));
test("casebook findings have deterministic order",()=>{
  const input=[caseRecord({id:""}),caseRecord({references:[]})];
  assert.deepEqual(auditCasebook(input),auditCasebook(input));
});
test("casebook diagnostics avoid source description",()=>{
  const entry=caseRecord({references:[reference({url:"invalid"})]});
  assert.equal(JSON.stringify(auditCasebook([entry])).includes("Public publisher"),false);
});

test("inventory counts one resolved case",()=>assert.equal(casebookInventory([caseRecord()]).states.RESOLVED,1));
test("inventory counts unknown evidence",()=>assert.equal(casebookInventory([caseRecord({state:"OPEN",evidence:"UNKNOWN"})]).unknown,1));
test("inventory counts unknown cache",()=>assert.equal(casebookInventory([caseRecord({state:"OPEN",cache:{state:"UNKNOWN"}})]).unknown,1));
test("inventory handles missing case arrays",()=>assert.equal(casebookInventory(null).count,0));
test("inventory counts severity",()=>assert.equal(casebookInventory([caseRecord({severity:"critical"})]).severities.critical,1));
test("inventory ignores invalid state count",()=>assert.equal(casebookInventory([caseRecord({state:"wrong"})]).states.RESOLVED,0));
test("inventory does not mutate cases",()=>{
  const entries=[caseRecord()],snapshot=clone(entries);
  casebookInventory(entries);assert.deepEqual(entries,snapshot);
});
test("grouping produces one group per record key",()=>assert.equal(casebookGroups([caseRecord(),secondCase()]).length,2));
test("grouping joins cases sharing one record key",()=>assert.equal(casebookGroups([caseRecord(),secondCase({recordKey:"entrance-one"})])[0].count,2));
test("grouping sorts stable record keys",()=>{
  const groups=casebookGroups([secondCase(),caseRecord()]);
  assert.deepEqual(groups.map(g=>g.recordKey),["entrance-one","entrance-two"]);
});
test("grouping ignores non-objects",()=>assert.equal(casebookGroups([null,caseRecord()]).length,1));
test("grouping handles absent collections",()=>assert.deepEqual(casebookGroups(null),[]));
test("grouping does not invent invalid keys",()=>assert.deepEqual(casebookGroups([caseRecord({recordKey:"bad key"})]),[]));
