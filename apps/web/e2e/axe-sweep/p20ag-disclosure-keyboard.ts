export type DisclosureKey="Enter"|"Space"|"ArrowDown"|"ArrowUp"|"ArrowLeft"|"ArrowRight"|"Home"|"End";
export interface DisclosureItem {
 readonly id:string; readonly name:string; readonly expanded:boolean;
 readonly panelId:string|null; readonly panelVisible:boolean;
 readonly disabled:boolean; readonly focusable:boolean; readonly domOrder:number;
 readonly panelLabelledBy:string|null; readonly panelRegion:boolean;
}
export interface DisclosureGroup {
 readonly id:string; readonly items:readonly DisclosureItem[];
 readonly exclusive:boolean; readonly orientation:"vertical"|"horizontal";
}
export interface DisclosureAction {
 readonly itemId:string; readonly key:DisclosureKey; readonly at:number;
 readonly currentFocusId:string|null; readonly nextFocusId:string|null;
 readonly nextExpanded:boolean|null;
}
export interface DisclosureIssue {
 readonly code:string; readonly target:string; readonly detail:string;
 readonly severity:"error"|"review";
}
export interface DisclosureResult {
 readonly expandedIds:readonly string[]; readonly focusId:string|null;
 readonly accepted:boolean; readonly reason:string|null;
}
export function disclosureItemIssues(item:DisclosureItem):DisclosureIssue[]{
 const issues:DisclosureIssue[]=[];
 const add=(code:string,detail:string,severity:"error"|"review"="error")=>issues.push({code,target:item.id,detail,severity});
 if(!item.id.trim())add("disclosure-id-empty","Disclosure id is empty");
 if(!item.name.trim())add("disclosure-name-empty","Disclosure name is empty");
 if(item.panelId===null||item.panelId.trim()==="")add("disclosure-panel-id-missing","Panel id is missing");
 if(item.panelId!==null&&item.panelLabelledBy!==item.id)add("disclosure-panel-label-mismatch","Panel is not labelled by its disclosure control");
 if(item.expanded!==item.panelVisible)add("disclosure-visibility-mismatch","Expanded state and panel visibility disagree");
 if(!item.focusable&&!item.disabled)add("disclosure-control-not-focusable","Enabled disclosure control cannot receive focus");
 if(item.panelRegion&&!item.panelVisible&&item.expanded)add("disclosure-hidden-region-expanded","Hidden region is still marked expanded");
 return issues;
}
export function disclosureGroupIssues(group:DisclosureGroup):DisclosureIssue[]{
 const issues=group.items.flatMap(disclosureItemIssues);
 const ids=new Set<string>();
 for(const item of group.items){
  if(ids.has(item.id))issues.push({code:"disclosure-id-duplicate",target:item.id,detail:"Group repeats a disclosure id",severity:"error"});
  ids.add(item.id);
 }
 if(group.exclusive&&group.items.filter((item)=>item.expanded).length>1){
  issues.push({code:"disclosure-exclusive-multiple-open",target:group.id,detail:"Exclusive accordion has more than one expanded panel",severity:"error"});
 }
 const ordered=[...group.items].sort((a,b)=>a.domOrder-b.domOrder);
 if(ordered.some((item,index)=>index>0&&item.domOrder===ordered[index-1]!.domOrder)){
  issues.push({code:"disclosure-dom-order-duplicate",target:group.id,detail:"Disclosure controls share a DOM order index",severity:"review"});
 }
 return issues;
}
export function disclosureKeyResult(group:DisclosureGroup,action:DisclosureAction):DisclosureResult{
 const item=group.items.find((entry)=>entry.id===action.itemId);
 if(!item)return {expandedIds:group.items.filter((entry)=>entry.expanded).map((entry)=>entry.id),focusId:action.currentFocusId,accepted:false,reason:"disclosure-item-missing"};
 if(!Number.isSafeInteger(action.at)||action.at<0)return {expandedIds:group.items.filter((entry)=>entry.expanded).map((entry)=>entry.id),focusId:action.currentFocusId,accepted:false,reason:"disclosure-time-invalid"};
 if(!item.focusable||item.disabled)return {expandedIds:group.items.filter((entry)=>entry.expanded).map((entry)=>entry.id),focusId:action.currentFocusId,accepted:false,reason:"disclosure-control-unavailable"};
 if(action.currentFocusId!==item.id)return {expandedIds:group.items.filter((entry)=>entry.expanded).map((entry)=>entry.id),focusId:action.currentFocusId,accepted:false,reason:"disclosure-focus-mismatch"};
 const items=[...group.items];
 if(action.key==="Enter"||action.key==="Space"){
  const expanded=action.nextExpanded??!item.expanded;
  const updated=items.map((entry)=>({
   ...entry,
   expanded:entry.id===item.id?expanded:group.exclusive?false:entry.expanded,
   panelVisible:entry.id===item.id?expanded:group.exclusive?false:entry.panelVisible,
  }));
  return {expandedIds:updated.filter((entry)=>entry.expanded).map((entry)=>entry.id),focusId:item.id,accepted:true,reason:null};
 }
 const focusable=items.filter((entry)=>entry.focusable&&!entry.disabled).sort((a,b)=>a.domOrder-b.domOrder);
 if(group.orientation==="vertical"&&(action.key==="ArrowDown"||action.key==="ArrowUp")
   ||group.orientation==="horizontal"&&(action.key==="ArrowLeft"||action.key==="ArrowRight")){
  const current=focusable.findIndex((entry)=>entry.id===item.id);
  const forward=action.key==="ArrowDown"||action.key==="ArrowRight";
  const next=forward?(current+1)%focusable.length:(current-1+focusable.length)%focusable.length;
  const expected=focusable[next]?.id??null;
  if(expected!==action.nextFocusId)return {expandedIds:group.items.filter((entry)=>entry.expanded).map((entry)=>entry.id),focusId:action.currentFocusId,accepted:false,reason:"disclosure-arrow-order-invalid"};
  return {expandedIds:group.items.filter((entry)=>entry.expanded).map((entry)=>entry.id),focusId:expected,accepted:true,reason:null};
 }
 if(action.key==="Home"||action.key==="End"){
  const expected=action.key==="Home"?focusable[0]?.id:focusable[focusable.length-1]?.id;
  if(expected!==action.nextFocusId)return {expandedIds:group.items.filter((entry)=>entry.expanded).map((entry)=>entry.id),focusId:action.currentFocusId,accepted:false,reason:"disclosure-edge-key-order-invalid"};
  return {expandedIds:group.items.filter((entry)=>entry.expanded).map((entry)=>entry.id),focusId:expected??null,accepted:true,reason:null};
 }
 return {expandedIds:group.items.filter((entry)=>entry.expanded).map((entry)=>entry.id),focusId:action.currentFocusId,accepted:false,reason:"disclosure-key-unsupported"};
}
export function disclosureSummary(group:DisclosureGroup):string{
 return [`Items: ${group.items.length}`,`Expanded: ${group.items.filter((item)=>item.expanded).length}`,
  `Orientation: ${group.orientation}`,`Exclusive: ${group.exclusive?"yes":"no"}`].join("\n");
}
