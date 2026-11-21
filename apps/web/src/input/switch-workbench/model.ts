/** Offline-only input rehearsal: no persistence, network, or device capabilities. */
export type Language = 'en' | 'fr';
export type Evidence = 'UNKNOWN' | 'OBSERVED' | 'DOCUMENTED';
export type Decision = 'UNKNOWN' | 'REVIEW' | 'READY';
export type ControlKind = 'button' | 'link' | 'checkbox' | 'radio' | 'tab' | 'field' | 'switch';
export type Activation = 'ENTER' | 'SPACE' | 'BOTH' | 'ARROWS' | 'NONE';
export type Severity = 'error' | 'review';
export interface Copy { readonly en: string; readonly fr: string }
export interface Source { readonly title: string; readonly url: string; readonly licence: string; readonly accessed: string }
export interface Control {
  readonly id: string; readonly kind: ControlKind; readonly name: Copy; readonly description: Copy;
  readonly group: string | null; readonly refs: readonly string[]; readonly activation: Activation;
  readonly visible: boolean; readonly disabled: boolean; readonly width: number; readonly height: number;
  readonly tabIndex: number; readonly evidence: Evidence; readonly source: Source | null; readonly reviewed: boolean;
}
export interface Project { readonly id: string; readonly title: Copy; readonly controls: readonly Control[]; readonly focusOrder: readonly string[]; readonly locale: Language }
export interface Finding { readonly code: string; readonly path: string; readonly severity: Severity }
export interface Review { readonly decision: Decision; readonly issues: readonly Finding[]; readonly errors: number; readonly reviews: number; readonly controls: number; readonly focusStops: number }
export const KINDS: readonly ControlKind[] = Object.freeze(['button','link','checkbox','radio','tab','field','switch']);
export const ACTIVATIONS: readonly Activation[] = Object.freeze(['ENTER','SPACE','BOTH','ARROWS','NONE']);
export const EVIDENCE: readonly Evidence[] = Object.freeze(['UNKNOWN','OBSERVED','DOCUMENTED']);
export const MINIMUM_TARGET = 44;
const MAX_CONTROLS = 80;
const ID_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Check C0 and DEL characters without control-character regex literals. */
export function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}
function startsWithFormulaMarker(value: string): boolean {
  let index = 0;
  while (index < value.length && /\s/u.test(value[index] ?? '')) index += 1;
  const first = value[index] ?? '';
  return first === '=' || first === '+' || first === '@' || first === '-';
}
export function isPlainObject(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}
export function isId(input: unknown): input is string {
  return typeof input === 'string' && input.length <= 70 && ID_RE.test(input);
}
export function isText(input: unknown, limit = 240): input is string {
  return typeof input === 'string' && input.trim().length > 0 && input.length <= limit && !hasControlCharacter(input);
}
export function isCopy(input: unknown, limit = 240): input is Copy {
  if (!isPlainObject(input)) return false;
  return isText(input.en, limit) && isText(input.fr, limit) && frenchIssues(input.fr).length === 0;
}
export function isDate(input: unknown): input is string {
  if (typeof input !== 'string') return false;
  const match = DATE_RE.exec(input);
  if (!match) return false;
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
export function isSafeUrl(input: unknown): input is string {
  if (typeof input !== 'string' || input.length > 1400 || hasControlCharacter(input)) return false;
  try {
    const url = new URL(input);
    return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password && !url.hash && !/\s/u.test(input);
  } catch { return false; }
}
export function isSafeFile(input: unknown): input is string {
  return typeof input === 'string' && input.length > 0 && input.length <= 100 && isId(input.replace(/\.json$/u, ''));
}
export function frenchIssues(input: string): string[] {
  const errors: string[] = [];
  if (/(^|[^\u00a0]):(?=\s|\S)/u.test(input) && /\S\s*:\s*/u.test(input)) {
    const left = [...input.matchAll(/[^\s\u00a0]:/gu)];
    if (left.length > 0) errors.push('fr.colon');
  }
  if (/[^\u202f][;!?]/u.test(input)) errors.push('fr.narrow');
  if (/«[^\u202f]/u.test(input)) errors.push('fr.open');
  if (/[^\u202f]»/u.test(input)) errors.push('fr.close');
  if (/[a-zA-Z]'[a-zA-Z]/u.test(input)) errors.push('fr.apostrophe');
  return errors;
}
export function safeCsvCell(input: unknown): string {
  const value = typeof input === 'string' ? input : input == null ? '' : String(input);
  let normalized = '';
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    normalized += code <= 0x1f || code === 0x7f ? ' ' : value[index];
  }
  const guarded = startsWithFormulaMarker(normalized) ? `'${normalized}` : normalized;
  return `"${guarded.replace(/"/gu, '""')}"`;
}
export function finding(code: string, path: string, severity: Severity = 'error'): Finding { return { code, path, severity }; }
export function sortFindings(issues: readonly Finding[]): Finding[] {
  return [...issues].sort((a,b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code) || a.severity.localeCompare(b.severity));
}
export function controlIssues(value: unknown, index = 0): Finding[] {
  const path = `controls[${index}]`;
  if (!isPlainObject(value)) return [finding('control.invalid',path)];
  const issues: Finding[] = [];
  if (!isId(value.id)) issues.push(finding('control.id',`${path}.id`));
  if (!KINDS.includes(value.kind as ControlKind)) issues.push(finding('control.kind',`${path}.kind`));
  if (!isCopy(value.name)) issues.push(finding('control.name',`${path}.name`));
  if (!isCopy(value.description,600)) issues.push(finding('control.description',`${path}.description`));
  if (value.group !== null && !isId(value.group)) issues.push(finding('control.group',`${path}.group`));
  if (!Array.isArray(value.refs) || value.refs.some(ref => !isId(ref))) issues.push(finding('control.refs',`${path}.refs`));
  if (!ACTIVATIONS.includes(value.activation as Activation)) issues.push(finding('control.activation',`${path}.activation`));
  if (typeof value.visible !== 'boolean' || typeof value.disabled !== 'boolean') issues.push(finding('control.flags',path));
  if (typeof value.width !== 'number' || typeof value.height !== 'number' || !Number.isFinite(value.width) || !Number.isFinite(value.height) || value.width < MINIMUM_TARGET || value.height < MINIMUM_TARGET) issues.push(finding('control.target-size',`${path}.size`));
  if (!Number.isInteger(value.tabIndex) || (value.tabIndex as number) < -1) issues.push(finding('control.tabindex',`${path}.tabIndex`));
  else if ((value.tabIndex as number) > 0) issues.push(finding('control.positive-tabindex',`${path}.tabIndex`));
  if (value.visible === false && value.tabIndex !== -1) issues.push(finding('control.hidden-tabbable',path));
  if (value.disabled === true && value.tabIndex === 0) issues.push(finding('control.disabled-tabbable',path));
  if (!EVIDENCE.includes(value.evidence as Evidence)) issues.push(finding('control.evidence',`${path}.evidence`));
  if (typeof value.reviewed !== 'boolean') issues.push(finding('control.reviewed',`${path}.reviewed`));
  if (value.evidence === 'UNKNOWN' && value.reviewed === true) issues.push(finding('control.unknown-reviewed',path,'review'));
  if (value.evidence === 'DOCUMENTED' && value.source === null) issues.push(finding('control.missing-source',path,'review'));
  if (value.source !== null) issues.push(...sourceIssues(value.source,`${path}.source`));
  if (value.activation === 'NONE' && value.disabled === false) issues.push(finding('control.no-activation',path,'review'));
  if (value.kind === 'link' && value.activation === 'SPACE') issues.push(finding('control.link-space-only',path));
  if (value.kind === 'checkbox' && value.activation === 'ENTER') issues.push(finding('control.checkbox-enter-only',path));
  return issues;
}
export function sourceIssues(input: unknown,path='source'): Finding[] {
  if (!isPlainObject(input)) return [finding('source.invalid',path)];
  const issues: Finding[] = [];
  if (!isText(input.title,160)) issues.push(finding('source.title',`${path}.title`));
  if (!isSafeUrl(input.url)) issues.push(finding('source.url',`${path}.url`));
  if (!isText(input.licence,120)) issues.push(finding('source.licence',`${path}.licence`));
  if (!isDate(input.accessed)) issues.push(finding('source.date',`${path}.accessed`));
  return issues;
}
export function projectIssues(input: unknown): Finding[] {
  if (!isPlainObject(input)) return [finding('project.invalid','project')];
  const issues: Finding[] = [];
  if (!isId(input.id)) issues.push(finding('project.id','project.id'));
  if (!isCopy(input.title)) issues.push(finding('project.title','project.title'));
  if (!['en','fr'].includes(input.locale as string)) issues.push(finding('project.locale','project.locale'));
  if (!Array.isArray(input.controls)) { issues.push(finding('project.controls','project.controls')); return issues; }
  if (input.controls.length > MAX_CONTROLS) issues.push(finding('project.too-many-controls','project.controls'));
  const ids = new Map<string,number>();
  input.controls.forEach((control,index) => {
    issues.push(...controlIssues(control,index));
    if (!isPlainObject(control) || typeof control.id !== 'string') return;
    if (ids.has(control.id)) issues.push(finding('project.duplicate-id',`controls[${index}].id`));
    ids.set(control.id,index);
  });
  input.controls.forEach((control,index) => {
    if (!isPlainObject(control) || !Array.isArray(control.refs)) return;
    for (const ref of control.refs) if (typeof ref === 'string' && !ids.has(ref)) issues.push(finding('project.dangling-reference',`controls[${index}].refs`));
    if (typeof control.group === 'string' && !ids.has(control.group)) issues.push(finding('project.missing-group',`controls[${index}].group`,'review'));
  });
  if (!Array.isArray(input.focusOrder) || input.focusOrder.some(id => typeof id !== 'string')) {
    issues.push(finding('project.focus-order','project.focusOrder')); return issues;
  }
  const focused = new Set<string>();
  for (const [index,id] of input.focusOrder.entries()) {
    const path = `focusOrder[${index}]`;
    if (focused.has(id)) issues.push(finding('project.duplicate-focus',path));
    focused.add(id);
    if (!ids.has(id)) issues.push(finding('project.missing-focus',path));
    const control = input.controls[ids.get(id) ?? -1] as Record<string,unknown> | undefined;
    if (control && (control.visible === false || control.disabled === true || control.tabIndex === -1)) issues.push(finding('project.inactive-focus',path));
  }
  for (const [id,index] of ids) {
    const control=input.controls[index] as Record<string,unknown> | undefined;
    if (control && control.visible === true && control.disabled === false && control.tabIndex === 0 && !focused.has(id)) issues.push(finding('project.unreachable-control',`controls[${index}]`,'review'));
  }
  return sortFindings(issues);
}
export function reviewProject(project: Project): Review {
  const issues=projectIssues(project);
  const errors=issues.filter(i => i.severity==='error').length;
  const reviews=issues.filter(i => i.severity==='review').length;
  const unknown=project.controls.some(c => c.evidence==='UNKNOWN' || !c.reviewed);
  return { decision: errors ? 'REVIEW' : reviews || unknown || project.controls.length===0 ? 'UNKNOWN' : 'READY',
    issues, errors, reviews, controls:project.controls.length, focusStops:project.focusOrder.length };
}
export function defaultControl(id='first'): Control {
  return { id, kind:'button', name:{en:'Continue',fr:'Continuer'},description:{en:'Move to the next item',fr:'Passer à l’élément suivant'},
    group:null,refs:[],activation:'BOTH',visible:true,disabled:false,width:44,height:44,tabIndex:0,
    evidence:'UNKNOWN',source:null,reviewed:false };
}
export function defaultProject(): Project {
  return {id:'local-workbench',title:{en:'Input workbench',fr:'Atelier de commande'},controls:[],focusOrder:[],locale:'en'};
}
export function updateControl(project: Project,control: Control): Project {
  if (!isId(control.id)) return project;
  const existing=project.controls.some(c=>c.id===control.id);
  const controls=existing ? project.controls.map(c=>c.id===control.id?control:c) : [...project.controls,control];
  const focusOrder=control.visible && !control.disabled && control.tabIndex===0 && !project.focusOrder.includes(control.id)
    ? [...project.focusOrder,control.id] : project.focusOrder.filter(id=>id!==control.id || (control.visible && !control.disabled && control.tabIndex===0));
  return {...project,controls,focusOrder};
}
export function removeControl(project:Project,id:string):Project {
  return {...project,controls:project.controls.filter(c=>c.id!==id).map(c=>({...c,refs:c.refs.filter(ref=>ref!==id),group:c.group===id?null:c.group})),focusOrder:project.focusOrder.filter(item=>item!==id)};
}
export function moveControl(project:Project,id:string,direction:-1|1):Project {
  const order=[...project.focusOrder];const index=order.indexOf(id);const next=index+direction;
  if(index<0||next<0||next>=order.length)return project;
  [order[index],order[next]]=[order[next]!,order[index]!];
  return {...project,focusOrder:order};
}
export function describeDecision(value:Review):Decision {return value.decision;}
