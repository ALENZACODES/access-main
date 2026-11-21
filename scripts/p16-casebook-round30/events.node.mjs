import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PERMITTED_TRANSITIONS, eventIssues, auditEventLog, canTransition,
  applyEvent, replayCase, reconcileEventState, eventStatistics,
  caseTimeline, planAppend, historySafety,
} from "./events.mjs";
import {
  TODAY, event, secondEvent, caseRecord,
  clone, findingCodes,
} from "./fixtures.node.mjs";

const codes = values=>findingCodes(values);
const eventCodes = overrides=>codes(eventIssues(event(overrides)));
const auditCodes = list=>codes(auditEventLog(list).findings);

test("transition table includes every case state",()=>assert.deepEqual(Object.keys(PERMITTED_TRANSITIONS),["OPEN","NEEDS_SOURCE","NEEDS_LANGUAGE","NEEDS_CACHE","RESOLVED","UNKNOWN"]));
test("resolved case can be reopened",()=>assert.ok(PERMITTED_TRANSITIONS.RESOLVED.includes("OPEN")));
test("resolved case can become uncertain",()=>assert.ok(PERMITTED_TRANSITIONS.RESOLVED.includes("UNKNOWN")));
test("unknown case can request more source",()=>assert.ok(PERMITTED_TRANSITIONS.UNKNOWN.includes("NEEDS_SOURCE")));
test("unknown case cannot directly resolve",()=>assert.equal(PERMITTED_TRANSITIONS.UNKNOWN.includes("RESOLVED"),false));
test("open case can request translation",()=>assert.ok(PERMITTED_TRANSITIONS.OPEN.includes("NEEDS_LANGUAGE")));
test("source-needed case can request cache",()=>assert.ok(PERMITTED_TRANSITIONS.NEEDS_SOURCE.includes("NEEDS_CACHE")));
test("cache-needed case can request source",()=>assert.ok(PERMITTED_TRANSITIONS.NEEDS_CACHE.includes("NEEDS_SOURCE")));
test("language-needed case can resolve",()=>assert.ok(PERMITTED_TRANSITIONS.NEEDS_LANGUAGE.includes("RESOLVED")));

test("complete event has no structural issues",()=>assert.deepEqual(eventIssues(event()),[]));
test("non-object event is rejected",()=>assert.deepEqual(codes(eventIssues(null)),["event.object"]));
test("missing event ID is rejected",()=>assert.ok(eventCodes({id:""}).includes("event.id")));
test("invalid case ID is rejected",()=>assert.ok(eventCodes({caseId:"bad id"}).includes("event.caseId")));
test("unknown event type is rejected",()=>assert.ok(eventCodes({type:"DELETE"}).includes("event.type")));
test("invalid event date is rejected",()=>assert.ok(eventCodes({occurredOn:"2026-02-30"}).includes("event.date")));
test("zero event sequence is rejected",()=>assert.ok(eventCodes({sequence:0}).includes("event.sequence")));
test("negative event sequence is rejected",()=>assert.ok(eventCodes({sequence:-2}).includes("event.sequence")));
test("fractional event sequence is rejected",()=>assert.ok(eventCodes({sequence:1.5}).includes("event.sequence")));
test("invalid event note is rejected",()=>assert.ok(eventCodes({message:"\u0000"}).includes("event.message")));
test("valid event note is accepted",()=>assert.deepEqual(eventIssues(event({message:"Source review requested"})),[]));
test("invalid destination state is rejected",()=>assert.ok(eventCodes({toState:"DONE"}).includes("event.toState")));
test("review events cannot change state implicitly",()=>assert.ok(eventCodes({type:"REVIEW",toState:"OPEN"}).includes("event.reviewTransition")));
test("resolve event must target resolved",()=>assert.ok(eventCodes({type:"RESOLVE",toState:"OPEN"}).includes("event.resolveState")));
test("resolve event targeting resolved passes",()=>assert.deepEqual(eventIssues(secondEvent()),[]));
test("reopen event must target open",()=>assert.ok(eventCodes({type:"REOPEN",toState:"RESOLVED"}).includes("event.reopenState")));
test("reopen event targeting open passes",()=>assert.deepEqual(eventIssues(event({type:"REOPEN",toState:"OPEN"})),[]));
test("event source text is never in structural diagnostics",()=>{
  const findings=eventIssues(event({type:"INVALID",message:"Confidential note"}));
  assert.equal(JSON.stringify(findings).includes("Confidential note"),false);
});

