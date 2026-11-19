import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PROPOSALS, comparisonReasons, compareCasebooks, proposalTotals,
  changedCachePaths, retirementQueue, reviewQueue, comparisonIsReadOnly,
  auditChanges, proposedCacheBudget,
} from "./diff.mjs";
import { caseRecord, secondCase, reference, cache, copy, clone, TODAY } from "./fixtures.node.mjs";

const comparison=(previous,candidate)=>compareCasebooks(previous,candidate,{asOf:TODAY});
const changes=(previous,candidate)=>comparison(previous,candidate).changes;

test("proposals have explicit non-executing action names",()=>assert.deepEqual(PROPOSALS,["ADD","RETAIN","UPDATE","REVIEW","RETIRE"]));
test("proposal vocabulary is frozen",()=>assert.equal(Object.isFrozen(PROPOSALS),true));
test("comparison of identical cases has no reasons",()=>assert.deepEqual(comparisonReasons(caseRecord(),clone(caseRecord())),[]));
test("missing previous record has explicit reason",()=>assert.deepEqual(comparisonReasons(null,caseRecord()),["record.missing"]));
test("missing candidate record has explicit reason",()=>assert.deepEqual(comparisonReasons(caseRecord(),null),["record.missing"]));
test("changed state is detected",()=>assert.ok(comparisonReasons(caseRecord(),caseRecord({state:"OPEN"})).includes("record.stateChanged")));
test("changed severity is detected",()=>assert.ok(comparisonReasons(caseRecord(),caseRecord({severity:"high"})).includes("record.severityChanged")));
test("changed evidence is detected",()=>assert.ok(comparisonReasons(caseRecord(),caseRecord({evidence:"UNSUPPORTED"})).includes("record.evidenceChanged")));
test("changed created date is detected",()=>assert.ok(comparisonReasons(caseRecord(),caseRecord({createdOn:TODAY})).includes("record.createdOnChanged")));
test("changed updated date is detected",()=>assert.ok(comparisonReasons(caseRecord(),caseRecord({updatedOn:TODAY})).includes("record.updatedOnChanged")));
test("changed record key is detected",()=>assert.ok(comparisonReasons(caseRecord(),caseRecord({recordKey:"new-entrance"})).includes("record.recordKeyChanged")));
test("changed English title is detected",()=>assert.ok(comparisonReasons(caseRecord(),caseRecord({title:copy("New title","Entrée sans marches")})).includes("copy.title.enChanged")));
test("changed French title is detected",()=>assert.ok(comparisonReasons(caseRecord(),caseRecord({title:copy("Step-free entrance","Nouvelle entrée")})).includes("copy.title.frChanged")));
test("changed English summary is detected",()=>assert.ok(comparisonReasons(caseRecord(),caseRecord({summary:copy("New summary","Description selon la source")})).includes("copy.summary.enChanged")));
test("changed French summary is detected",()=>assert.ok(comparisonReasons(caseRecord(),caseRecord({summary:copy("Source-backed description","Nouvelle description")})).includes("copy.summary.frChanged")));
test("source addition is detected",()=>assert.ok(comparisonReasons(caseRecord(),caseRecord({references:[reference(),reference({id:"source-two"})]})).includes("reference.membershipChanged")));
test("source removal is detected",()=>assert.ok(comparisonReasons(caseRecord(),caseRecord({references:[]})).includes("reference.membershipChanged")));
test("source publisher change is detected",()=>assert.ok(comparisonReasons(caseRecord(),caseRecord({references:[reference({publisher:"Other publisher"})]})).includes("reference.publisherChanged")));
test("source URL change is detected",()=>assert.ok(comparisonReasons(caseRecord(),caseRecord({references:[reference({url:"https://example.org/changed"})]})).includes("reference.urlChanged")));
test("source licence change is detected",()=>assert.ok(comparisonReasons(caseRecord(),caseRecord({references:[reference({licence:"CC0"})]})).includes("reference.licenceChanged")));
test("source collection date change is detected",()=>assert.ok(comparisonReasons(caseRecord(),caseRecord({references:[reference({collectedOn:TODAY})]})).includes("reference.collectedOnChanged")));
test("source tier change is detected",()=>assert.ok(comparisonReasons(caseRecord(),caseRecord({references:[reference({tier:"SECONDARY"})]})).includes("reference.tierChanged")));
test("source claim change is detected",()=>assert.ok(comparisonReasons(caseRecord(),caseRecord({references:[reference({claim:"UNKNOWN"})]})).includes("reference.claimChanged")));
test("cache state change is detected",()=>assert.ok(comparisonReasons(caseRecord(),caseRecord({cache:{state:"ABSENT"}})).includes("cache.stateChanged")));
test("cache path change is detected",()=>assert.ok(comparisonReasons(caseRecord(),caseRecord({cache:cache({path:"/offline/cases/new.json"})})).includes("cache.pathChanged")));
test("cache date change is detected",()=>assert.ok(comparisonReasons(caseRecord(),caseRecord({cache:cache({capturedOn:TODAY})})).includes("cache.capturedOnChanged")));
test("cache byte change is detected",()=>assert.ok(comparisonReasons(caseRecord(),caseRecord({cache:cache({bytes:1400})})).includes("cache.bytesChanged")));
test("comparison reasons have deterministic ordering",()=>{
  const left=caseRecord(),right=caseRecord({severity:"high",state:"OPEN"});
  assert.deepEqual(comparisonReasons(left,right),["record.severityChanged","record.stateChanged"]);
});
test("comparison reasons do not emit original source descriptions",()=>{
  const result=comparisonReasons(caseRecord(),caseRecord({summary:copy("Different","Différent")}));
  assert.equal(JSON.stringify(result).includes("Source-backed description"),false);
});

