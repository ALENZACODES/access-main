import { FEATURES, UNKNOWN, type EvidenceItem, type Feature, type WorkbenchDocument } from './model.ts';
import { compareDocuments, needsReview, type Comparison } from './operations.ts';
export interface CoverageCell { placeId:string; feature:Feature; count:number; state:string; mixed:boolean; ids:string[]; sources:number; dates:string[] }
export interface Contradiction { placeId:string; feature:Feature; ids:string[]; reason:string }
export interface Impact { placeId:string; feature:Feature; before:string; after:string; reason:string; ids:string[] }
export interface EvidenceSummary { total:number; unresolved:number; contradictions:number; places:number; oldest:string|null; newest:string|null }
export function sourceCount(rows:readonly EvidenceItem[]):number { return new Set(rows.map(item=>`${item.source}\u0001${item.licence}`)).size; }
export function stateSummary(rows:readonly EvidenceItem[]):string {
  if(rows.length===0)return UNKNOWN;
  const known = new Set(rows.map(row=>row.state));
  if(known.size===1)return rows[0]?.state ?? UNKNOWN;
  return UNKNOWN;
}
export function buildCoverage(document:WorkbenchDocument, selectedFeatures:readonly Feature[]=FEATURES):CoverageCell[] {
  const places=[...new Set(document.items.map(item=>item.placeId))].sort();
  return places.flatMap(placeId=>selectedFeatures.map(feature=>{
    const rows=document.items.filter(item=>item.placeId===placeId&&item.feature===feature);
    return { placeId,feature,count:rows.length,state:stateSummary(rows),mixed:new Set(rows.map(row=>row.state)).size>1,
      ids:rows.map(row=>row.id).sort(),sources:sourceCount(rows),dates:[...new Set(rows.map(row=>row.retrievedOn))].sort() };
  }));
}
export function contradictions(document:WorkbenchDocument):Contradiction[] {
  return buildCoverage(document).filter(cell=>cell.mixed).map(cell=>({placeId:cell.placeId,feature:cell.feature,ids:cell.ids,reason:'CONFLICTING_REPORTS'}));
}
export function summarizeEvidence(document:WorkbenchDocument,today:string):EvidenceSummary {
  const dates=document.items.map(item=>item.retrievedOn).sort();
  return { total:document.items.length, unresolved:document.items.filter(item=>needsReview(item,today).length>0).length,
    contradictions:contradictions(document).length,places:new Set(document.items.map(item=>item.placeId)).size,
    oldest:dates[0]??null,newest:dates.at(-1)??null };
}
export function impacts(before:WorkbenchDocument,after:WorkbenchDocument):Impact[] {
  const baseline=buildCoverage(before),next=buildCoverage(after);
  const mapA=new Map(baseline.map(item=>[`${item.placeId}/${item.feature}`,item]));
  const mapB=new Map(next.map(item=>[`${item.placeId}/${item.feature}`,item]));
  const keys=[...new Set([...mapA.keys(),...mapB.keys()])].sort();
  return keys.flatMap(key=>{
    const a=mapA.get(key),b=mapB.get(key);
    const stateA=a?.state??UNKNOWN,stateB=b?.state??UNKNOWN;
    if(stateA===stateB && a?.mixed===b?.mixed && a?.count===b?.count && a?.sources===b?.sources) return [];
    const item=a??b;
    if(!item)return [];
    const reason=stateA!==stateB?'STATE_CHANGE':a?.mixed!==b?.mixed?'CONFLICT_CHANGE':a?.count!==b?.count?'RECORD_COUNT_CHANGE':'SOURCE_COUNT_CHANGE';
    return [{placeId:item.placeId,feature:item.feature,before:stateA,after:stateB,reason,ids:b?.ids??[]}];
  });
}
export function changeSummary(changes:readonly Comparison[]) {
  const counts={added:0,removed:0,changed:0,unchanged:0};
  for(const item of changes)counts[item.kind]++;
  return counts;
}
export function historyRisks(before:WorkbenchDocument,after:WorkbenchDocument) {
  return compareDocuments(before,after).filter(change=>change.kind==='removed'||change.kind==='changed').map(change=>({id:change.id,kind:change.kind,fields:change.fields}));
}
export function perFeatureCounts(document:WorkbenchDocument):Record<Feature,number> {
  const counts=Object.fromEntries(FEATURES.map(feature=>[feature,0])) as Record<Feature,number>;
  for(const item of document.items)counts[item.feature]++;
  return counts;
}
export function reviewPriority(item:EvidenceItem,today:string):number {
  const flags=needsReview(item,today);
  return flags.reduce((score,flag)=>score+(flag==='RECHECK_REQUESTED'?4:flag==='UNKNOWN_STATE'?3:flag==='UNKNOWN_TIER'?2:flag==='OLDER_THAN_YEAR'?2:1),0);
}
export function prioritized(document:WorkbenchDocument,today:string):EvidenceItem[] {
  return [...document.items].sort((a,b)=>reviewPriority(b,today)-reviewPriority(a,today)||a.id.localeCompare(b.id));
}
export function traceSources(document:WorkbenchDocument,source:string) {
  return document.items.filter(item=>item.source===source).map(item=>({id:item.id,placeId:item.placeId,feature:item.feature,state:item.state}));
}
export function sourceInventory(document:WorkbenchDocument) {
  const grouped=new Map<string,EvidenceItem[]>();
  for(const item of document.items){const key=item.source;grouped.set(key,[...(grouped.get(key)??[]),item]);}
  return [...grouped].map(([source,rows])=>({source,count:rows.length,licences:[...new Set(rows.map(row=>row.licence))].sort(),tiers:[...new Set(rows.map(row=>row.tier))].sort(),oldest:[...rows.map(row=>row.retrievedOn)].sort()[0]})).sort((a,b)=>a.source.localeCompare(b.source));
}
export function licenceConflicts(document:WorkbenchDocument) {
  return sourceInventory(document).filter(row=>row.licences.length>1).map(row=>({source:row.source,licences:row.licences,code:'LICENCE_INCONSISTENCY'}));
}
