import { type Control, type Finding, type Project, finding, sortFindings } from './model.ts';
export type Command = 'NEXT' | 'PREVIOUS' | 'SELECT' | 'BACK' | 'CANCEL' | 'RESET' | 'HOME' | 'END' | 'GROUP_NEXT' | 'GROUP_PREVIOUS';
export type Mode = 'LINEAR' | 'GROUPED' | 'DIRECT';
export type Phase = 'IDLE' | 'FOCUSED' | 'SELECTED' | 'CANCELLED' | 'UNKNOWN';
export interface Event { readonly sequence:number; readonly command:Command; readonly from:string|null; readonly to:string|null; readonly accepted:boolean; readonly reason:string|null }
export interface Machine { readonly mode:Mode; readonly phase:Phase; readonly focus:string|null; readonly selected:string|null; readonly history:readonly string[]; readonly events:readonly Event[]; readonly group:string|null; readonly wrap:boolean }
export interface Transition { readonly machine:Machine; readonly last:Event; readonly issues:readonly Finding[] }
export interface Pattern { readonly sequence:readonly Command[]; readonly expectedFocus:string|null; readonly expectedSelected:string|null }
export interface Audit { readonly total:number; readonly accepted:number; readonly rejected:number; readonly selected:number; readonly issues:readonly Finding[] }
export const COMMANDS:readonly Command[]=Object.freeze(['NEXT','PREVIOUS','SELECT','BACK','CANCEL','RESET','HOME','END','GROUP_NEXT','GROUP_PREVIOUS']);
export const MODES:readonly Mode[]=Object.freeze(['LINEAR','GROUPED','DIRECT']);
const MAX_EVENTS=250; const MAX_HISTORY=100;
function eligible(control:Control):boolean{return control.visible&&!control.disabled&&control.tabIndex===0;}
export function eligibleIds(project:Project):string[]{const byId=new Map(project.controls.map(c=>[c.id,c]));return project.focusOrder.filter(id=>{const control=byId.get(id);return control!==undefined&&eligible(control);});}
export function groups(project:Project):Array<{id:string;controls:string[]}>{const byId=new Map(project.controls.map(c=>[c.id,c]));const ordered=new Map<string,string[]>();for(const id of eligibleIds(project)){const control=byId.get(id);const group=control?.group??'ungrouped';if(!ordered.has(group))ordered.set(group,[]);ordered.get(group)?.push(id);}return Array.from(ordered,([id,controls])=>({id,controls}));}
export function initialMachine(mode:Mode='LINEAR',wrap=true):Machine{return {mode,phase:'IDLE',focus:null,selected:null,history:[],events:[],group:null,wrap};}
function errorEvent(state:Machine,command:Command,reason:string):Event{return {sequence:state.events.length+1,command,from:state.focus,to:state.focus,accepted:false,reason};}
function successful(state:Machine,command:Command,to:string|null):Event{return {sequence:state.events.length+1,command,from:state.focus,to,accepted:true,reason:null};}
function pushEvent(machine:Machine,event:Event):Machine{return {...machine,events:[...machine.events,event].slice(-MAX_EVENTS)};}
function travel(available:readonly string[],focus:string|null,direction:-1|1,wrap:boolean):string|null{if(!available.length)return null;const index=focus===null?-1:available.indexOf(focus);if(index<0)return direction===1?available[0]??null:available.at(-1)??null;const next=index+direction;if(next>=0&&next<available.length)return available[next]??null;if(!wrap)return focus;return direction===1?available[0]??null:available.at(-1)??null;}
export function stepMachine(machine:Machine,command:Command,project:Project):Transition{
 const available=eligibleIds(project);
 if(!COMMANDS.includes(command)){const event=errorEvent(machine,command,'command.unsupported');return {machine:pushEvent(machine,event),last:event,issues:[finding('scan.invalid-command','command')]};}
 if(command==='RESET'){const event=successful(machine,command,null);return {machine:pushEvent({...machine,phase:'IDLE',focus:null,selected:null,history:[],group:null},event),last:event,issues:[]};}
 if(command==='CANCEL'){const event=successful(machine,command,machine.focus);return {machine:pushEvent({...machine,phase:'CANCELLED',selected:null},event),last:event,issues:[]};}
 if(!available.length){const event=errorEvent(machine,command,'scan.no-controls');return {machine:pushEvent({...machine,phase:'UNKNOWN',focus:null,selected:null},event),last:event,issues:[finding('scan.no-controls','controls','review')]};}
 let focus=machine.focus,selected=machine.selected,group=machine.group,phase:Phase='FOCUSED',history=[...machine.history],problem:string|null=null;
 switch(command){
 case 'NEXT':focus=travel(available,focus,1,machine.wrap);break;
 case 'PREVIOUS':focus=travel(available,focus,-1,machine.wrap);break;
 case 'HOME':focus=available[0]??null;break;
 case 'END':focus=available.at(-1)??null;break;
 case 'SELECT':if(focus===null||!available.includes(focus)){problem='scan.nothing-focused';break;}selected=focus;phase='SELECTED';break;
 case 'BACK':if(!history.length){problem='scan.no-history';break;}focus=history.pop()??null;break;
 case 'GROUP_NEXT':case 'GROUP_PREVIOUS':{const entries=groups(project);if(!entries.length){problem='scan.no-groups';break;}const index=entries.findIndex(entry=>entry.id===group);const next=travel(entries.map(entry=>entry.id),index>=0?group:null,command==='GROUP_NEXT'?1:-1,machine.wrap);const chosen=entries.find(entry=>entry.id===next);if(!chosen){problem='scan.no-groups';break;}group=chosen.id;focus=chosen.controls[0]??null;break;}
 default:problem='scan.unsupported';
 }
 if(problem){const event=errorEvent(machine,command,problem);return {machine:pushEvent(machine,event),last:event,issues:[finding(problem,'scan','review')]};}
 if(command!=='BACK'&&focus!==machine.focus&&machine.focus!==null)history=[...history,machine.focus].slice(-MAX_HISTORY);
 if(command!=='SELECT')selected=null;
 const event=successful(machine,command,focus);const result=pushEvent({...machine,focus,selected,group,phase,history},event);return {machine:result,last:event,issues:[]};
}
export function replay(project:Project,commands:readonly Command[],mode:Mode='LINEAR'):Machine{let state=initialMachine(mode);for(const command of commands)state=stepMachine(state,command,project).machine;return state;}
export function replaySafely(project:Project,commands:readonly string[]):{state:Machine;issues:Finding[]}{let state=initialMachine();const issues:Finding[]=[];commands.forEach((value,index)=>{if(!COMMANDS.includes(value as Command)){issues.push(finding('scan.unsupported-command',`commands[${index}]`));return;}const result=stepMachine(state,value as Command,project);issues.push(...result.issues);state=result.machine;});return {state,issues:sortFindings(issues)};}
export function machineAudit(machine:Machine,project:Project):Finding[]{const issues:Finding[]=[];const available=eligibleIds(project);if(!MODES.includes(machine.mode))issues.push(finding('machine.mode','machine.mode'));if(machine.focus!==null&&!available.includes(machine.focus))issues.push(finding('machine.stale-focus','machine.focus'));if(machine.selected!==null&&!available.includes(machine.selected))issues.push(finding('machine.stale-selection','machine.selected'));if(machine.events.length>MAX_EVENTS)issues.push(finding('machine.events-over-limit','machine.events'));if(machine.history.length>MAX_HISTORY)issues.push(finding('machine.history-over-limit','machine.history'));for(const [index,id] of machine.history.entries())if(!available.includes(id))issues.push(finding('machine.invalid-history',`machine.history[${index}]`));for(const [index,event] of machine.events.entries()){if(!COMMANDS.includes(event.command))issues.push(finding('machine.invalid-event',`machine.events[${index}]`));if(event.accepted&&event.reason!==null)issues.push(finding('machine.event-conflict',`machine.events[${index}]`));if(!event.accepted&&event.reason===null)issues.push(finding('machine.missing-reason',`machine.events[${index}]`));}return sortFindings(issues);}
export function verifyPattern(project:Project,pattern:Pattern):Finding[]{const outcome=replaySafely(project,pattern.sequence);const issues=[...outcome.issues];if(outcome.state.focus!==pattern.expectedFocus)issues.push(finding('pattern.focus-mismatch','pattern.expectedFocus'));if(outcome.state.selected!==pattern.expectedSelected)issues.push(finding('pattern.selection-mismatch','pattern.expectedSelected'));issues.push(...machineAudit(outcome.state,project));return sortFindings(issues);}
export function summary(machine:Machine):Audit{const accepted=machine.events.filter(event=>event.accepted).length;const rejected=machine.events.length-accepted;const selected=machine.events.filter(event=>event.accepted&&event.command==='SELECT').length;const issues=machine.events.filter(event=>!event.accepted).map((event,index)=>finding(event.reason??'scan.rejected',`events[${index}]`,'review'));return {total:machine.events.length,accepted,rejected,selected,issues};}
export function describeFocus(machine:Machine,project:Project,lang:'en'|'fr'):string{if(machine.focus===null)return 'UNKNOWN';const control=project.controls.find(c=>c.id===machine.focus);return control?.name[lang]??'UNKNOWN';}
export function withMode(machine:Machine,mode:Mode):Machine{if(!MODES.includes(mode))return machine;return {...initialMachine(mode,machine.wrap)};}
export function withWrap(machine:Machine,wrap:boolean):Machine{return {...machine,wrap};}
