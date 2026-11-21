/** P20AG focus ownership contracts for dialogs, disclosures and sequential keyboard navigation. */
export type FocusRole = "button" | "link" | "textbox" | "checkbox" | "radio" | "tab" | "summary" | "dialog" | "heading" | "other";
export type DialogPhase = "closed" | "opening" | "open" | "closing";
export type DialogEvent =
  | { readonly type: "open"; readonly dialogId: string; readonly triggerId: string; readonly at: number }
  | { readonly type: "initial-focus"; readonly dialogId: string; readonly targetId: string; readonly at: number }
  | { readonly type: "tab"; readonly dialogId: string; readonly fromId: string | null; readonly toId: string | null; readonly at: number }
  | { readonly type: "shift-tab"; readonly dialogId: string; readonly fromId: string | null; readonly toId: string | null; readonly at: number }
  | { readonly type: "escape"; readonly dialogId: string; readonly at: number }
  | { readonly type: "close"; readonly dialogId: string; readonly at: number }
  | { readonly type: "focus-return"; readonly dialogId: string; readonly targetId: string | null; readonly at: number };

export interface Rect {
  readonly left: number; readonly top: number; readonly right: number; readonly bottom: number;
  readonly width: number; readonly height: number;
}
export interface FocusNode {
  readonly id: string;
  readonly role: FocusRole;
  readonly name: string;
  readonly domOrder: number;
  readonly tabIndex: number;
  readonly visible: boolean;
  readonly enabled: boolean;
  readonly inert: boolean;
  readonly ariaHidden: boolean;
  readonly focusable: boolean;
  readonly rect: Rect | null;
  readonly scopeId: string | null;
  readonly outlineStyle: string;
  readonly outlineWidth: number;
  readonly outlineOffset: number;
  readonly boxShadow: string;
}
export interface DialogObservation {
  readonly id: string;
  readonly open: boolean;
  readonly modal: boolean;
  readonly dismissible: boolean;
  readonly labelledBy: string | null;
  readonly describedBy: string | null;
  readonly activeId: string | null;
  readonly triggerId: string | null;
  readonly parentDialogId: string | null;
  readonly nodes: readonly FocusNode[];
  readonly backgroundInert: boolean;
}
export interface FocusIssue {
  readonly code: string;
  readonly target: string;
  readonly detail: string;
  readonly severity: "error" | "review";
}
export interface DialogState {
  readonly phase: DialogPhase;
  readonly dialogId: string | null;
  readonly triggerId: string | null;
  readonly initialFocusId: string | null;
  readonly activeId: string | null;
  readonly returnFocusId: string | null;
  readonly openedAt: number | null;
  readonly closedAt: number | null;
  readonly dismissible: boolean;
  readonly events: number;
  readonly issues: readonly string[];
}
export interface EventResult {
  readonly state: DialogState;
  readonly accepted: boolean;
  readonly reason: string | null;
}
export interface FocusPolicy {
  readonly minimumTarget: number;
  readonly requireDialogLabel: boolean;
  readonly requireBackgroundInertForCustomModal: boolean;
  readonly requireVisibleFocusIndicator: boolean;
  readonly allowPositiveTabIndex: boolean;
  readonly maximumNodes: number;
}
export const DEFAULT_FOCUS_POLICY: FocusPolicy = {
  minimumTarget: 44,
  requireDialogLabel: true,
  requireBackgroundInertForCustomModal: true,
  requireVisibleFocusIndicator: true,
  allowPositiveTabIndex: false,
  maximumNodes: 500,
};
const INTERACTIVE: readonly FocusRole[] = ["button","link","textbox","checkbox","radio","tab","summary"];
const SAFE_ID = /^[A-Za-z][A-Za-z0-9_:.-]{0,127}$/;
function hasControl(value:string):boolean { return [...value].some((character)=>{const code=character.charCodeAt(0);return code<32||(code>=127&&code<=159);}); }

