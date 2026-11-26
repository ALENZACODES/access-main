/** Device-local preparation notes. These are not verified public accessibility facts. */
export type Locale = 'en' | 'fr';
export type Answer = 'UNKNOWN' | 'YES_REPORTED' | 'NO_REPORTED' | 'PARTIAL_REPORTED' | 'NOT_APPLICABLE';
export type Topic = 'arrival' | 'entrance' | 'circulation' | 'lift' | 'washroom' | 'service' | 'departure' | 'custom';
export type SourceTier = 'UNKNOWN' | 'FIRST_HAND' | 'OFFICIAL' | 'COMMUNITY' | 'OTHER';
export type ReviewState = 'UNKNOWN' | 'NEEDS_CONTACT' | 'NEEDS_RECHECK' | 'RECORDED';
export interface TwoLanguages { readonly en: string; readonly fr: string }
export interface Source { readonly name: string; readonly url: string; readonly licence: string; readonly date: string; readonly tier: SourceTier }
export interface Question {
  readonly id: string;
  readonly topic: Topic;
  readonly prompt: TwoLanguages;
  readonly answer: Answer;
  readonly details: TwoLanguages;
  readonly source: Source;
  readonly review: ReviewState;
  readonly order: number;
}
export interface Stop { readonly id: string; readonly title: TwoLanguages; readonly questions: readonly Question[]; readonly order: number }
export interface Packet { readonly version: 1; readonly title: TwoLanguages; readonly createdOn: string; readonly stops: readonly Stop[] }
export interface Finding { readonly path: string; readonly code: string; readonly severity: 'error' | 'review' }
export interface Summary { readonly questions: number; readonly answered: number; readonly unknown: number; readonly toContact: number; readonly toRecheck: number; readonly sourced: number; readonly gapIds: readonly string[] }
export const TOPICS: readonly Topic[] = ['arrival','entrance','circulation','lift','washroom','service','departure','custom'];
export const ANSWERS: readonly Answer[] = ['UNKNOWN','YES_REPORTED','NO_REPORTED','PARTIAL_REPORTED','NOT_APPLICABLE'];
export const TIERS: readonly SourceTier[] = ['UNKNOWN','FIRST_HAND','OFFICIAL','COMMUNITY','OTHER'];
export const REVIEWS: readonly ReviewState[] = ['UNKNOWN','NEEDS_CONTACT','NEEDS_RECHECK','RECORDED'];
export const MAX_IMPORT_BYTES = 512 * 1024;
export const MAX_STOPS = 50;
export const MAX_QUESTIONS = 100;

