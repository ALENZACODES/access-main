import type { Packet, Question, Stop, Locale } from './model.ts';
import { answerLabel, labels, reviewLabel, topicLabel } from './copy.ts';
export type Priority = 'MISSING_ANSWER' | 'MISSING_SOURCE' | 'FOLLOW_UP' | 'RECHECK' | 'READY_TO_SHARE';
export interface ReviewItem {
 readonly stopId: string; readonly questionId: string; readonly stopName: string; readonly prompt: string;
 readonly priority: Priority; readonly notes: string; readonly sourceName: string; readonly sourceDate: string;
 readonly answer: string; readonly review: string;
}
export interface ReviewBoard { readonly urgent: readonly ReviewItem[]; readonly incomplete: readonly ReviewItem[]; readonly recorded: readonly ReviewItem[]; readonly total: number }
export function questionPriority(question: Question): Priority {
 if(question.answer==='UNKNOWN')return 'MISSING_ANSWER';
 if(question.source.tier==='UNKNOWN'||question.source.name==='UNKNOWN'||question.source.licence==='UNKNOWN'||question.source.date==='UNKNOWN')return 'MISSING_SOURCE';
 if(question.review==='NEEDS_CONTACT')return 'FOLLOW_UP';
 if(question.review==='NEEDS_RECHECK'||question.review==='UNKNOWN')return 'RECHECK';
 return 'READY_TO_SHARE';
}
export function reviewItem(stop: Stop, question: Question, locale: Locale): ReviewItem {
 return {stopId:stop.id,questionId:question.id,stopName:stop.title[locale],prompt:question.prompt[locale],
  priority:questionPriority(question),notes:question.details[locale],sourceName:question.source.name,sourceDate:question.source.date,
  answer:answerLabel(locale,question.answer),review:reviewLabel(locale,question.review)};
}
export function reviewBoard(packet: Packet, locale: Locale): ReviewBoard {
 const all=packet.stops.flatMap(stop=>stop.questions.map(q=>reviewItem(stop,q,locale)));
 return {urgent:all.filter(item=>item.priority==='MISSING_ANSWER'||item.priority==='FOLLOW_UP'),
  incomplete:all.filter(item=>item.priority==='MISSING_SOURCE'||item.priority==='RECHECK'),
  recorded:all.filter(item=>item.priority==='READY_TO_SHARE'),total:all.length};
}
export function followUpQuestions(packet: Packet, locale: Locale): string[] {
 const board=reviewBoard(packet,locale);
 return [...board.urgent,...board.incomplete].map(item=>`${item.stopName}: ${item.prompt} (${item.priority})`);
}
export function topicCoverage(packet: Packet): Array<{topic: Question['topic']; count: number; unknown: number}> {
 const counts=new Map<Question['topic'],{count:number;unknown:number}>();
 for(const stop of packet.stops)for(const question of stop.questions){
  const found=counts.get(question.topic)??{count:0,unknown:0};
  counts.set(question.topic,{count:found.count+1,unknown:found.unknown+(question.answer==='UNKNOWN'?1:0)});
 }
 return [...counts].map(([topic,count])=>({topic,...count}));
}
export function handoffChecklist(packet: Packet, locale: Locale): string {
 const c=labels(locale),board=reviewBoard(packet,locale),out=[c.title,c.safety,c.cannotInfer,''];
 for(const stop of packet.stops){
  out.push(stop.title[locale]);
  if(stop.questions.length===0){out.push(c.noQuestions);continue;}
  for(const question of stop.questions){
   const p=questionPriority(question),status=p==='READY_TO_SHARE'?'[x]':'[ ]';
   out.push(`${status} ${topicLabel(locale,question.topic)} — ${question.prompt[locale]}`);
   out.push(`  ${c.answer}: ${answerLabel(locale,question.answer)}`);
   out.push(`  ${c.provenance}: ${question.source.name} | ${question.source.licence} | ${question.source.date}`);
  }
 }
 out.push('',`${c.questions}: ${board.total}`,`${c.gaps}: ${board.urgent.length+board.incomplete.length}`);
 return out.join('\n');
}
export function destinationChecklist(packet: Packet, locale: Locale): string[] {
 const seen=new Set<string>(),items:string[]=[];
 for(const stop of packet.stops)for(const q of stop.questions){
  if(questionPriority(q)==='READY_TO_SHARE')continue;
  const question=`${stop.title[locale]} — ${q.prompt[locale]}`;
  if(!seen.has(question)){seen.add(question);items.push(question);}
 }
 return items;
}