test("single valid event log passes",()=>assert.deepEqual(auditEventLog([event()]).findings,[]));
test("two ordered events pass",()=>assert.deepEqual(auditEventLog([event(),secondEvent()]).findings,[]));
test("non-array event log is rejected",()=>assert.ok(auditCodes(null).includes("log.array")));
test("event count includes invalid entries",()=>assert.equal(auditEventLog([null,event()]).count,2));
test("duplicate event IDs are rejected",()=>assert.ok(auditCodes([event(),event({sequence:2})]).includes("log.duplicateId")));
test("missing sequence one is rejected",()=>assert.ok(auditCodes([event({sequence:2})]).includes("log.sequenceGap")));
test("sequence gap between events is rejected",()=>assert.ok(auditCodes([event(),secondEvent({sequence:3})]).includes("log.sequenceGap")));
test("chronological regression is rejected",()=>assert.ok(auditCodes([event({occurredOn:TODAY}),secondEvent({occurredOn:"2026-11-18"})]).includes("log.dateRegressed")));
test("future event date is rejected",()=>assert.ok(auditCodes([event({occurredOn:"2026-11-20"})]).includes("log.futureDate")));
test("invalid event type is propagated",()=>assert.ok(auditCodes([event({type:"ARCHIVE"})]).includes("event.type")));
test("invalid event ID is propagated",()=>assert.ok(auditCodes([event({id:"bad id"})]).includes("event.id")));
test("invalid assessment date throws",()=>assert.throws(()=>auditEventLog([],{asOf:"tomorrow"}),TypeError));
test("zero maximum event count throws",()=>assert.throws(()=>auditEventLog([],{maxEvents:0}),TypeError));
test("fractional maximum event count throws",()=>assert.throws(()=>auditEventLog([],{maxEvents:2.5}),TypeError));
test("too many events returns a limit finding",()=>assert.ok(codes(auditEventLog([event(),secondEvent()],{maxEvents:1}).findings).includes("log.limit")));
test("separate case IDs have independent sequence numbers",()=>{
  const events=[event(),event({id:"event-two",caseId:"case-two",sequence:1})];
  assert.deepEqual(auditEventLog(events).findings,[]);
});
test("event log does not change event ordering",()=>{
  const events=[secondEvent(),event()],before=clone(events);
  auditEventLog(events);assert.deepEqual(events,before);
});
test("event audit is deterministic",()=>{
  const entries=[event(),secondEvent({sequence:4})];
  assert.deepEqual(auditEventLog(entries),auditEventLog(entries));
});
test("invalid event does not crash grouped chronology",()=>assert.ok(auditEventLog([null,event()]).findings.length>0));

test("open may become source-needed",()=>assert.equal(canTransition("OPEN","NEEDS_SOURCE"),true));
test("open may become resolved",()=>assert.equal(canTransition("OPEN","RESOLVED"),true));
test("resolved may become open",()=>assert.equal(canTransition("RESOLVED","OPEN"),true));
test("resolved may not resolve again",()=>assert.equal(canTransition("RESOLVED","RESOLVED"),false));
test("unknown cannot immediately resolve",()=>assert.equal(canTransition("UNKNOWN","RESOLVED"),false));
test("invalid source state cannot transition",()=>assert.equal(canTransition("INVALID","OPEN"),false));
test("invalid destination state cannot transition",()=>assert.equal(canTransition("OPEN","INVALID"),false));
test("non-string state cannot transition",()=>assert.equal(canTransition(null,"OPEN"),false));

