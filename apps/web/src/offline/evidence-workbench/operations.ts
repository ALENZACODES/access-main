import { DECISIONS, FEATURES, STATES, TIERS, UNKNOWN, validateDocument, validId, type Decision, type EvidenceItem, type EvidenceState, type Feature, type Tier, type WorkbenchDocument, type Result } from './model.ts';
export type Edit = { kind: 'add'; item: EvidenceItem } | { kind: 'update'; id: string; changes: Partial<EvidenceItem> } | { kind: 'remove'; id: string } | { kind: 'decision'; id: string; decision: Decision };
export interface HistoryEntry { at: string; kind: Edit['kind']; id: string; before: EvidenceItem | null; after: EvidenceItem | null; }
export interface Workspace { document: WorkbenchDocument; history: HistoryEntry[]; }
export type Filter = { text?: string; feature?: Feature | 'all'; state?: EvidenceState | 'all'; decision?: Decision | 'all'; tier?: Tier | 'all'; placeId?: string };
const tracked = ['id', 'placeId', 'label', 'feature', 'state', 'source', 'licence', 'retrievedOn', 'tier', 'note', 'decision'] as const;
export function createWorkspace(document: WorkbenchDocument): Workspace { return { document, history: [] }; }
function success<T>(value: T): Result<T> { return { ok: true, value, problems: [] }; }
function failure<T>(code: string, path: string): Result<T> { return { ok: false, value: null, problems: [{ code, path }] }; }
export function updateWorkspace(workspace: Workspace, edit: Edit, at: string, today: string): Result<Workspace> {
  if (edit.kind !== 'add' && !validId(edit.id)) return failure('INVALID_ID','id');
  const items = workspace.document.items.map(item => ({ ...item }));
  const id = edit.kind === 'add' ? edit.item.id : edit.id;
  const index = items.findIndex(item => item.id === id);
  const before = index >= 0 ? { ...items[index] } : null;
  if (edit.kind === 'add') {
    if (index !== -1) return failure('ALREADY_EXISTS',id);
    items.push({ ...edit.item });
  } else if (index === -1) return failure('NOT_FOUND',id);
  else if (edit.kind === 'remove') items.splice(index,1);
  else if (edit.kind === 'decision') items[index] = { ...items[index], decision: edit.decision };
  else {
    if (Object.hasOwn(edit.changes,'id') && edit.changes.id !== id) return failure('IMMUTABLE_ID',id);
    items[index] = { ...items[index], ...edit.changes };
  }
  const checked = validateDocument({ version: 1, items }, today);
  if (!checked.ok) return checked;
  const after = checked.value.items.find(item => item.id === id) ?? null;
  const history = [...workspace.history, { at, kind: edit.kind, id, before, after }];
  return success({ document: checked.value, history });
}
export function filterItems(document: WorkbenchDocument, filter: Filter = {}): EvidenceItem[] {
  const word = (filter.text ?? '').trim().toLocaleLowerCase();
  return document.items.filter(item =>
    (!filter.feature || filter.feature === 'all' || item.feature === filter.feature) &&
    (!filter.state || filter.state === 'all' || item.state === filter.state) &&
    (!filter.decision || filter.decision === 'all' || item.decision === filter.decision) &&
    (!filter.tier || filter.tier === 'all' || item.tier === filter.tier) &&
    (!filter.placeId || item.placeId === filter.placeId) &&
    (!word || [item.id,item.placeId,item.label,item.source,item.note,item.licence].some(value => value.toLocaleLowerCase().includes(word)))
  ).sort((a,b) => a.placeId.localeCompare(b.placeId) || a.feature.localeCompare(b.feature) || a.id.localeCompare(b.id));
}
export function countSummary(document: WorkbenchDocument) {
  const states: Record<EvidenceState,number> = { UNKNOWN:0, reported:0, 'not-reported':0 };
  const decisions: Record<Decision,number> = { unreviewed:0, 'needs-source':0, 'needs-recheck':0, reviewed:0 };
  const features = Object.fromEntries(FEATURES.map(value => [value,0])) as Record<Feature,number>;
  const tiers = Object.fromEntries(TIERS.map(value => [value,0])) as Record<Tier,number>;
  const places = new Set<string>();
  for(const item of document.items) { states[item.state]++; decisions[item.decision]++; features[item.feature]++; tiers[item.tier]++; places.add(item.placeId); }
  return { total:document.items.length, places:places.size, states, decisions, features, tiers };
}
export type ChangeKind = 'added'|'removed'|'changed'|'unchanged';
export interface Comparison { id:string; kind:ChangeKind; before:EvidenceItem|null; after:EvidenceItem|null; fields:string[] }
export function compareDocuments(before: WorkbenchDocument, after: WorkbenchDocument): Comparison[] {
  const old = new Map(before.items.map(item => [item.id,item]));
  const next = new Map(after.items.map(item => [item.id,item]));
  const ids = [...new Set([...old.keys(),...next.keys()])].sort();
  return ids.map(id => {
    const first = old.get(id) ?? null, second = next.get(id) ?? null;
    const fields = first && second ? tracked.filter(key=>first[key]!==second[key]) : [];
    const kind:ChangeKind = !first?'added':!second?'removed':fields.length?'changed':'unchanged';
    return {id,kind,before:first,after:second,fields:[...fields]};
  });
}
export function groupByPlace(document:WorkbenchDocument):Array<{placeId:string;items:EvidenceItem[]}> {
  const places = new Map<string,EvidenceItem[]>();
  for (const item of document.items) places.set(item.placeId,[...(places.get(item.placeId)??[]),item]);
  return [...places].sort(([a],[b])=>a.localeCompare(b)).map(([placeId,items])=>({placeId,items:items.sort((a,b)=>a.id.localeCompare(b.id))}));
}
export function overdueItems(document:WorkbenchDocument,today:string,days=365):EvidenceItem[] {
  const todayTime=Date.parse(`${today}T00:00:00Z`);
  return document.items.filter(item=> (todayTime-Date.parse(`${item.retrievedOn}T00:00:00Z`))/86400000>days);
}
export function needsReview(item:EvidenceItem,today:string):string[] {
  const flags:string[]=[];
  if(item.state===UNKNOWN) flags.push('UNKNOWN_STATE');
  if(item.tier==='unknown') flags.push('UNKNOWN_TIER');
  if(item.licence===UNKNOWN) flags.push('UNKNOWN_LICENCE');
  if(item.decision==='needs-source') flags.push('SOURCE_REQUESTED');
  if(item.decision==='needs-recheck') flags.push('RECHECK_REQUESTED');
  if(item.decision==='unreviewed') flags.push('NOT_REVIEWED');
  if((Date.parse(`${today}T00:00:00Z`)-Date.parse(`${item.retrievedOn}T00:00:00Z`))/86400000>365) flags.push('OLDER_THAN_YEAR');
  return flags;
}
export function reviewQueue(document:WorkbenchDocument,today:string) {
  return document.items.flatMap(item=>needsReview(item,today).map(code=>({id:item.id,placeId:item.placeId,code}))).sort((a,b)=>a.placeId.localeCompare(b.placeId)||a.id.localeCompare(b.id)||a.code.localeCompare(b.code));
}
export function safeSelect(value:string,kind:'feature'|'state'|'tier'|'decision'):boolean {
  if(kind==='feature') return FEATURES.some(item=>item===value);
  if(kind==='state') return STATES.some(item=>item===value);
  if(kind==='tier') return TIERS.some(item=>item===value);
  return DECISIONS.some(item=>item===value);
}
export function draftId(workspace:Workspace):string {
  const used=new Set(workspace.document.items.map(item=>item.id));
  for(let n=1;n<=1000;n++)if(!used.has(`local-${n}`))return `local-${n}`;
  return '';
}
export function redactHistory(history:HistoryEntry[]) {
  return history.map(entry=>({at:entry.at,kind:entry.kind,id:entry.id,hadBefore:!!entry.before,hasAfter:!!entry.after}));
}
