import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DECISIONS, ACTIONS, decisionPolicy, assessReference, assessCache,
  joinDecisions, assessCase, assessCasebook, suggestedActions, workQueues,
  highPriorityQueue, windowReadiness, readinessSignals, publicDecisionSummary,
} from "./decisions.mjs";
import { TODAY, caseRecord, secondCase, reference, cache, clone } from "./fixtures.node.mjs";

const policy = decisionPolicy({asOf:TODAY});
const assess = changes=>assessCase(caseRecord(changes),{asOf:TODAY});

test("decisions preserve a distinct unknown status",()=>assert.deepEqual(DECISIONS,["READY","HOLD","UNKNOWN"]));
test("action vocabulary includes source follow-up",()=>assert.ok(ACTIONS.includes("REQUEST_SOURCE")));
test("action vocabulary includes translation follow-up",()=>assert.ok(ACTIONS.includes("REQUEST_TRANSLATION")));
test("action vocabulary includes cache follow-up",()=>assert.ok(ACTIONS.includes("RECACHE")));
test("action vocabulary includes manual review",()=>assert.ok(ACTIONS.includes("REVIEW")));
test("action vocabulary includes no-change action",()=>assert.ok(ACTIONS.includes("KEEP")));
test("action vocabulary includes archive proposal",()=>assert.ok(ACTIONS.includes("ARCHIVE")));
test("default assessment date is deterministic",()=>assert.equal(policy.asOf,TODAY));
test("default source age limit is bounded",()=>assert.equal(policy.maximumAgeDays,180));
test("default cache age limit is bounded",()=>assert.equal(policy.maximumCacheAgeDays,30));
test("default maximum open days is bounded",()=>assert.equal(policy.maximumOpenDays,60));
test("community evidence is conservative by default",()=>assert.equal(policy.permitCommunity,false));
test("offline copy is required by default",()=>assert.equal(policy.requireCachedCopy,true));
test("policy is frozen",()=>assert.equal(Object.isFrozen(policy),true));
test("policy allows explicit current date",()=>assert.equal(decisionPolicy({asOf:"2026-11-18"}).asOf,"2026-11-18"));
test("policy allows a zero source age limit",()=>assert.equal(decisionPolicy({maximumAgeDays:0}).maximumAgeDays,0));
test("policy allows a zero cache age limit",()=>assert.equal(decisionPolicy({maximumCacheAgeDays:0}).maximumCacheAgeDays,0));
test("policy permits explicit community support",()=>assert.equal(decisionPolicy({permitCommunity:true}).permitCommunity,true));
test("policy permits uncached public review",()=>assert.equal(decisionPolicy({requireCachedCopy:false}).requireCachedCopy,false));
test("policy rejects null",()=>assert.throws(()=>decisionPolicy(null),TypeError));
test("policy rejects arrays",()=>assert.throws(()=>decisionPolicy([]),TypeError));
test("policy rejects text",()=>assert.throws(()=>decisionPolicy("text"),TypeError));
test("policy rejects invalid calendar date",()=>assert.throws(()=>decisionPolicy({asOf:"2026-02-30"}),TypeError));
test("policy rejects a negative source age",()=>assert.throws(()=>decisionPolicy({maximumAgeDays:-1}),TypeError));
test("policy rejects a fractional source age",()=>assert.throws(()=>decisionPolicy({maximumAgeDays:0.5}),TypeError));
test("policy rejects unbounded source age",()=>assert.throws(()=>decisionPolicy({maximumAgeDays:36501}),TypeError));
test("policy rejects negative cache age",()=>assert.throws(()=>decisionPolicy({maximumCacheAgeDays:-1}),TypeError));
test("policy rejects fractional cache age",()=>assert.throws(()=>decisionPolicy({maximumCacheAgeDays:2.2}),TypeError));
test("policy rejects excessive open age",()=>assert.throws(()=>decisionPolicy({maximumOpenDays:36501}),TypeError));
test("policy rejects textual community preference",()=>assert.throws(()=>decisionPolicy({permitCommunity:"yes"}),TypeError));
test("policy rejects textual cache requirement",()=>assert.throws(()=>decisionPolicy({requireCachedCopy:"no"}),TypeError));

