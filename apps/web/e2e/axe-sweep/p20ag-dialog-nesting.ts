export interface NestedDialog {
 readonly id:string; readonly triggerId:string; readonly parentId:string|null;
 readonly dismissible:boolean; readonly openedAt:number;
}
export interface NestedDialogState {
 readonly stack:readonly NestedDialog[]; readonly activeId:string|null;
 readonly revision:number; readonly closedIds:readonly string[];
 readonly pendingRestore:{readonly dialogId:string;readonly triggerId:string;readonly parentId:string|null}|null;
}
export type NestedDialogAction =
 | {readonly type:"open";readonly dialog:NestedDialog;readonly at:number}
 | {readonly type:"focus";readonly dialogId:string;readonly focusId:string;readonly at:number}
 | {readonly type:"escape";readonly dialogId:string;readonly at:number}
 | {readonly type:"close";readonly dialogId:string;readonly at:number;readonly observedClosed:boolean}
 | {readonly type:"restore";readonly dialogId:string;readonly targetId:string|null;readonly activeId:string|null;readonly at:number};
export interface NestedDialogResult {readonly state:NestedDialogState;readonly accepted:boolean;readonly reason:string|null;}
export function emptyNestedDialogState():NestedDialogState{return {stack:[],activeId:null,revision:0,closedIds:[],pendingRestore:null};}
const ID=/^[A-Za-z][A-Za-z0-9_-]{0,127}$/;
function reject(state:NestedDialogState,reason:string):NestedDialogResult{return {state,accepted:false,reason};}
function accept(state:NestedDialogState):NestedDialogResult{return {state:{...state,revision:state.revision+1},accepted:true,reason:null};}
export function topDialog(state:NestedDialogState):NestedDialog|null{return state.stack[state.stack.length-1]??null;}
export function nestedDialogIssues(state:NestedDialogState):string[]{
 const issues:string[]=[];const ids=new Set<string>();
 state.stack.forEach((dialog,index)=>{
  if(!ID.test(dialog.id))issues.push(`dialog-id-invalid:${dialog.id}`);
  if(ids.has(dialog.id))issues.push(`dialog-id-duplicate:${dialog.id}`);
  ids.add(dialog.id);
  if(!ID.test(dialog.triggerId))issues.push(`dialog-trigger-invalid:${dialog.id}`);
  if(index===0&&dialog.parentId!==null)issues.push(`dialog-root-has-parent:${dialog.id}`);
  if(index>0&&dialog.parentId!==state.stack[index-1]!.id)issues.push(`dialog-parent-order-invalid:${dialog.id}`);
  if(!Number.isSafeInteger(dialog.openedAt)||dialog.openedAt<0)issues.push(`dialog-open-time-invalid:${dialog.id}`);
 });
 if(state.stack.length===0&&state.activeId!==null)issues.push("dialog-active-with-empty-stack");
 if(state.stack.length>0&&state.activeId===null)issues.push("dialog-active-missing");
 if(state.stack.length>5)issues.push("dialog-depth-exceeded");
 return issues;
}
export function nestedDialogStep(state:NestedDialogState,action:NestedDialogAction):NestedDialogResult{
 if(!Number.isSafeInteger(action.at)||action.at<0)return reject(state,"dialog-time-invalid");
 const top=topDialog(state);
 if(action.type==="restore"){
  const pending=state.pendingRestore;
  if(!pending||pending.dialogId!==action.dialogId)return reject(state,"dialog-restore-not-pending");
  if(action.targetId!==pending.triggerId)return reject(state,"dialog-restore-trigger-mismatch");
  if(action.activeId!==action.targetId)return reject(state,"dialog-restore-not-active");
  return accept({...state,activeId:pending.triggerId,pendingRestore:null});
 }
 if(action.type==="open"){
  const item=action.dialog;
  if(!ID.test(item.id)||!ID.test(item.triggerId))return reject(state,"dialog-identity-invalid");
  if(state.stack.some((entry)=>entry.id===item.id))return reject(state,"dialog-already-open");
  if(state.stack.length>=5)return reject(state,"dialog-depth-limit");
  if(item.parentId!==(top?.id??null))return reject(state,"dialog-parent-mismatch");
  if(item.openedAt>action.at)return reject(state,"dialog-opened-in-future");
  if(top&&action.at<top.openedAt)return reject(state,"dialog-time-reversed");
  return accept({...state,stack:[...state.stack,item],activeId:item.id});
 }
 if(!top||top.id!==action.dialogId)return reject(state,"dialog-not-topmost");
 if(action.type==="focus"){
  if(!ID.test(action.focusId))return reject(state,"dialog-focus-id-invalid");
  return accept({...state,activeId:action.focusId});
 }
 if(action.type==="escape"){
  if(!top.dismissible)return reject(state,"dialog-not-dismissible");
  return accept({...state,activeId:top.id});
 }
 if(action.type==="close"){
  if(!action.observedClosed)return reject(state,"dialog-close-not-observed");
  return accept({...state,stack:state.stack.slice(0,-1),activeId:null,
   pendingRestore:{dialogId:top.id,triggerId:top.triggerId,parentId:top.parentId},
   closedIds:[...state.closedIds,top.id].slice(-50)});
 }
 return reject(state,"dialog-action-unsupported");
}
export function replayNestedDialogs(actions:readonly NestedDialogAction[]):{
 state:NestedDialogState;accepted:number;rejected:readonly {index:number;reason:string}[];
}{
 let state=emptyNestedDialogState(),accepted=0;const rejected:Array<{index:number;reason:string}>=[];
 actions.forEach((action,index)=>{const result=nestedDialogStep(state,action);if(result.accepted){state=result.state;accepted++;}else rejected.push({index,reason:result.reason??"dialog-rejected"});});
 return {state,accepted,rejected};
}
export function nestedDialogSummary(state:NestedDialogState):string{
 return [`Open dialogs: ${state.stack.length}`,`Top: ${topDialog(state)?.id??"none"}`,
  `Closed in trace: ${state.closedIds.length}`,`Revision: ${state.revision}`].join("\n");
}
