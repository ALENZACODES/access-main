export type ModalKind="native-dialog"|"custom-dialog"|"non-modal-dialog";
export interface ModalSemantics {
 readonly id:string; readonly kind:ModalKind; readonly open:boolean;
 readonly role:string|null; readonly ariaModal:string|null;
 readonly nativeModal:boolean; readonly topmost:boolean;
 readonly accessibleName:string; readonly describedBy:string|null;
 readonly backgroundInert:boolean; readonly activeFocusId:string|null;
 readonly descendantIds:readonly string[]; readonly focusableDescendantIds:readonly string[];
 readonly triggerId:string|null; readonly returnFocusId:string|null;
 readonly closeButtonId:string|null; readonly closeButtonName:string|null;
 readonly dismissible:boolean; readonly escapeClosed:boolean|null;
}
export interface ModalProblem {readonly code:string;readonly target:string;readonly severity:"error"|"review";readonly detail:string;}
export function modalSemanticsFindings(modal:ModalSemantics):ModalProblem[]{
 const issues:ModalProblem[]=[];
 const add=(code:string,detail:string,severity:"error"|"review"="error")=>issues.push({code,target:modal.id,detail,severity});
 if(!modal.id.trim())add("modal-id-empty","Modal identifier is empty");
 if(modal.kind==="native-dialog"){
  if(modal.role!==null&&modal.role!=="dialog")add("native-dialog-role-conflict","Native dialog has an unexpected role");
  if(modal.open&&modal.nativeModal!==true)add("native-dialog-not-modal","Open native dialog was not opened modally");
  if(modal.ariaModal==="false")add("native-dialog-aria-modal-false","Native modal explicitly reports aria-modal false");
 }else if(modal.kind==="custom-dialog"){
  if(modal.role!=="dialog"&&modal.role!=="alertdialog")add("custom-dialog-role-missing","Custom modal lacks dialog role");
  if(modal.open&&modal.ariaModal!=="true")add("custom-dialog-aria-modal-missing","Open custom modal must expose aria-modal true");
  if(modal.open&&!modal.backgroundInert)add("custom-dialog-background-active","Background content is not inert while custom modal is open");
 }else if(modal.ariaModal==="true")add("nonmodal-aria-modal-true","Non-modal dialog must not claim modal semantics");
 if(modal.open&&!modal.accessibleName.trim())add("modal-name-missing","Open dialog has no accessible name");
 if(modal.describedBy!==null&&!modal.descendantIds.includes(modal.describedBy)&&modal.describedBy!==modal.id){
  add("modal-description-target-missing","Description reference does not resolve within the observed dialog","review");
 }
 if(modal.open&&modal.activeFocusId!==null&&!modal.descendantIds.includes(modal.activeFocusId)){
  add("modal-focus-outside","Active focus is not a descendant of the open dialog");
 }
 if(modal.open&&modal.focusableDescendantIds.length===0)add("modal-no-focusable-descendants","Open dialog has no focusable descendants");
 if(modal.open&&!modal.topmost)add("modal-not-topmost","A covered dialog is still marked open","review");
 if(modal.open&&modal.triggerId===null)add("modal-trigger-unrecorded","The control that opened the dialog was not recorded","review");
 if(!modal.open&&modal.returnFocusId!==null&&modal.returnFocusId!==modal.triggerId){
  add("modal-return-focus-mismatch","Focus restoration target differs from invoking control");
 }
 if(modal.closeButtonId!==null&&(!modal.closeButtonName||!modal.closeButtonName.trim())){
  add("modal-close-name-missing","Close control has no accessible name");
 }
 if(modal.open&&!modal.dismissible&&modal.escapeClosed===true)add("modal-undismissible-escaped","A non-dismissible modal closed on Escape");
 if(modal.open&&modal.dismissible&&modal.escapeClosed===false)add("modal-escape-not-handled","Dismissible modal did not close on Escape","review");
 return issues;
}
export function modalStackFindings(modals:readonly ModalSemantics[]):ModalProblem[]{
 const issues:ModalProblem[]=[];const open=modals.filter((modal)=>modal.open);
 const ids=new Set<string>();
 for(const modal of modals){
  if(ids.has(modal.id))issues.push({code:"modal-stack-duplicate-id",target:modal.id,detail:"Modal stack repeats an id",severity:"error"});
  ids.add(modal.id);
 }
 for(let index=0;index<open.length;index++){
  const modal=open[index]!;
  if(modal.topmost!==(index===open.length-1)){
   issues.push({code:"modal-stack-topmost-mismatch",target:modal.id,detail:"Only the last open modal may own topmost state",severity:"error"});
  }
 }
 return issues;
}
export function modalSummary(modal:ModalSemantics):string{
 return [`Kind: ${modal.kind}`,`Open: ${modal.open?"yes":"no"}`,`Topmost: ${modal.topmost?"yes":"no"}`,
  `Focusable descendants: ${modal.focusableDescendantIds.length}`,`Problems: ${modalSemanticsFindings(modal).length}`].join("\n");
}