test("fresh primary source is eligible",()=>assert.equal(assessReference(reference(),policy).decision,"READY"));
test("fresh secondary source is eligible",()=>assert.equal(assessReference(reference({tier:"SECONDARY"}),policy).decision,"READY"));
test("community source is held under default policy",()=>assert.equal(assessReference(reference({tier:"COMMUNITY"}),policy).decision,"HOLD"));
test("community source is eligible under explicit policy",()=>assert.equal(assessReference(reference({tier:"COMMUNITY"}),decisionPolicy({permitCommunity:true})).decision,"READY"));
test("missing reference is held",()=>assert.equal(assessReference(null,policy).decision,"HOLD"));
test("unknown source tier stays unknown",()=>assert.equal(assessReference(reference({tier:"UNKNOWN"}),policy).decision,"UNKNOWN"));
test("unknown source claim stays unknown",()=>assert.equal(assessReference(reference({claim:"UNKNOWN"}),policy).decision,"UNKNOWN"));
test("unsupported source claim is held",()=>assert.equal(assessReference(reference({claim:"UNSUPPORTED"}),policy).decision,"HOLD"));
test("invalid source tier is held",()=>assert.equal(assessReference(reference({tier:"GOLD"}),policy).decision,"HOLD"));
test("missing source collection date is held",()=>assert.equal(assessReference(reference({collectedOn:""}),policy).decision,"HOLD"));
test("future source date is held",()=>assert.equal(assessReference(reference({collectedOn:"2026-11-20"}),policy).decision,"HOLD"));
test("stale source is held",()=>assert.equal(assessReference(reference({collectedOn:"2020-01-01"}),policy).decision,"HOLD"));
test("source age exactly on threshold passes",()=>assert.equal(assessReference(reference({collectedOn:"2026-11-18"}),decisionPolicy({maximumAgeDays:1})).decision,"READY"));
test("source past zero-day threshold is held",()=>assert.equal(assessReference(reference(),decisionPolicy({maximumAgeDays:0})).decision,"HOLD"));
test("source reasons include age failure",()=>assert.ok(assessReference(reference({collectedOn:"2020-01-01"}),policy).reasons.includes("reference.stale")));
test("source reasons include future date",()=>assert.ok(assessReference(reference({collectedOn:"2026-11-20"}),policy).reasons.includes("reference.futureDate")));
test("source reasons do not echo licence",()=>assert.equal(JSON.stringify(assessReference(reference(),policy)).includes("CC BY 4.0"),false));

test("stored cache is ready",()=>assert.equal(assessCache(cache(),policy).decision,"READY"));
test("missing cache is held",()=>assert.equal(assessCache(null,policy).decision,"HOLD"));
test("unknown cache stays unknown",()=>assert.equal(assessCache({state:"UNKNOWN"},policy).decision,"UNKNOWN"));
test("absent cache is held when required",()=>assert.equal(assessCache({state:"ABSENT"},policy).decision,"HOLD"));
test("absent cache is allowed when explicitly optional",()=>assert.equal(assessCache({state:"ABSENT"},decisionPolicy({requireCachedCopy:false})).decision,"READY"));
test("invalid cache state is held",()=>assert.equal(assessCache({state:"CACHED"},policy).decision,"HOLD"));
test("future capture date is held",()=>assert.equal(assessCache(cache({capturedOn:"2026-11-20"}),policy).decision,"HOLD"));
test("missing capture date is held",()=>assert.equal(assessCache(cache({capturedOn:null}),policy).decision,"HOLD"));
test("stale cache is held",()=>assert.equal(assessCache(cache({capturedOn:"2020-01-01"}),policy).decision,"HOLD"));
test("cache on freshness boundary passes",()=>assert.equal(assessCache(cache(),decisionPolicy({maximumCacheAgeDays:1})).decision,"READY"));
test("cache past zero-day limit is held",()=>assert.equal(assessCache(cache(),decisionPolicy({maximumCacheAgeDays:0})).decision,"HOLD"));
test("stale cache reason remains machine readable",()=>assert.ok(assessCache(cache({capturedOn:"2020-01-01"}),policy).reasons.includes("cache.stale")));
test("invalid cache date has explicit reason",()=>assert.ok(assessCache(cache({capturedOn:"bad"}),policy).reasons.includes("cache.missingDate")));
test("unknown cache reason is distinct",()=>assert.deepEqual(assessCache({state:"UNKNOWN"},policy).reasons,["cache.unknown"]));