test("empty comparison has no proposals",()=>assert.deepEqual(changes([],[]),[]));
test("identical case comparison produces retain",()=>assert.equal(changes([caseRecord()],[caseRecord()])[0].action,"RETAIN"));
test("new complete case produces add",()=>assert.equal(changes([],[caseRecord()])[0].action,"ADD"));
test("missing case produces retire proposal",()=>assert.equal(changes([caseRecord()],[])[0].action,"RETIRE"));
test("new unresolved case produces review",()=>assert.equal(changes([],[caseRecord({state:"OPEN"})])[0].action,"REVIEW"));
test("new unknown case produces review",()=>assert.equal(changes([],[caseRecord({state:"UNKNOWN"})])[0].action,"REVIEW"));
test("updated supported case produces update",()=>{
  const after=caseRecord({updatedOn:TODAY,title:copy("Updated entrance","Entrée mise à jour")});
  assert.equal(changes([caseRecord()],[after])[0].action,"UPDATE");
});
test("updated unsupported case produces review",()=>assert.equal(changes([caseRecord()],[caseRecord({evidence:"UNSUPPORTED"})])[0].action,"REVIEW"));
test("unknown-to-supported transition still requires review",()=>{
  const prior=caseRecord({state:"OPEN",evidence:"UNKNOWN"});
  assert.equal(changes([prior],[caseRecord()])[0].action,"REVIEW");
});
test("regressed update date requires review",()=>{
  const prior=caseRecord({updatedOn:TODAY});
  assert.equal(changes([prior],[caseRecord()])[0].action,"REVIEW");
});
test("regressed update date adds finding",()=>{
  const prior=caseRecord({updatedOn:TODAY});
  assert.ok(comparison([prior],[caseRecord()]).findings.some(f=>f.code==="change.dateRegressed"));
});
test("invalid prior input blocks proposals",()=>assert.equal(comparison(null,[]).decision,"HOLD"));
test("invalid candidate input blocks proposals",()=>assert.equal(comparison([],null).decision,"HOLD"));
test("duplicate candidate case IDs block release",()=>assert.equal(comparison([],[caseRecord(),caseRecord()]).decision,"HOLD"));
test("invalid source URL blocks change",()=>assert.equal(comparison([],[caseRecord({references:[reference({url:"invalid"})]})]).decision,"HOLD"));
test("missing French title blocks change",()=>assert.equal(comparison([],[caseRecord({title:{en:"Text"}})]).decision,"HOLD"));
test("comparison keys are sorted by stable ID",()=>assert.deepEqual(changes([],[secondCase(),caseRecord()]).map(c=>c.id),["case-one","case-two"]));
test("empty snapshots are ready",()=>assert.equal(comparison([],[]).decision,"READY"));
test("uncertain new case makes comparison unknown",()=>assert.equal(comparison([],[caseRecord({state:"UNKNOWN"})]).decision,"UNKNOWN"));
test("valid new case makes comparison ready",()=>assert.equal(comparison([],[caseRecord()]).decision,"READY"));