export function emptyDialogState(): DialogState {
  return { phase:"closed",dialogId:null,triggerId:null,initialFocusId:null,activeId:null,
    returnFocusId:null,openedAt:null,closedAt:null,dismissible:false,events:0,issues:[] };
}
function result(state: DialogState, accepted: boolean, reason: string | null): EventResult {
  return { state: accepted ? { ...state, events: state.events + 1 } : state, accepted, reason };
}
function validAt(at: number): boolean { return Number.isSafeInteger(at) && at >= 0; }
function validId(id: string | null): boolean { return id === null || SAFE_ID.test(id); }
function isUsable(node: FocusNode | undefined): boolean {
  return !!node && node.visible && node.enabled && !node.inert && !node.ariaHidden && node.focusable && node.tabIndex >= 0;
}
export function isSequentiallyFocusable(node: FocusNode): boolean {
  return isUsable(node) && (INTERACTIVE.includes(node.role) || node.tabIndex >= 0);
}
export function isInsideDialog(node: FocusNode, dialogId: string): boolean {
  return node.scopeId === dialogId || node.id === dialogId;
}
export function sequentialOrder(nodes: readonly FocusNode[]): FocusNode[] {
  return nodes.filter(isSequentiallyFocusable).sort((a,b) =>
    (a.tabIndex > 0 ? 0 : 1) - (b.tabIndex > 0 ? 0 : 1)
    || (a.tabIndex > 0 && b.tabIndex > 0 ? a.tabIndex - b.tabIndex : 0)
    || a.domOrder - b.domOrder);
}
export function dialogTabOrder(observation: DialogObservation): FocusNode[] {
  return sequentialOrder(observation.nodes.filter((node) => isInsideDialog(node,observation.id)));
}
export function nextFocusId(nodes: readonly FocusNode[], currentId: string | null, backwards = false): string | null {
  const order = sequentialOrder(nodes);
  if (order.length === 0) return null;
  const index = order.findIndex((node) => node.id === currentId);
  if (index < 0) return backwards ? order[order.length-1]!.id : order[0]!.id;
  const next = backwards ? (index - 1 + order.length) % order.length : (index + 1) % order.length;
  return order[next]!.id;
}
export function focusVisible(node: FocusNode): boolean {
  const outline = node.outlineStyle !== "none" && node.outlineWidth > 0;
  const shadow = node.boxShadow !== "none" && node.boxShadow.trim().length > 0;
  return node.visible && (outline || shadow);
}
export function focusIssues(observation: DialogObservation, policy = DEFAULT_FOCUS_POLICY): FocusIssue[] {
  const issues: FocusIssue[] = [];
  const add=(code:string,target:string,detail:string,severity:"error"|"review"="error")=>issues.push({code,target,detail,severity});
  if (!SAFE_ID.test(observation.id)) add("dialog-id-invalid",observation.id,"Dialog identifier is invalid");
  if (observation.open && policy.requireDialogLabel && !observation.labelledBy) add("dialog-label-missing",observation.id,"Open dialog has no labelled-by reference");
  if (observation.labelledBy && !observation.nodes.some((node)=>node.id===observation.labelledBy)) add("dialog-label-target-missing",observation.labelledBy,"Dialog label target is absent");
  if (observation.describedBy && !observation.nodes.some((node)=>node.id===observation.describedBy)) add("dialog-description-target-missing",observation.describedBy,"Dialog description target is absent","review");
  if (observation.open && observation.modal && !observation.backgroundInert && policy.requireBackgroundInertForCustomModal) {
    add("modal-background-not-inert",observation.id,"Custom modal does not report background inertness");
  }
  if (observation.open && observation.activeId) {
    const active=observation.nodes.find((node)=>node.id===observation.activeId);
    if (!active) add("active-node-missing",observation.activeId,"Active element is not in the observed node list");
    else if (!isUsable(active)) add("active-node-unusable",active.id,"Active element is hidden, disabled, inert or excluded from focus");
    else if (observation.modal && !isInsideDialog(active,observation.id)) add("focus-outside-modal",active.id,"Focus is outside the active modal");
  }
  const order=dialogTabOrder(observation);
  if (observation.open && observation.modal && order.length===0) add("modal-no-tabbable-descendant",observation.id,"Open modal has no sequentially focusable descendant");
  for (const node of observation.nodes) {
    if (!validId(node.id)) add("node-id-invalid",node.id,"Focus node identifier is invalid");
    if (hasControl(node.name)) add("accessible-name-control-character",node.id,"Accessible name contains control characters");
    if (node.tabIndex>0 && !policy.allowPositiveTabIndex) add("positive-tabindex",node.id,`Positive tabindex ${node.tabIndex} creates a custom order`);
    if (node.focusable && node.visible && !node.enabled) add("disabled-focusable",node.id,"Disabled node is reported as focusable","review");
    if (node.focusable && node.visible && !node.inert && !node.ariaHidden && node.tabIndex>=0
      && node.rect && (node.rect.width<policy.minimumTarget || node.rect.height<policy.minimumTarget)) {
      add("focus-target-small",node.id,`${node.rect.width}x${node.rect.height}px is below ${policy.minimumTarget}px`);
    }
    if (policy.requireVisibleFocusIndicator && node.id===observation.activeId && node.focusable && node.visible && node.enabled && !node.inert && !focusVisible(node)) {
      add("focus-indicator-not-observed",node.id,"No visible outline or box-shadow was observed","review");
    }
  }
  if (observation.nodes.length>policy.maximumNodes) add("focus-observation-truncated",observation.id,`${observation.nodes.length} exceeds ${policy.maximumNodes}`,"review");
  return issues;
}
export function disclosureIssues(input: {
  id:string; expanded:boolean; panelVisible:boolean; controlsId:string|null;
  panelId:string|null; summaryFocusable:boolean; summaryName:string;
}): FocusIssue[] {
  const out:FocusIssue[]=[];
  const add=(code:string,detail:string)=>out.push({code,target:input.id,detail,severity:"error"});
  if (!SAFE_ID.test(input.id)) add("disclosure-id-invalid","Disclosure identifier is invalid");
  if (!input.summaryFocusable) add("disclosure-summary-not-focusable","Disclosure summary is not keyboard focusable");
  if (!input.summaryName.trim()) add("disclosure-name-empty","Disclosure summary has no accessible name");
  if (!input.controlsId || !input.panelId || input.controlsId!==input.panelId) add("disclosure-controls-mismatch","aria-controls does not identify the panel");
  if (input.expanded!==input.panelVisible) add("disclosure-expanded-visibility-mismatch","Expanded state and panel visibility disagree");
  return out;
}
export function dialogEvent(state:DialogState,event:DialogEvent,observation:DialogObservation):EventResult {
  if (!validAt(event.at)) return result(state,false,"dialog.time.invalid");
  if (!validId(event.dialogId)) return result(state,false,"dialog.id.invalid");
  if (state.openedAt!==null && event.at<state.openedAt) return result(state,false,"dialog.time.reversed");
  if (state.phase==="closed" && event.type!=="open") return result(state,false,"dialog.not-open");
  if (state.dialogId!==null && state.dialogId!==event.dialogId) return result(state,false,"dialog.identity.changed");
  if (event.type==="open") {
    if (state.phase!=="closed") return result(state,false,"dialog.already-open");
    if (!validId(event.triggerId) || !event.triggerId) return result(state,false,"dialog.trigger.invalid");
    if (!observation.open || observation.id!==event.dialogId) return result(state,false,"dialog.open-not-observed");
    const trigger=observation.nodes.find((node)=>node.id===event.triggerId);
    if (!trigger || !isUsable(trigger)) return result(state,false,"dialog.trigger-unusable");
    return result({...state,phase:"opening",dialogId:event.dialogId,triggerId:event.triggerId,
      returnFocusId:event.triggerId,openedAt:event.at,dismissible:observation.dismissible},true,null);
  }
  if (state.phase==="opening" && event.type!=="initial-focus") return result(state,false,"dialog.initial-focus-required");
  if (state.phase==="open" && observation.open!==true && event.type!=="close") return result(state,false,"dialog.open-state-not-observed");
  if (event.type==="initial-focus") {
    if (state.phase!=="opening") return result(state,false,"dialog.initial-focus.out-of-order");
    const target=observation.nodes.find((node)=>node.id===event.targetId);
    if (!target || !isUsable(target) || !isInsideDialog(target,event.dialogId)) return result(state,false,"dialog.initial-focus.invalid");
    if (observation.activeId!==event.targetId) return result(state,false,"dialog.initial-focus.not-active");
    return result({...state,phase:"open",initialFocusId:event.targetId,activeId:event.targetId},true,null);
  }
  if (event.type==="tab" || event.type==="shift-tab") {
    if (state.phase!=="open") return result(state,false,"dialog.tab.out-of-order");
    if (observation.activeId!==event.toId) return result(state,false,"dialog.tab.destination-not-active");
    const expected=nextFocusId(dialogTabOrder(observation),event.fromId,event.type==="shift-tab");
    if (expected!==event.toId) return result(state,false,"dialog.tab.order-invalid");
    return result({...state,activeId:event.toId},true,null);
  }
  if (event.type==="escape") {
    if (state.phase!=="open") return result(state,false,"dialog.escape.out-of-order");
    if (!state.dismissible || !observation.dismissible) return result(state,false,"dialog.escape.not-dismissible");
    return result({...state,phase:"closing"},true,null);
  }
  if (event.type==="close") {
    if (state.phase!=="open" && state.phase!=="closing") return result(state,false,"dialog.close.out-of-order");
    if (observation.open) return result(state,false,"dialog.close.not-observed");
    return result({...state,phase:"closing",closedAt:event.at},true,null);
  }
  if (event.type==="focus-return") {
    if (state.phase!=="closing") return result(state,false,"dialog.focus-return.out-of-order");
    if (event.targetId!==state.returnFocusId) return result(state,false,"dialog.focus-return.wrong-target");
    if (observation.activeId!==event.targetId) return result(state,false,"dialog.focus-return.not-active");
    if (event.targetId!==null && !isUsable(observation.nodes.find((node)=>node.id===event.targetId))) {
      return result(state,false,"dialog.focus-return.target-unusable");
    }
    return result({...state,phase:"closed",activeId:event.targetId,dialogId:null,triggerId:null,
      initialFocusId:null,openedAt:null,closedAt:event.at,dismissible:false},true,null);
  }
  return result(state,false,"dialog.event.unsupported");
}
export function replayDialogEvents(events:readonly DialogEvent[],observations:readonly DialogObservation[]):{
  state:DialogState; accepted:number; rejected:readonly {index:number;reason:string}[];
} {
  let state=emptyDialogState(),accepted=0;
  const rejected:Array<{index:number;reason:string}>=[];
  events.forEach((event,index)=>{
    const observation=observations[index];
    if(!observation){rejected.push({index,reason:"dialog.observation.missing"});return;}
    const outcome=dialogEvent(state,event,observation);
    if(outcome.accepted){state=outcome.state;accepted+=1;}
    else rejected.push({index,reason:outcome.reason??"dialog.rejected"});
  });
  return {state,accepted,rejected};
}