test("decision composition of ready items is ready",()=>assert.equal(joinDecisions([{decision:"READY"}]),"READY"));
test("decision composition retains unknown",()=>assert.equal(joinDecisions([{decision:"READY"},{decision:"UNKNOWN"}]),"UNKNOWN"));
test("decision composition gives hold precedence",()=>assert.equal(joinDecisions([{decision:"UNKNOWN"},{decision:"HOLD"}]),"HOLD"));
test("decision composition of empty set is ready",()=>assert.equal(joinDecisions([]),"READY"));

test("resolved case with source and cache is ready",()=>assert.equal(assess().decision,"READY"));
test("open case is held",()=>assert.equal(assess({state:"OPEN"}).decision,"HOLD"));
test("case needing source is held",()=>assert.equal(assess({state:"NEEDS_SOURCE"}).decision,"HOLD"));
test("case needing translation is held",()=>assert.equal(assess({state:"NEEDS_LANGUAGE"}).decision,"HOLD"));
test("case needing cache is held",()=>assert.equal(assess({state:"NEEDS_CACHE"}).decision,"HOLD"));
test("unknown case state stays unknown",()=>assert.equal(assess({state:"UNKNOWN"}).decision,"UNKNOWN"));
test("unknown severity stays unknown",()=>assert.equal(assess({severity:"unknown"}).decision,"UNKNOWN"));
test("uncertain evidence stays unknown when open",()=>assert.equal(assess({state:"OPEN",evidence:"UNKNOWN"}).decision,"UNKNOWN"));
test("resolved unsupported case is held",()=>assert.equal(assess({evidence:"UNSUPPORTED"}).decision,"HOLD"));
test("resolved unknown cache is not marked ready",()=>assert.equal(assess({cache:{state:"UNKNOWN"}}).decision,"HOLD"));
test("invalid identifier causes hold",()=>assert.equal(assess({id:"bad id"}).decision,"HOLD"));
test("missing French description causes hold",()=>assert.equal(assess({summary:{en:"Text"}}).decision,"HOLD"));
test("unsupported evidence reason is explicit",()=>assert.ok(assess({evidence:"UNSUPPORTED"}).reasons.includes("case.unsupported")));
test("uncertain evidence reason is explicit",()=>assert.ok(assess({state:"OPEN",evidence:"UNKNOWN"}).reasons.includes("case.uncertain")));
test("stale primary source causes hold",()=>assert.equal(assess({references:[reference({collectedOn:"2020-01-01"})]}).decision,"HOLD"));
test("community source needs explicit permit",()=>assert.equal(assess({references:[reference({tier:"COMMUNITY"})]}).decision,"HOLD"));
test("community source may pass with explicit permit",()=>assert.equal(assessCase(caseRecord({references:[reference({tier:"COMMUNITY"})]}),{permitCommunity:true}).decision,"READY"));
test("missing cache under optional policy still needs valid metadata",()=>assert.equal(assessCase(caseRecord({cache:{state:"ABSENT"}}),{requireCachedCopy:false}).decision,"READY"));
test("assessment does not mutate the case",()=>{
  const input=caseRecord(),snapshot=clone(input);
  assessCase(input);assert.deepEqual(input,snapshot);
});

