import test from "node:test";
import assert from "node:assert/strict";
import { emptyNestedDialogState, topDialog, nestedDialogIssues, nestedDialogStep, replayNestedDialogs, nestedDialogSummary } from "./p20ag-dialog-nesting.ts";
const dialog=(id,triggerId,parentId=null,openedAt=1)=>({id,triggerId,parentId,dismissible:true,openedAt});
const open=(state,item,at=item.openedAt)=>nestedDialogStep(state,{type:"open",dialog:item,at});
const close=(state,id,at)=>nestedDialogStep(state,{type:"close",dialogId:id,at,observedClosed:true});
test("P20AG nested dialog state begins empty",()=>assert.deepEqual(emptyNestedDialogState(),{stack:[],activeId:null,revision:0,closedIds:[],pendingRestore:null}));
test("P20AG top dialog is null for empty stack",()=>assert.equal(topDialog(emptyNestedDialogState()),null));
test("P20AG opening root dialog sets it as topmost",()=>{
 const result=open(emptyNestedDialogState(),dialog("root","open-root"));
 assert.equal(result.accepted,true);assert.equal(topDialog(result.state).id,"root");
});
test("P20AG opening nested dialog requires current top as parent",()=>{
 const root=open(emptyNestedDialogState(),dialog("root","open-root")).state;
 const child=open(root,dialog("child","open-child","root",2));
 assert.equal(child.accepted,true);assert.equal(topDialog(child.state).id,"child");
});
test("P20AG opening nested dialog with wrong parent is rejected",()=>{
 const root=open(emptyNestedDialogState(),dialog("root","open-root")).state;
 assert.equal(open(root,dialog("child","open-child",null,2)).reason,"dialog-parent-mismatch");
});
test("P20AG duplicate open dialog id is rejected",()=>{
 const root=open(emptyNestedDialogState(),dialog("root","open-root")).state;
 assert.equal(open(root,dialog("root","another-trigger",null,2)).reason,"dialog-already-open");
});
test("P20AG invalid dialog identifier is rejected",()=>assert.equal(open(emptyNestedDialogState(),dialog("../bad","open")).reason,"dialog-identity-invalid"));
test("P20AG invalid trigger identifier is rejected",()=>assert.equal(open(emptyNestedDialogState(),dialog("root","bad id")).reason,"dialog-identity-invalid"));
test("P20AG fifth nested dialog is permitted",()=>{
 let state=emptyNestedDialogState();
 for(let i=0;i<5;i++)state=open(state,dialog(`d${i}`,`t${i}`,i?`d${i-1}`:null,i+1)).state;
 assert.equal(state.stack.length,5);
});
test("P20AG sixth nested dialog exceeds depth limit",()=>{
 let state=emptyNestedDialogState();
 for(let i=0;i<5;i++)state=open(state,dialog(`d${i}`,`t${i}`,i?`d${i-1}`:null,i+1)).state;
 assert.equal(open(state,dialog("d5","t5","d4",6)).reason,"dialog-depth-limit");
});
test("P20AG dialog openedAt cannot be after action time",()=>assert.equal(open(emptyNestedDialogState(),dialog("root","trigger",null,5),4).reason,"dialog-opened-in-future"));
test("P20AG root dialog open time cannot be negative",()=>assert.ok(nestedDialogIssues({...emptyNestedDialogState(),stack:[dialog("root","trigger",null,-1)],activeId:"root"}).includes("dialog-open-time-invalid:root")));
test("P20AG focus action requires topmost dialog",()=>{
 const state=open(emptyNestedDialogState(),dialog("root","trigger")).state;
 assert.equal(nestedDialogStep(state,{type:"focus",dialogId:"other",focusId:"x",at:2}).reason,"dialog-not-topmost");
});
test("P20AG focus action updates active target",()=>{
 const state=open(emptyNestedDialogState(),dialog("root","trigger")).state;
 const result=nestedDialogStep(state,{type:"focus",dialogId:"root",focusId:"inside",at:2});
 assert.equal(result.state.activeId,"inside");
});
test("P20AG focus action rejects invalid focus id",()=>{
 const state=open(emptyNestedDialogState(),dialog("root","trigger")).state;
 assert.equal(nestedDialogStep(state,{type:"focus",dialogId:"root",focusId:"bad id",at:2}).reason,"dialog-focus-id-invalid");
});
test("P20AG Escape closes only dismissible topmost dialog",()=>{
 const state=open(emptyNestedDialogState(),dialog("root","trigger")).state;
 assert.equal(nestedDialogStep(state,{type:"escape",dialogId:"root",at:2}).accepted,true);
});
test("P20AG Escape rejects nondismissible dialog",()=>{
 const state=open(emptyNestedDialogState(),{...dialog("root","trigger"),dismissible:false}).state;
 assert.equal(nestedDialogStep(state,{type:"escape",dialogId:"root",at:2}).reason,"dialog-not-dismissible");
});
test("P20AG closing parent while child is topmost is rejected",()=>{
 let state=open(emptyNestedDialogState(),dialog("root","trigger")).state;
 state=open(state,dialog("child","open-child","root",2)).state;
 assert.equal(close(state,"root",3).reason,"dialog-not-topmost");
});
test("P20AG close requires browser-observed closed state",()=>{
 const state=open(emptyNestedDialogState(),dialog("root","trigger")).state;
 assert.equal(nestedDialogStep(state,{type:"close",dialogId:"root",at:2,observedClosed:false}).reason,"dialog-close-not-observed");
});
test("P20AG close removes topmost dialog and stores restore target",()=>{
 const state=open(emptyNestedDialogState(),dialog("root","trigger")).state;
 const result=close(state,"root",2);
 assert.equal(result.state.stack.length,0);
 assert.equal(result.state.pendingRestore.triggerId,"trigger");
});
test("P20AG restore returns focus to invoking control",()=>{
 const opened=open(emptyNestedDialogState(),dialog("root","trigger")).state;
 const closed=close(opened,"root",2).state;
 const restored=nestedDialogStep(closed,{type:"restore",dialogId:"root",targetId:"trigger",activeId:"trigger",at:3});
 assert.equal(restored.accepted,true);assert.equal(restored.state.activeId,"trigger");assert.equal(restored.state.pendingRestore,null);
});
test("P20AG restore rejects wrong trigger",()=>{
 const closed=close(open(emptyNestedDialogState(),dialog("root","trigger")).state,"root",2).state;
 assert.equal(nestedDialogStep(closed,{type:"restore",dialogId:"root",targetId:"wrong",activeId:"wrong",at:3}).reason,"dialog-restore-trigger-mismatch");
});
test("P20AG restore rejects focus not actually moved",()=>{
 const closed=close(open(emptyNestedDialogState(),dialog("root","trigger")).state,"root",2).state;
 assert.equal(nestedDialogStep(closed,{type:"restore",dialogId:"root",targetId:"trigger",activeId:"other",at:3}).reason,"dialog-restore-not-active");
});
test("P20AG restore rejects absent pending restoration",()=>{
 assert.equal(nestedDialogStep(emptyNestedDialogState(),{type:"restore",dialogId:"root",targetId:"trigger",activeId:"trigger",at:1}).reason,"dialog-restore-not-pending");
});
test("P20AG nested child closes back to parent trigger",()=>{
 let state=open(emptyNestedDialogState(),dialog("root","open-root")).state;
 state=open(state,dialog("child","open-child","root",2)).state;
 state=close(state,"child",3).state;
 const restored=nestedDialogStep(state,{type:"restore",dialogId:"child",targetId:"open-child",activeId:"open-child",at:4});
 assert.equal(restored.state.stack.length,1);assert.equal(restored.state.activeId,"open-child");
});
test("P20AG nested dialog issues accepts a well-formed stack",()=>{
 const state={...emptyNestedDialogState(),stack:[dialog("root","open-root"),dialog("child","open-child","root",2)],activeId:"child"};
 assert.deepEqual(nestedDialogIssues(state),[]);
});
test("P20AG nested dialog issues reports duplicate id",()=>{
 const state={...emptyNestedDialogState(),stack:[dialog("root","one"),dialog("root","two")],activeId:"root"};
 assert.ok(nestedDialogIssues(state).includes("dialog-id-duplicate:root"));
});
test("P20AG nested dialog issues reports bad parent order",()=>{
 const state={...emptyNestedDialogState(),stack:[dialog("root","one"),dialog("child","two","other",2)],activeId:"child"};
 assert.ok(nestedDialogIssues(state).includes("dialog-parent-order-invalid:child"));
});
test("P20AG nested dialog issues reports active id missing",()=>{
 const state={...emptyNestedDialogState(),stack:[dialog("root","one")],activeId:null};
 assert.ok(nestedDialogIssues(state).includes("dialog-active-missing"));
});
test("P20AG replay accepts open focus close restore sequence",()=>{
 const result=replayNestedDialogs([
  {type:"open",dialog:dialog("root","trigger"),at:1},
  {type:"focus",dialogId:"root",focusId:"inside",at:2},
  {type:"close",dialogId:"root",at:3,observedClosed:true},
  {type:"restore",dialogId:"root",targetId:"trigger",activeId:"trigger",at:4},
 ]);
 assert.equal(result.accepted,4);assert.equal(result.state.activeId,"trigger");assert.equal(result.rejected.length,0);
});
test("P20AG nested dialog summary includes stack depth",()=>{
 const state=open(emptyNestedDialogState(),dialog("root","trigger")).state;
 assert.match(nestedDialogSummary(state),/Open dialogs: 1/);
});
