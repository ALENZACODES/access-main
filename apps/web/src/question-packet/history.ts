import { safeId, safeText, validDate, type Answer, type Packet, type Question, type Source } from './model.ts';
export type EventType = 'QUESTION_ADDED' | 'ANSWER_RECORDED' | 'ANSWER_CHANGED' | 'SOURCE_CHANGED' | 'QUESTION_REMOVED' | 'REVIEW_CHANGED';
export interface EvidenceEvent {
  readonly id: string;
  readonly stopId: string;
  readonly questionId: string;
  readonly type: EventType;
  readonly recordedOn: string;
  readonly beforeAnswer: Answer | null;
  readonly afterAnswer: Answer | null;
  readonly beforeSource: Source | null;
  readonly afterSource: Source | null;
  readonly summary: string;
}
export interface ChangeLedger { readonly version: 1; readonly events: readonly EvidenceEvent[] }
export interface HistoryIssue { readonly code: string; readonly path: string }
export const EVENT_TYPES: readonly EventType[] = ['QUESTION_ADDED','ANSWER_RECORDED','ANSWER_CHANGED','SOURCE_CHANGED','QUESTION_REMOVED','REVIEW_CHANGED'];
export const MAX_EVENTS = 2000;
export function emptyLedger(): ChangeLedger { return {version:1,events:[]}; }
export function sourceFingerprint(source: Source): string {
  return JSON.stringify([source.name,source.url,source.licence,source.date,source.tier]);
}
export function questionsById(packet: Packet): Map<string,{stopId:string;question:Question}> {
  const entries=new Map<string,{stopId:string;question:Question}>();
  for (const stop of packet.stops) for (const question of stop.questions) entries.set(`${stop.id}/${question.id}`,{stopId:stop.id,question});
  return entries;
}
export function createEvents(previous: Packet, next: Packet, date: string, prefix='event'): EvidenceEvent[] {
  if (!validDate(date)) return [];
  const before=questionsById(previous),after=questionsById(next);
  const out: EvidenceEvent[]=[];
  let number=1;
  const add=(stopId:string,questionId:string,type:EventType,a:Question|null,b:Question|null,summary:string)=>{
    out.push({id:`${prefix}-${number++}`,stopId,questionId,type,recordedOn:date,
      beforeAnswer:a?.answer??null,afterAnswer:b?.answer??null,beforeSource:a?.source??null,afterSource:b?.source??null,summary});
  };
  for(const [key,item] of after){
    const older=before.get(key)?.question;
    if(!older){add(item.stopId,item.question.id,'QUESTION_ADDED',null,item.question,'Question added to local packet');continue;}
    if(older.answer!==item.question.answer){
      add(item.stopId,item.question.id,older.answer==='UNKNOWN'?'ANSWER_RECORDED':'ANSWER_CHANGED',older,item.question,'Answer changed in local packet');
    }
    if(sourceFingerprint(older.source)!==sourceFingerprint(item.question.source)){
      add(item.stopId,item.question.id,'SOURCE_CHANGED',older,item.question,'Evidence source changed in local packet');
    }
    if(older.review!==item.question.review){
      add(item.stopId,item.question.id,'REVIEW_CHANGED',older,item.question,'Follow-up status changed in local packet');
    }
  }
  for(const [key,item] of before)if(!after.has(key))add(item.stopId,item.question.id,'QUESTION_REMOVED',item.question,null,'Question removed from local packet');
  return out;
}
export function appendEvents(ledger: ChangeLedger, events: readonly EvidenceEvent[]): ChangeLedger {
  if(events.length===0)return ledger;
  const seen=new Set(ledger.events.map(event=>event.id));
  const added=events.filter(event=>!seen.has(event.id));
  if(added.length===0)return ledger;
  return {version:1,events:[...ledger.events,...added].slice(-MAX_EVENTS)};
}
export function evidenceEventsFor(ledger: ChangeLedger, stopId: string, questionId: string): EvidenceEvent[] {
  return ledger.events.filter(event=>event.stopId===stopId && event.questionId===questionId);
}
export function eventIssues(event: unknown, path: string): HistoryIssue[] {
  if(event===null||typeof event!=='object'||Array.isArray(event))return [{code:'event.object',path}];
  const value=event as Record<string,unknown>;const out: HistoryIssue[]=[];
  if(!safeId(value.id))out.push({code:'event.id',path:`${path}.id`});
  if(!safeId(value.stopId))out.push({code:'event.stop',path:`${path}.stopId`});
  if(!safeId(value.questionId))out.push({code:'event.question',path:`${path}.questionId`});
  if(!EVENT_TYPES.includes(value.type as EventType))out.push({code:'event.type',path:`${path}.type`});
  if(!validDate(value.recordedOn))out.push({code:'event.date',path:`${path}.recordedOn`});
  if(!safeText(value.summary,300))out.push({code:'event.summary',path:`${path}.summary`});
  return out;
}
export function ledgerIssues(ledger: unknown): HistoryIssue[] {
  if(ledger===null||typeof ledger!=='object'||Array.isArray(ledger))return [{code:'ledger.object',path:'$'}];
  const value=ledger as Record<string,unknown>,out:HistoryIssue[]=[];
  if(value.version!==1)out.push({code:'ledger.version',path:'$.version'});
  if(!Array.isArray(value.events)||value.events.length>MAX_EVENTS)return [...out,{code:'ledger.events',path:'$.events'}];
  const ids=new Set<string>();
  for(const [i,event] of value.events.entries()){
    out.push(...eventIssues(event,`$.events[${i}]`));
    if(event&&typeof event==='object'&&!Array.isArray(event)){
      const id=(event as Record<string,unknown>).id;
      if(typeof id==='string'){
        if(ids.has(id))out.push({code:'event.duplicate',path:`$.events[${i}].id`});
        ids.add(id);
      }
    }
  }
  return out;
}
export function eventPlainText(ledger: ChangeLedger, locale: 'en'|'fr'): string {
  const title=locale==='en'?'Local evidence change history':'Historique local des changements d’éléments';
  const out=[title];
  for(const event of ledger.events)out.push(`${event.recordedOn} | ${event.stopId}/${event.questionId} | ${event.type} | ${event.beforeAnswer??'UNKNOWN'} → ${event.afterAnswer??'UNKNOWN'} | ${event.summary}`);
  return out.join('\n');
}