test("one clean case produces ready collection",()=>assert.equal(assessCasebook([caseRecord()]).decision,"READY"));
test("two clean cases produce two ready rows",()=>assert.equal(assessCasebook([caseRecord(),secondCase()]).totals.READY,2));
test("unknown case makes collection unknown",()=>assert.equal(assessCasebook([caseRecord({state:"UNKNOWN"})]).decision,"UNKNOWN"));
test("structural findings force held collection",()=>assert.equal(assessCasebook([caseRecord(),caseRecord()]).decision,"HOLD"));
test("invalid top-level input is held",()=>assert.equal(assessCasebook(null).decision,"HOLD"));
test("collection rows retain input indices",()=>assert.deepEqual(assessCasebook([caseRecord(),secondCase()]).rows.map(row=>row.index),[0,1]));
test("collection summary counts held cases",()=>assert.equal(assessCasebook([caseRecord({state:"OPEN"})]).totals.HOLD,1));
test("collection summary counts unknown cases",()=>assert.equal(assessCasebook([caseRecord({state:"UNKNOWN"})]).totals.UNKNOWN,1));
test("collection summary counts ready cases",()=>assert.equal(assessCasebook([caseRecord()]).totals.READY,1));
test("invalid case does not expose raw source",()=>assert.equal(JSON.stringify(assessCasebook([caseRecord({id:"invalid id"})])).includes("Public publisher"),false));

test("ready case suggests keeping existing record",()=>assert.deepEqual(suggestedActions(caseRecord()),["KEEP"]));
test("unknown case suggests review",()=>assert.deepEqual(suggestedActions(caseRecord({state:"UNKNOWN"})),["REVIEW"]));
test("case waiting for source suggests source request",()=>assert.ok(suggestedActions(caseRecord({state:"NEEDS_SOURCE"})).includes("REQUEST_SOURCE")));
test("case waiting for translation suggests language request",()=>assert.ok(suggestedActions(caseRecord({state:"NEEDS_LANGUAGE"})).includes("REQUEST_TRANSLATION")));
test("case waiting for cache suggests recache",()=>assert.ok(suggestedActions(caseRecord({state:"NEEDS_CACHE"})).includes("RECACHE")));
test("unsupported case suggests archival consideration",()=>assert.ok(suggestedActions(caseRecord({evidence:"UNSUPPORTED"})).includes("ARCHIVE")));
test("invalid case suggests a review",()=>assert.deepEqual(suggestedActions(null),["REVIEW"]));
test("bad translation suggests translation request",()=>assert.ok(suggestedActions(caseRecord({title:{en:"Hi"}})).includes("REQUEST_TRANSLATION")));
test("missing cache suggests recaching",()=>assert.ok(suggestedActions(caseRecord({cache:null})).includes("RECACHE")));
test("missing source suggests follow-up",()=>assert.ok(suggestedActions(caseRecord({references:[reference({url:"invalid"})]})).includes("REQUEST_SOURCE")));
test("suggestions are from bounded action vocabulary",()=>assert.ok(suggestedActions(caseRecord({state:"OPEN"})).every(action=>ACTIONS.includes(action))));
test("suggestions are deterministic",()=>assert.deepEqual(suggestedActions(caseRecord()),suggestedActions(caseRecord())));