test("valid transition updates case state",()=>assert.deepEqual(applyEvent("OPEN",event({toState:"NEEDS_SOURCE"})),{state:"NEEDS_SOURCE",reason:null}));
test("note without transition preserves state",()=>assert.deepEqual(applyEvent("OPEN",event({type:"NOTE"})),{state:"OPEN",reason:null}));
test("open event without destination preserves state",()=>assert.deepEqual(applyEvent("OPEN",event()),{state:"OPEN",reason:null}));
test("invalid event retains previous state",()=>assert.equal(applyEvent("OPEN",null).state,"OPEN"));
test("invalid initial state becomes unknown",()=>assert.equal(applyEvent("BOGUS",event()).state,"UNKNOWN"));
test("resolved cannot resolve again",()=>assert.equal(applyEvent("RESOLVED",secondEvent()).reason,"transition.notAllowed"));
test("unknown case does not resolve on direct event",()=>assert.equal(applyEvent("UNKNOWN",secondEvent()).state,"UNKNOWN"));
test("reopen event moves resolved to open",()=>assert.equal(applyEvent("RESOLVED",event({type:"REOPEN",toState:"OPEN"})).state,"OPEN"));
test("invalid resolve target does not change state",()=>assert.equal(applyEvent("OPEN",event({type:"RESOLVE",toState:"NEEDS_SOURCE"})).state,"OPEN"));
test("invalid type does not mutate original event",()=>{
  const input=event({type:"INVALID"}),copy=clone(input);
  applyEvent("OPEN",input);assert.deepEqual(input,copy);
});

test("replaying open and resolve ends resolved",()=>assert.equal(replayCase("OPEN",[event(),secondEvent()]).state,"RESOLVED"));
test("replaying empty log retains open",()=>assert.equal(replayCase("OPEN",[]).state,"OPEN"));
test("replaying non-array log becomes unknown",()=>assert.equal(replayCase("OPEN",null).state,"UNKNOWN"));
test("replay sorts by sequence without changing input",()=>{
  const events=[secondEvent(),event()],before=clone(events);
  assert.equal(replayCase("OPEN",events).state,"RESOLVED");
  assert.deepEqual(events,before);
});
test("replay logs rejected transition",()=>assert.ok(replayCase("RESOLVED",[secondEvent()]).rejected.includes("transition.notAllowed")));
test("replay retains stable event IDs",()=>assert.deepEqual(replayCase("OPEN",[event()]).steps.map(s=>s.eventId),["event-one"]));
test("replay records source and destination",()=>{
  const result=replayCase("OPEN",[secondEvent()]);
  assert.equal(result.steps[0].from,"OPEN");
  assert.equal(result.steps[0].to,"RESOLVED");
});
test("replay never fabricates a missing event ID",()=>assert.equal(replayCase("OPEN",[{type:"NOTE",sequence:1}]).steps[0].eventId,null));

test("case and event records reconcile when state matches",()=>assert.deepEqual(reconcileEventState([caseRecord()],[event(),secondEvent()]).findings,[]));
test("state mismatch is reported",()=>{
  const result=reconcileEventState([caseRecord({state:"OPEN"})],[event(),secondEvent()]);
  assert.ok(codes(result.findings).includes("case.stateMismatch"));
});
test("orphan case event is reported",()=>{
  const result=reconcileEventState([caseRecord()],[event({caseId:"case-two"})]);
  assert.ok(codes(result.findings).includes("log.orphanCase"));
});
test("malformed case collection is reported",()=>assert.ok(codes(reconcileEventState(null,[]).findings).includes("cases.array")));
test("malformed event sequence is reported",()=>assert.ok(codes(reconcileEventState([caseRecord()],[event({sequence:4})]).findings).includes("log.sequenceGap")));
test("reconciliation retains stored and replayed states",()=>{
  const result=reconcileEventState([caseRecord()],[event(),secondEvent()]);
  assert.deepEqual([result.rows[0].stored,result.rows[0].replayed],["RESOLVED","RESOLVED"]);
});
test("reconciliation does not leak source descriptions",()=>{
  const result=reconcileEventState([caseRecord()],[event({caseId:"other-case"})]);
  assert.equal(JSON.stringify(result).includes("Source-backed description"),false);
});

