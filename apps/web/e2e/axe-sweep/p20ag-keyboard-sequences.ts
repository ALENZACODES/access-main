import type { FocusNode } from "./p20ag-focus-contracts.ts";
export type NavigationKey = "Tab" | "Shift+Tab" | "Enter" | "Space" | "Escape" | "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown" | "Home" | "End";
export interface FocusStep {
  readonly key:NavigationKey; readonly fromId:string|null; readonly toId:string|null;
  readonly at:number; readonly visible:boolean; readonly enabled:boolean;
  readonly insideScope:boolean; readonly focusVisible:boolean;
  readonly horizontalScroll:number; readonly verticalScroll:number;
  readonly activated:boolean;
}
export interface FocusSequenceContext {
  readonly scopeId:string; readonly allowedIds:readonly string[];
  readonly expectedTabOrder:readonly string[]; readonly modal:boolean;
  readonly wrapForward:boolean; readonly wrapBackward:boolean;
  readonly maxHorizontalScroll:number;
}
export interface SequenceIssue {
  readonly code:string; readonly index:number; readonly target:string;
  readonly detail:string; readonly severity:"error"|"review";
}
export interface SequenceReport {
  readonly issues:readonly SequenceIssue[]; readonly steps:number;
  readonly tabSteps:number; readonly activations:number;
  readonly clean:boolean;
}
function add(out:SequenceIssue[],code:string,index:number,target:string,detail:string,severity:"error"|"review"="error"){
 out.push({code,index,target,detail,severity});
}
export function focusSequenceFindings(steps:readonly FocusStep[],context:FocusSequenceContext):SequenceReport{
 const issues:SequenceIssue[]=[];
 let previousAt=-1,previousTo:string|null=null,tabSteps=0,activations=0;
 const order=context.expectedTabOrder;
 for(let index=0;index<steps.length;index++){
  const step=steps[index]!;
  if(!Number.isSafeInteger(step.at)||step.at<0||step.at<previousAt)add(issues,"focus-time-reversed",index,step.toId??"","Focus timestamps must be non-negative and increasing");
  previousAt=step.at;
  if(index>0&&step.fromId!==previousTo)add(issues,"focus-chain-broken",index,step.fromId??"","The next step does not start at the previous focus destination");
  if(step.toId===null)add(issues,"focus-destination-missing",index,"","Keyboard interaction left no active focus destination");
  else if(!context.allowedIds.includes(step.toId))add(issues,"focus-destination-unexpected",index,step.toId,"Focus moved to a target outside the allowed sequence");
  if(!step.visible)add(issues,"focus-destination-hidden",index,step.toId??"","Focus destination is not visible");
  if(!step.enabled)add(issues,"focus-destination-disabled",index,step.toId??"","Focus destination is disabled");
  if(context.modal&&!step.insideScope)add(issues,"focus-escaped-modal",index,step.toId??"","Focus left the modal boundary");
  if((step.key==="Tab"||step.key==="Shift+Tab")&&step.toId!==null){
   tabSteps++;
   const current=order.indexOf(step.fromId??"");
   const expected=current<0?(step.key==="Tab"?order[0]:order[order.length-1])
    :step.key==="Tab"?(current===order.length-1?(context.wrapForward?order[0]:undefined):order[current+1])
    :(current===0?(context.wrapBackward?order[order.length-1]:undefined):order[current-1]);
   if(expected!==undefined&&expected!==step.toId)add(issues,"focus-tab-order-mismatch",index,step.toId,`Expected ${expected}, observed ${step.toId}`);
   if(expected===undefined&&step.toId!==null)add(issues,"focus-boundary-should-release",index,step.toId,"Focus did not leave a non-wrapping boundary","review");
   if(!step.focusVisible)add(issues,"focus-indicator-missing",index,step.toId,"Keyboard-focused control has no observed focus indicator","review");
  }
  if(step.key==="Enter"||step.key==="Space"){
   if(step.activated)activations++;
   if(!step.enabled&&step.activated)add(issues,"disabled-control-activated",index,step.toId??"","Disabled control was activated");
  }
  if(!Number.isFinite(step.horizontalScroll)||Math.abs(step.horizontalScroll)>context.maxHorizontalScroll){
   add(issues,"focus-horizontal-scroll",index,step.toId??"",`${step.horizontalScroll}px horizontal scroll exceeds ${context.maxHorizontalScroll}px`,"review");
  }
  if(!Number.isFinite(step.verticalScroll))add(issues,"focus-scroll-invalid",index,step.toId??"","Vertical scroll observation is not finite");
  previousTo=step.toId;
 }
 const errors=issues.filter((x)=>x.severity==="error").length;
 return {issues,steps:steps.length,tabSteps,activations,clean:errors===0};
}
export function keyboardActivationFindings(input:{
 role:string; key:"Enter"|"Space"; enabled:boolean; defaultPrevented:boolean; activated:boolean;
}):SequenceIssue[]{
 const issues:SequenceIssue[]=[];
 const shouldActivate=input.role==="button"||input.role==="checkbox"||input.role==="radio"||input.role==="summary"
  ?input.key==="Enter"||input.key==="Space"
  :input.role==="link"?input.key==="Enter":false;
 if(!input.enabled){
  if(input.activated)issues.push({code:"disabled-control-activated",index:0,target:input.role,detail:"Disabled control must not activate",severity:"error"});
  return issues;
 }
 if(shouldActivate&&!input.activated)issues.push({code:"keyboard-activation-missing",index:0,target:input.role,detail:`${input.key} did not activate ${input.role}`,severity:"error"});
 else if(!shouldActivate&&input.activated)issues.push({code:"keyboard-activation-unexpected",index:0,target:input.role,detail:`${input.key} should not activate ${input.role}`,severity:"review"});
 if(input.defaultPrevented&&!input.activated&&shouldActivate)issues.push({code:"keyboard-default-cancelled",index:0,target:input.role,detail:"Default key action was cancelled without an equivalent activation",severity:"error"});
 return issues;
}
export function skipLinkFindings(input:{
 href:string; targetId:string|null; targetExists:boolean; targetVisible:boolean;
 targetFocusable:boolean; focusedId:string|null; activationKey:"Enter"|"Space";
}):SequenceIssue[]{
 const issues:SequenceIssue[]=[];
 if(!input.href.startsWith("#")||input.href.length<2)issues.push({code:"skip-link-href-invalid",index:0,target:"skip-link",detail:"Skip link must reference a local fragment",severity:"error"});
 if(!input.targetExists||input.targetId===null)issues.push({code:"skip-link-target-missing",index:0,target:input.href,detail:"Skip destination does not exist",severity:"error"});
 if(!input.targetVisible)issues.push({code:"skip-link-target-hidden",index:0,target:input.targetId??"",detail:"Skip destination is not visible",severity:"error"});
 if(!input.targetFocusable)issues.push({code:"skip-link-target-not-focusable",index:0,target:input.targetId??"",detail:"Skip destination cannot receive focus",severity:"error"});
 if(input.focusedId!==input.targetId)issues.push({code:"skip-link-focus-not-moved",index:0,target:input.targetId??"",detail:"Activating the skip link did not move focus to its destination",severity:"error"});
 if(input.activationKey!=="Enter")issues.push({code:"skip-link-key-invalid",index:0,target:"skip-link",detail:"A link should activate with Enter",severity:"review"});
 return issues;
}
export function focusSequenceSummary(report:SequenceReport):string{
 return [`Steps: ${report.steps}`,`Tab moves: ${report.tabSteps}`,`Activations: ${report.activations}`,
  `Errors: ${report.issues.filter((x)=>x.severity==="error").length}`,
  `Reviews: ${report.issues.filter((x)=>x.severity==="review").length}`].join("\n");
}
export function nodeIds(nodes:readonly FocusNode[]):string[]{return nodes.filter((node)=>node.visible&&node.enabled&&!node.inert&&!node.ariaHidden&&node.tabIndex>=0).sort((a,b)=>a.domOrder-b.domOrder).map((node)=>node.id);}