test("proposal totals count retained cases",()=>assert.equal(proposalTotals(comparison([caseRecord()],[caseRecord()])).RETAIN,1));
test("proposal totals count added cases",()=>assert.equal(proposalTotals(comparison([],[caseRecord()])).ADD,1));
test("proposal totals count retired cases",()=>assert.equal(proposalTotals(comparison([caseRecord()],[])).RETIRE,1));
test("proposal totals count review cases",()=>assert.equal(proposalTotals(comparison([],[caseRecord({state:"UNKNOWN"})])).REVIEW,1));
test("proposal totals ignore invalid comparison",()=>assert.equal(proposalTotals(null).ADD,0));
test("proposal totals ignore unrecognised actions",()=>assert.equal(proposalTotals({changes:[{action:"PUBLISH"}]}).REVIEW,0));

test("changed cache paths include additions",()=>assert.deepEqual(changedCachePaths([],[caseRecord()]),["/offline/cases/case-one.json"]));
test("changed cache paths omit retained entries",()=>assert.deepEqual(changedCachePaths([caseRecord()],[caseRecord()]),[]));
test("changed cache paths include eligible updates",()=>{
  const after=caseRecord({updatedOn:TODAY,cache:cache({path:"/offline/cases/new.json"})});
  assert.deepEqual(changedCachePaths([caseRecord()],[after]),["/offline/cases/new.json"]);
});
test("changed cache paths block invalid source",()=>assert.deepEqual(changedCachePaths([],[caseRecord({references:[reference({url:"invalid"})]})]),[]));
test("retirement queue includes removed case",()=>assert.deepEqual(retirementQueue([caseRecord()],[]),["case-one"]));
test("retirement queue omits unchanged case",()=>assert.deepEqual(retirementQueue([caseRecord()],[caseRecord()]),[]));
test("review queue includes uncertain addition",()=>assert.equal(reviewQueue([],[caseRecord({state:"UNKNOWN"})]).length,1));
test("review queue omits ready addition",()=>assert.deepEqual(reviewQueue([],[caseRecord()]),[]));
test("review queue includes regressed date",()=>{
  assert.equal(reviewQueue([caseRecord({updatedOn:TODAY})],[caseRecord()]).length,1);
});

test("comparison never modifies snapshots",()=>{
  const before=[caseRecord()],after=[caseRecord({updatedOn:TODAY})],snapshot=clone([before,after]);
  assert.equal(comparisonIsReadOnly(before,after),true);
  assert.deepEqual([before,after],snapshot);
});
test("change audit counts ready proposal",()=>assert.equal(auditChanges([],[caseRecord()]).proposals.ADD,1));
test("change audit counts review proposal",()=>assert.equal(auditChanges([],[caseRecord({state:"UNKNOWN"})]).review,1));
test("change audit counts errors without revealing copy",()=>{
  const result=auditChanges([],[caseRecord({title:{en:"Only English"}})]);
  assert.ok(result.errors>0);
  assert.equal(JSON.stringify(result).includes("Source-backed description"),false);
});

test("cache budget counts one new resource",()=>assert.deepEqual(proposedCacheBudget([],[caseRecord()]),{decision:"READY",bytes:1200,resources:1}));
test("cache budget deduplicates identical retained path",()=>assert.equal(proposedCacheBudget([caseRecord()],[caseRecord()]).resources,1));
test("cache budget includes two distinct new resources",()=>assert.equal(proposedCacheBudget([],[caseRecord(),secondCase()]).resources,2));
test("cache budget sums two distinct cache sizes",()=>assert.equal(proposedCacheBudget([],[caseRecord(),secondCase()]).bytes,2400));
test("cache budget holds structurally invalid collection",()=>assert.equal(proposedCacheBudget([],[caseRecord(),caseRecord()]).decision,"HOLD"));
test("cache budget does not fabricate missing bytes",()=>{
  assert.equal(proposedCacheBudget([],[caseRecord({cache:cache({bytes:-1})})]).bytes,null);
});