test("work queue places ready cases correctly",()=>assert.deepEqual(workQueues([caseRecord()]).READY,["case-one"]));
test("work queue places held cases correctly",()=>assert.deepEqual(workQueues([caseRecord({state:"OPEN"})]).HOLD,["case-one"]));
test("work queue places uncertain cases correctly",()=>assert.deepEqual(workQueues([caseRecord({state:"UNKNOWN"})]).UNKNOWN,["case-one"]));
test("work queues accept missing input",()=>assert.deepEqual(workQueues(null),{READY:[],HOLD:[],UNKNOWN:[]}));
test("critical held case precedes low held case",()=>{
  const cases=[caseRecord({state:"OPEN",severity:"low"}),secondCase({state:"OPEN",severity:"critical"})];
  assert.equal(highPriorityQueue(cases)[0].id,"case-two");
});
test("unknown priority sorts after known priority",()=>{
  const cases=[caseRecord({state:"UNKNOWN",severity:"unknown"}),secondCase({state:"OPEN",severity:"normal"})];
  assert.equal(highPriorityQueue(cases)[0].id,"case-two");
});
test("ready cases are excluded from high priority queue",()=>assert.deepEqual(highPriorityQueue([caseRecord()]),[]));
test("high priority queue handles null input",()=>assert.deepEqual(highPriorityQueue(null),[]));
test("high priority queue does not mutate records",()=>{
  const cases=[caseRecord(),secondCase({state:"OPEN"})],snapshot=clone(cases);
  highPriorityQueue(cases);assert.deepEqual(cases,snapshot);
});

test("readiness window accepts increasing dates",()=>assert.equal(windowReadiness([caseRecord()],["2026-11-18",TODAY]).length,2));
test("readiness window rejects reverse dates",()=>assert.throws(()=>windowReadiness([],[TODAY,"2026-11-18"]),TypeError));
test("readiness window rejects duplicate dates",()=>assert.throws(()=>windowReadiness([],[TODAY,TODAY]),TypeError));
test("readiness window rejects malformed dates",()=>assert.throws(()=>windowReadiness([],["yesterday"]),TypeError));
test("readiness window rejects non-array dates",()=>assert.throws(()=>windowReadiness([],null),TypeError));
test("readiness window rejects unbounded dates",()=>assert.throws(()=>windowReadiness([],Array(367).fill(TODAY)),TypeError));
test("readiness window retains explicit assessment dates",()=>assert.equal(windowReadiness([],[TODAY])[0].date,TODAY));
test("readiness signals detect changed collection decision",()=>{
  const input=[{date:"a",decision:"READY",totals:{READY:1,HOLD:0,UNKNOWN:0}},{date:"b",decision:"HOLD",totals:{READY:0,HOLD:1,UNKNOWN:0}}];
  assert.ok(readinessSignals(input).some(signal=>signal.code==="decision.changed"));
});
test("readiness signals detect decreasing ready count",()=>{
  const input=[{date:"a",decision:"READY",totals:{READY:2,HOLD:0,UNKNOWN:0}},{date:"b",decision:"HOLD",totals:{READY:1,HOLD:1,UNKNOWN:0}}];
  assert.ok(readinessSignals(input).some(signal=>signal.code==="ready.decreased"));
});
test("readiness signals detect increasing uncertain count",()=>{
  const input=[{date:"a",decision:"READY",totals:{READY:1,HOLD:0,UNKNOWN:0}},{date:"b",decision:"UNKNOWN",totals:{READY:0,HOLD:0,UNKNOWN:1}}];
  assert.ok(readinessSignals(input).some(signal=>signal.code==="unknown.increased"));
});
test("unchanged readiness produces no signals",()=>{
  const item={date:"a",decision:"READY",totals:{READY:1,HOLD:0,UNKNOWN:0}};
  assert.deepEqual(readinessSignals([item,{...item,date:"b"}]),[]);
});

test("public summary includes total cases",()=>assert.equal(publicDecisionSummary([caseRecord()]).cases,1));
test("public summary includes uncertain cases",()=>assert.equal(publicDecisionSummary([caseRecord({state:"UNKNOWN"})]).unknown,1));
test("public summary includes held cases",()=>assert.equal(publicDecisionSummary([caseRecord({state:"OPEN"})]).hold,1));
test("public summary includes readiness decision",()=>assert.equal(publicDecisionSummary([caseRecord()]).decision,"READY"));
test("public summary includes structural findings count",()=>assert.ok(publicDecisionSummary([caseRecord({id:"bad id"})]).findings>0));
test("public summary contains no raw descriptions",()=>assert.equal(JSON.stringify(publicDecisionSummary([caseRecord()])).includes("Source-backed description"),false));