test("event statistics count source review events",()=>assert.equal(eventStatistics([caseRecord()],[event({type:"REVIEW"})]).reviewed,1));
test("event statistics count orphan events",()=>assert.equal(eventStatistics([caseRecord()],[event({caseId:"other-case"})]).orphan,1));
test("event statistics report zero for absent logs",()=>assert.equal(eventStatistics([],null).count,0));
test("event statistics preserve all event categories",()=>assert.equal(Object.keys(eventStatistics([],[]).counts).length,8));
test("event statistics count resolve events",()=>assert.equal(eventStatistics([caseRecord()],[secondEvent()]).counts.RESOLVE,1));
test("event statistics ignore unknown event types",()=>assert.equal(eventStatistics([caseRecord()],[event({type:"INVALID"})]).counts.OPEN,0));

test("timeline returns only matching case events",()=>{
  const result=caseTimeline([event(),secondEvent(),event({id:"other",caseId:"case-two"})],"case-one");
  assert.equal(result.length,2);
});
test("timeline sorts by increasing sequence",()=>assert.deepEqual(caseTimeline([secondEvent(),event()],"case-one").map(x=>x.sequence),[1,2]));
test("timeline rejects invalid case identifier",()=>assert.deepEqual(caseTimeline([event()],"bad id"),[]));
test("timeline rejects missing log",()=>assert.deepEqual(caseTimeline(null,"case-one"),[]));
test("timeline does not expose note text",()=>assert.equal(JSON.stringify(caseTimeline([event({message:"Private text"})],"case-one")).includes("Private text"),false));

test("append accepts next sequential event",()=>assert.equal(planAppend([event()],secondEvent()).accepted,true));
test("append rejects duplicate event identifier",()=>assert.equal(planAppend([event()],event({sequence:2})).accepted,false));
test("append rejects missing sequence",()=>assert.equal(planAppend([event()],secondEvent({sequence:3})).accepted,false));
test("append rejects regressed date",()=>assert.equal(planAppend([event({occurredOn:TODAY})],secondEvent({occurredOn:"2026-11-18"})).accepted,false));
test("append rejects structurally invalid event",()=>assert.equal(planAppend([event()],secondEvent({id:"bad id"})).accepted,false));
test("append does not change original event list",()=>{
  const events=[event()],snapshot=clone(events);
  planAppend(events,secondEvent());assert.deepEqual(events,snapshot);
});
test("append accepts a separate case with initial sequence",()=>assert.equal(planAppend([event()],event({id:"other",caseId:"case-two",sequence:1})).accepted,true));
test("append is a proposal, not a disk write",()=>{
  const result=planAppend([event()],secondEvent());
  assert.equal(result.events.length,2);
});

test("resolved case with complete history is safe",()=>assert.equal(historySafety(caseRecord(),[event(),secondEvent()]).decision,"READY"));
test("resolved case lacking resolution event is held",()=>assert.equal(historySafety(caseRecord(),[event()]).decision,"HOLD"));
test("unknown evidence stays unknown for pending case",()=>assert.equal(historySafety(caseRecord({state:"OPEN",evidence:"UNKNOWN"}),[event()]).decision,"UNKNOWN"));
test("invalid history is held",()=>assert.equal(historySafety(caseRecord(),[event({sequence:2})]).decision,"HOLD"));
test("invalid case record is held",()=>assert.equal(historySafety(caseRecord({id:"bad id"}),[]).decision,"HOLD"));
test("open case remains held",()=>assert.equal(historySafety(caseRecord({state:"OPEN"}),[event()]).decision,"HOLD"));
test("history safety does not mutate original records",()=>{
  const item=caseRecord(),log=[event(),secondEvent()],before=clone([item,log]);
  historySafety(item,log);assert.deepEqual([item,log],before);
});