export interface DialogStackEntry {
  readonly id:string; readonly open:boolean; readonly modal:boolean;
  readonly parentId:string|null; readonly activeId:string|null;
}
export function dialogStackIssues(stack:readonly DialogStackEntry[]):FocusIssue[]{
  const issues:FocusIssue[]=[];
  const ids=new Set<string>();
  const open=stack.filter((entry)=>entry.open);
  for(const entry of stack){
    if(ids.has(entry.id))issues.push({code:"dialog-stack-duplicate-id",target:entry.id,detail:"Dialog stack repeats an identifier",severity:"error"});
    ids.add(entry.id);
    if(entry.parentId!==null&&!stack.some((candidate)=>candidate.id===entry.parentId&&candidate.open)){
      issues.push({code:"dialog-stack-parent-missing",target:entry.id,detail:"Nested dialog parent is not open",severity:"error"});
    }
  }
  const top=open[open.length-1];
  if(top?.modal&&top.activeId!==null){
    const active=stack.find((entry)=>entry.id===top.id);
    if(active?.activeId!==top.activeId)issues.push({code:"dialog-stack-focus-owner-mismatch",target:top.id,detail:"Topmost dialog focus owner is inconsistent",severity:"error"});
  }
  for(let index=0;index<open.length-1;index++){
    const entry=open[index]!;
    if(entry.modal&&entry.activeId!==null){
      issues.push({code:"dialog-stack-background-active",target:entry.id,detail:"A covered dialog still reports active focus",severity:"review"});
    }
  }
  return issues;
}
export function rovingFocusIssues(groupId:string,nodes:readonly FocusNode[],activeId:string|null):FocusIssue[]{
  const members=nodes.filter((node)=>node.scopeId===groupId&&node.role==="tab"&&node.visible&&node.enabled&&!node.inert&&!node.ariaHidden);
  const issues:FocusIssue[]=[];
  const add=(code:string,target:string,detail:string)=>issues.push({code,target,detail,severity:"error"});
  if(members.length===0){add("roving-group-empty",groupId,"Roving focus group has no available tabs");return issues;}
  const stops=members.filter((node)=>node.tabIndex===0);
  if(stops.length!==1)add("roving-tabstop-count",groupId,`Expected one tab stop; found ${stops.length}`);
  for(const node of members)if(node.tabIndex!==0&&node.tabIndex!==-1)add("roving-tabindex-invalid",node.id,`Expected -1 or 0; found ${node.tabIndex}`);
  if(activeId!==null&&!members.some((node)=>node.id===activeId))add("roving-active-outside-group",activeId,"Active tab is not a member of the group");
  if(activeId!==null&&stops.length===1&&stops[0]!.id!==activeId)add("roving-active-tabstop-mismatch",activeId,"Active tab and tab stop differ");
  return issues;
}
export function focusRestorationIssues(input:{
  triggerId:string|null; activeId:string|null; triggerVisible:boolean;
  triggerEnabled:boolean; focusWasMoved:boolean;
}):FocusIssue[]{
  const issues:FocusIssue[]=[];
  if(input.focusWasMoved&&input.triggerId===null){
    issues.push({code:"focus-restore-trigger-missing",target:"dialog",detail:"No invoking control was recorded",severity:"error"});
  }else if(input.focusWasMoved&&input.triggerId!==input.activeId){
    issues.push({code:"focus-restore-wrong-target",target:input.triggerId??"dialog",detail:"Focus did not return to the invoking control",severity:"error"});
  }
  if(input.triggerId!==null&&!input.triggerVisible){
    issues.push({code:"focus-restore-trigger-hidden",target:input.triggerId,detail:"Invoking control is no longer visible",severity:"review"});
  }
  if(input.triggerId!==null&&!input.triggerEnabled){
    issues.push({code:"focus-restore-trigger-disabled",target:input.triggerId,detail:"Invoking control is no longer enabled",severity:"review"});
  }
  return issues;
}
export function focusOrderIssues(nodes:readonly FocusNode[],observedOrder:readonly string[]):FocusIssue[]{
  const expected=sequentialOrder(nodes).map((node)=>node.id);
  const issues:FocusIssue[]=[];
  const seen=new Set<string>();
  for(const id of observedOrder){
    if(seen.has(id))issues.push({code:"focus-order-repeat",target:id,detail:"Sequential focus visited the same node twice before wrapping",severity:"error"});
    seen.add(id);
    if(!expected.includes(id))issues.push({code:"focus-order-unexpected",target:id,detail:"Observed focus target is not sequentially focusable",severity:"error"});
  }
  const expectedSet=new Set(expected);
  for(const id of expected)if(!seen.has(id))issues.push({code:"focus-order-skipped",target:id,detail:"Sequential focus skipped an available target",severity:"error"});
  for(const id of seen)if(!expectedSet.has(id))issues.push({code:"focus-order-not-in-model",target:id,detail:"Observed target is absent from the focus model",severity:"review"});
  return issues;
}

export function focusSummary(observation:DialogObservation):{
  dialogId:string;open:boolean;modal:boolean;activeInside:boolean;tabbable:number;
  hiddenFocusable:number;inertFocusable:number;positiveTabIndex:number;
} {
  const order=dialogTabOrder(observation);
  return {
    dialogId:observation.id,open:observation.open,modal:observation.modal,
    activeInside:!!observation.activeId && observation.nodes.some((node)=>node.id===observation.activeId && isInsideDialog(node,observation.id)),
    tabbable:order.length,
    hiddenFocusable:observation.nodes.filter((node)=>node.focusable&&!node.visible).length,
    inertFocusable:observation.nodes.filter((node)=>node.focusable&&node.inert).length,
    positiveTabIndex:observation.nodes.filter((node)=>node.tabIndex>0).length,
  };
}