export function record(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
export function forbiddenControl(value: string): boolean {
  for (const char of value) { const n = char.codePointAt(0) ?? 0; if (n < 32 || (n >= 127 && n <= 159)) return true; }
  return false;
}
export function safeText(value: unknown, maxLength = 500): value is string {
  return typeof value === 'string' && value.length <= maxLength && value.trim().length > 0 && !forbiddenControl(value);
}
export function safeId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 64 && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value);
}
export function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y,m,d] = value.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined || y < 1970 || y > 9999) return false;
  const date = new Date(Date.UTC(y,m-1,d));
  return date.getUTCFullYear() === y && date.getUTCMonth()+1 === m && date.getUTCDate() === d;
}
export function safeUrl(value: unknown): boolean {
  if (typeof value !== 'string' || !value || value.length > 2048 || forbiddenControl(value) || /\s/.test(value)) return false;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash && !!hostname &&
      hostname !== 'localhost' && !hostname.endsWith('.local') && !hostname.endsWith('.localhost') &&
      !['127.0.0.1','0.0.0.0','[::1]'].includes(hostname);
  } catch { return false; }
}
export function newSource(): Source { return { name:'UNKNOWN',url:'UNKNOWN',licence:'UNKNOWN',date:'UNKNOWN',tier:'UNKNOWN' }; }
export function unknownLanguage(): TwoLanguages { return { en:'UNKNOWN', fr:'UNKNOWN' }; }
export function emptyPacket(today: string): Packet { return { version:1, title:{en:'Journey question packet',fr:'Questions pour le parcours'},createdOn:validDate(today)?today:'1970-01-01',stops:[] }; }
export function blankQuestion(id: string, order = 0): Question {
  return { id,topic:'custom',prompt:unknownLanguage(),answer:'UNKNOWN',details:unknownLanguage(),source:newSource(),review:'UNKNOWN',order };
}
export function blankStop(id: string, order = 0): Stop { return { id,title:unknownLanguage(),questions:[],order }; }
export function frenchErrors(value: string): string[] {
  const errors: string[] = [];
  if (value.includes("'")) errors.push('apostrophe');
  for (let i=0;i<value.length;i++) {
    if (value[i] === ':' && i>0 && value[i-1] !== '\u00a0') errors.push('colon');
    if ([';','!','?'].includes(value[i] ?? '') && i>0 && value[i-1] !== '\u202f') errors.push('thin-space');
    if (value[i] === '«' && value[i+1] !== '\u202f') errors.push('opening-guillemet');
    if (value[i] === '»' && value[i-1] !== '\u202f') errors.push('closing-guillemet');
  }
  return [...new Set(errors)];
}
function finding(code: string, path: string, severity: Finding['severity']='error'): Finding { return {code,path,severity}; }
export function languageFindings(value: unknown, path: string): Finding[] {
  if (!record(value)) return [finding('language.object',path)];
  const out: Finding[] = [];
  if (!safeText(value.en,300)) out.push(finding('language.en',`${path}.en`));
  if (!safeText(value.fr,300)) out.push(finding('language.fr',`${path}.fr`));
  else for (const code of frenchErrors(value.fr)) out.push(finding(`fr.${code}`,`${path}.fr`));
  return out;
}
export function sourceFindings(value: unknown, path: string): Finding[] {
  if (!record(value)) return [finding('source.object',path)];
  const out: Finding[]=[];
  if (!TIERS.includes(value.tier as SourceTier)) out.push(finding('source.tier',`${path}.tier`));
  if (!safeText(value.name,150)) out.push(finding('source.name',`${path}.name`));
  if (!safeText(value.licence,150)) out.push(finding('source.licence',`${path}.licence`));
  if (value.url !== 'UNKNOWN' && !safeUrl(value.url)) out.push(finding('source.url',`${path}.url`));
  if (value.date !== 'UNKNOWN' && !validDate(value.date)) out.push(finding('source.date',`${path}.date`));
  if (value.tier === 'UNKNOWN' || value.name === 'UNKNOWN' || value.url === 'UNKNOWN' || value.licence === 'UNKNOWN' || value.date === 'UNKNOWN')
    out.push(finding('source.unknown',path,'review'));
  return out;
}
export function questionFindings(value: unknown, path: string): Finding[] {
  if (!record(value)) return [finding('question.object',path)];
  const out: Finding[]=[];
  if (!safeId(value.id)) out.push(finding('question.id',`${path}.id`));
  if (!TOPICS.includes(value.topic as Topic)) out.push(finding('question.topic',`${path}.topic`));
  if (!ANSWERS.includes(value.answer as Answer)) out.push(finding('question.answer',`${path}.answer`));
  if (!REVIEWS.includes(value.review as ReviewState)) out.push(finding('question.review',`${path}.review`));
  if (!Number.isSafeInteger(value.order) || Number(value.order)<0) out.push(finding('question.order',`${path}.order`));
  out.push(...languageFindings(value.prompt,`${path}.prompt`),...languageFindings(value.details,`${path}.details`));
  out.push(...sourceFindings(value.source,`${path}.source`));
  if (value.answer === 'UNKNOWN') out.push(finding('question.unknown',path,'review'));
  return out;
}
export function stopFindings(value: unknown, path: string): Finding[] {
  if (!record(value)) return [finding('stop.object',path)];
  const out: Finding[]=[];
  if (!safeId(value.id)) out.push(finding('stop.id',`${path}.id`));
  if (!Number.isSafeInteger(value.order) || Number(value.order)<0) out.push(finding('stop.order',`${path}.order`));
  out.push(...languageFindings(value.title,`${path}.title`));
  if (!Array.isArray(value.questions) || value.questions.length>MAX_QUESTIONS) return [...out,finding('stop.questions',`${path}.questions`)];
  const ids=new Set<string>();
  for (const [i,q] of value.questions.entries()) {
    out.push(...questionFindings(q,`${path}.questions[${i}]`));
    if (record(q) && typeof q.id==='string') {
      if (ids.has(q.id)) out.push(finding('question.duplicate',`${path}.questions[${i}].id`));
      ids.add(q.id);
    }
  }
  return out;
}
export function packetFindings(value: unknown): Finding[] {
  if (!record(value)) return [finding('packet.object','$')];
  const out: Finding[]=[];
  if (value.version!==1) out.push(finding('packet.version','$.version'));
  if (!validDate(value.createdOn)) out.push(finding('packet.date','$.createdOn'));
  out.push(...languageFindings(value.title,'$.title'));
  if (!Array.isArray(value.stops) || value.stops.length>MAX_STOPS) return [...out,finding('packet.stops','$.stops')];
  const ids=new Set<string>();
  for (const [i,stop] of value.stops.entries()) {
    out.push(...stopFindings(stop,`$.stops[${i}]`));
    if (record(stop) && typeof stop.id==='string') {
      if (ids.has(stop.id)) out.push(finding('stop.duplicate',`$.stops[${i}].id`));
      ids.add(stop.id);
    }
  }
  return out.sort((a,b)=>a.path.localeCompare(b.path,'en')||a.code.localeCompare(b.code,'en'));
}
export function parsePacket(text: string): { packet: Packet | null; findings: readonly Finding[] } {
  if (new TextEncoder().encode(text).length>MAX_IMPORT_BYTES) return {packet:null,findings:[finding('import.too-large','$')]};
  let parsed: unknown;
  try { parsed=JSON.parse(text) as unknown; } catch { return {packet:null,findings:[finding('import.json','$')]}; }
  const findings=packetFindings(parsed);
  if (findings.some(item=>item.severity==='error')) return {packet:null,findings};
  return {packet:parsed as Packet,findings};
}
export function addStop(packet: Packet, stop: Stop): Packet {
  if (packet.stops.some(s=>s.id===stop.id) || packet.stops.length>=MAX_STOPS) return packet;
  return {...packet,stops:[...packet.stops,{...stop,order:packet.stops.length}]};
}
export function replaceStop(packet: Packet, stop: Stop): Packet { return {...packet,stops:packet.stops.map(s=>s.id===stop.id?{...stop,order:s.order}:s)}; }
export function removeStop(packet: Packet, id: string): Packet { return {...packet,stops:packet.stops.filter(s=>s.id!==id).map((s,i)=>({...s,order:i}))}; }
export function moveStop(packet: Packet, id: string, delta: -1 | 1): Packet {
  const stops=[...packet.stops];const i=stops.findIndex(s=>s.id===id);if(i<0||i+delta<0||i+delta>=stops.length)return packet;
  const first=stops[i],second=stops[i+delta];if(!first||!second)return packet;
  stops[i]=second;stops[i+delta]=first;return {...packet,stops:stops.map((s,index)=>({...s,order:index}))};
}
export function addQuestion(packet: Packet, stopId: string, question: Question): Packet {
  return {...packet,stops:packet.stops.map(stop=>stop.id!==stopId||stop.questions.length>=MAX_QUESTIONS||stop.questions.some(q=>q.id===question.id)
    ?stop:{...stop,questions:[...stop.questions,{...question,order:stop.questions.length}]})};
}
export function replaceQuestion(packet: Packet, stopId: string, question: Question): Packet {
  return {...packet,stops:packet.stops.map(s=>s.id!==stopId?s:{...s,questions:s.questions.map(q=>q.id===question.id?{...question,order:q.order}:q)})};
}
export function removeQuestion(packet: Packet, stopId: string, id: string): Packet {
  return {...packet,stops:packet.stops.map(s=>s.id!==stopId?s:{...s,questions:s.questions.filter(q=>q.id!==id).map((q,i)=>({...q,order:i}))})};
}
export function moveQuestion(packet: Packet, stopId: string, id: string, delta: -1 | 1): Packet {
  return {...packet,stops:packet.stops.map(stop=>{
    if(stop.id!==stopId)return stop;
    const questions=[...stop.questions],i=questions.findIndex(q=>q.id===id);
    if(i<0||i+delta<0||i+delta>=questions.length)return stop;
    const a=questions[i],b=questions[i+delta];if(!a||!b)return stop;
    questions[i]=b;questions[i+delta]=a;
    return {...stop,questions:questions.map((q,index)=>({...q,order:index}))};
  })};
}
export function summary(packet: Packet): Summary {
  const questions=packet.stops.flatMap(s=>s.questions), gapIds:string[]=[];
  for(const q of questions)if(q.answer==='UNKNOWN'||q.source.tier==='UNKNOWN'||q.review!=='RECORDED')gapIds.push(q.id);
  return {questions:questions.length,answered:questions.filter(q=>q.answer!=='UNKNOWN').length,unknown:questions.filter(q=>q.answer==='UNKNOWN').length,
    toContact:questions.filter(q=>q.review==='NEEDS_CONTACT').length,toRecheck:questions.filter(q=>q.review==='NEEDS_RECHECK').length,
    sourced:questions.filter(q=>q.source.tier!=='UNKNOWN'&&q.source.name!=='UNKNOWN'&&q.source.licence!=='UNKNOWN').length,gapIds};
}