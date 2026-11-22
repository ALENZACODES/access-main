/** P20AH deterministic contracts for bilingual accessible form validation and recovery. */
export type Locale = "en" | "fr";
export type FieldKind = "text" | "email" | "tel" | "number" | "date" | "select" | "checkbox" | "radio" | "textarea" | "other";
export type IssueCode =
  | "required" | "empty-after-trim" | "too-short" | "too-long" | "pattern-mismatch"
  | "invalid-email" | "invalid-number" | "below-minimum" | "above-maximum"
  | "invalid-date" | "invalid-choice" | "duplicate-value" | "dependency-unmet"
  | "confirmation-mismatch" | "invalid-character" | "invalid-option" | "group-required"
  | "group-selection-count" | "invalid-state" | "missing-label" | "missing-description"
  | "missing-error-reference" | "stale-error-reference" | "summary-target-missing"
  | "summary-target-duplicate" | "announcement-empty" | "announcement-duplicate"
  | "focus-target-missing" | "focus-not-moved" | "error-count-mismatch"
  | "field-order-mismatch" | "form-id-invalid" | "field-id-invalid" | "duplicate-id"
  | "limit-exceeded" | "unknown-rule";
export type Severity = "error" | "review" | "information";
export interface Bilingual { readonly en:string; readonly fr:string; }
export interface RuleSet {
  readonly required?:boolean;
  readonly minLength?:number;
  readonly maxLength?:number;
  readonly pattern?:string;
  readonly min?:number;
  readonly max?:number;
  readonly choices?:readonly string[];
  readonly trim?:boolean;
  readonly allowControlCharacters?:boolean;
  readonly dependsOn?:string;
  readonly dependsValue?:string;
  readonly confirmationOf?:string;
  readonly uniqueWithin?:string;
}
export interface FormField {
  readonly id:string;
  readonly name:string;
  readonly label:Bilingual;
  readonly description:Bilingual|null;
  readonly kind:FieldKind;
  readonly value:string;
  readonly order:number;
  readonly disabled:boolean;
  readonly hidden:boolean;
  readonly required:boolean;
  readonly rules:RuleSet;
}
export interface FormGroup {
  readonly id:string;
  readonly legend:Bilingual;
  readonly kind:"radio"|"checkbox";
  readonly fieldIds:readonly string[];
  readonly minimumSelected:number;
  readonly maximumSelected:number|null;
  readonly required:boolean;
}
export interface FormDefinition {
  readonly id:string;
  readonly locale:Locale;
  readonly fields:readonly FormField[];
  readonly groups:readonly FormGroup[];
  readonly maximumFields:number;
}
export interface FieldIssue {
  readonly fieldId:string;
  readonly code:IssueCode;
  readonly severity:Severity;
  readonly message:Bilingual;
  readonly order:number;
  readonly source:"field"|"group"|"cross-field"|"contract";
}
export interface FieldResult {
  readonly fieldId:string;
  readonly valid:boolean;
  readonly value:string;
  readonly issues:readonly FieldIssue[];
}
export interface FormResult {
  readonly formId:string;
  readonly valid:boolean;
  readonly fields:readonly FieldResult[];
  readonly issues:readonly FieldIssue[];
  readonly firstInvalidFieldId:string|null;
  readonly errorCount:number;
  readonly reviewCount:number;
}
export interface ValidationPolicy {
  readonly maximumFields:number;
  readonly maximumValueLength:number;
  readonly maximumPatternLength:number;
  readonly maximumIssues:number;
  readonly requireBilingualLabels:boolean;
  readonly rejectControlCharacters:boolean;
}
export const DEFAULT_POLICY:ValidationPolicy={
  maximumFields:200,maximumValueLength:4096,maximumPatternLength:256,
  maximumIssues:500,requireBilingualLabels:true,rejectControlCharacters:true,
};
const ID=/^[A-Za-z][A-Za-z0-9_:.-]{0,127}$/;
const CONTROL=/[\u0000-\u001f\u007f-\u009f]/;
const EMAIL=/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/;
const ISO_DATE=/^(\d{4})-(\d{2})-(\d{2})$/;
const MESSAGES:Readonly<Record<IssueCode,Bilingual>>={
  required:{en:"Enter a value.",fr:"Saisissez une valeur."},
  "empty-after-trim":{en:"Enter a value without surrounding spaces.",fr:"Saisissez une valeur sans espaces au début ni à la fin."},
  "too-short":{en:"Enter more characters.",fr:"Saisissez davantage de caractères."},
  "too-long":{en:"Use fewer characters.",fr:"Utilisez moins de caractères."},
  "pattern-mismatch":{en:"Use the requested format.",fr:"Respectez le format demandé."},
  "invalid-email":{en:"Enter an email address in the expected format.",fr:"Saisissez une adresse courriel au format attendu."},
  "invalid-number":{en:"Enter a valid number.",fr:"Saisissez un nombre valide."},
  "below-minimum":{en:"Enter a value at or above the minimum.",fr:"Saisissez une valeur égale ou supérieure au minimum."},
  "above-maximum":{en:"Enter a value at or below the maximum.",fr:"Saisissez une valeur égale ou inférieure au maximum."},
  "invalid-date":{en:"Enter a real date in YYYY-MM-DD format.",fr:"Saisissez une date réelle au format AAAA-MM-JJ."},
  "invalid-choice":{en:"Choose one of the listed options.",fr:"Choisissez l’une des options proposées."},
  "duplicate-value":{en:"Use a value that is not already in this group.",fr:"Utilisez une valeur qui n’est pas déjà présente dans ce groupe."},
  "dependency-unmet":{en:"Complete the related field first.",fr:"Remplissez d’abord le champ associé."},
  "confirmation-mismatch":{en:"The values do not match.",fr:"Les valeurs ne correspondent pas."},
  "invalid-character":{en:"Remove unsupported control characters.",fr:"Retirez les caractères de contrôle non pris en charge."},
  "invalid-option":{en:"Choose an available option.",fr:"Choisissez une option disponible."},
  "group-required":{en:"Choose at least one option.",fr:"Choisissez au moins une option."},
  "group-selection-count":{en:"Choose an allowed number of options.",fr:"Choisissez un nombre d’options autorisé."},
  "invalid-state":{en:"This field has an invalid state.",fr:"L’état de ce champ n’est pas valide."},
  "missing-label":{en:"This field needs a visible label.",fr:"Ce champ doit avoir une étiquette visible."},
  "missing-description":{en:"The referenced description is not available.",fr:"La description indiquée n’est pas disponible."},
  "missing-error-reference":{en:"The error message is not connected to its field.",fr:"Le message d’erreur n’est pas associé à son champ."},
  "stale-error-reference":{en:"The field refers to an error that is no longer present.",fr:"Le champ fait référence à une erreur qui n’est plus présente."},
  "summary-target-missing":{en:"The error summary points to a field that is not present.",fr:"Le résumé des erreurs pointe vers un champ absent."},
  "summary-target-duplicate":{en:"The error summary repeats a field.",fr:"Le résumé des erreurs répète un champ."},
  "announcement-empty":{en:"The status message is empty.",fr:"Le message d’état est vide."},
  "announcement-duplicate":{en:"The same status message was repeated.",fr:"Le même message d’état a été répété."},
  "focus-target-missing":{en:"The first field with an error could not be found.",fr:"Le premier champ en erreur est introuvable."},
  "focus-not-moved":{en:"Focus did not move to the error summary.",fr:"Le focus n’a pas été déplacé vers le résumé des erreurs."},
  "error-count-mismatch":{en:"The summary count does not match the field errors.",fr:"Le nombre du résumé ne correspond pas aux erreurs des champs."},
  "field-order-mismatch":{en:"The error summary does not follow the form order.",fr:"Le résumé des erreurs ne respecte pas l’ordre du formulaire."},
  "form-id-invalid":{en:"The form identifier is invalid.",fr:"L’identifiant du formulaire n’est pas valide."},
  "field-id-invalid":{en:"The field identifier is invalid.",fr:"L’identifiant du champ n’est pas valide."},
  "duplicate-id":{en:"An identifier is used more than once.",fr:"Un identifiant est utilisé plusieurs fois."},
  "limit-exceeded":{en:"The form exceeds the configured review limit.",fr:"Le formulaire dépasse la limite d’examen configurée."},
  "unknown-rule":{en:"The field contains a rule that is not supported.",fr:"Le champ contient une règle qui n’est pas prise en charge."},
};
function issue(field:FormField,code:IssueCode,source:FieldIssue["source"]="field"):FieldIssue{
 return {fieldId:field.id,code,severity:"error",message:MESSAGES[code],order:field.order,source};
}
function isRealDate(value:string):boolean{
 const match=ISO_DATE.exec(value);
 if(!match)return false;
 const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
 const date=new Date(Date.UTC(year,month-1,day));
 return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day;
}
function safePattern(pattern:string,maximum:number):RegExp|null{
 if(pattern.length>maximum)return null;
 try{return new RegExp(pattern,"u");}catch{return null;}
}
export function normalizeFieldValue(value:string,trim=true):string{return trim?value.trim():value;}
export function isEmptyValue(value:string):boolean{return value.trim().length===0;}
export function isControlFree(value:string):boolean{return !CONTROL.test(value);}
export function fieldById(form:FormDefinition,id:string):FormField|undefined{return form.fields.find((field)=>field.id===id);}
export function orderedFields(form:FormDefinition):FormField[]{return [...form.fields].sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));}
export function validateField(form:FormDefinition,field:FormField,policy:ValidationPolicy=DEFAULT_POLICY):FieldResult{
 const issues:FieldIssue[]=[];
 const add=(code:IssueCode,source:FieldIssue["source"]="field")=>issues.push(issue(field,code,source));
 const raw=field.value;
 if(raw.length>policy.maximumValueLength){add("limit-exceeded");return {fieldId:field.id,valid:false,value:raw,issues};}
 if(field.disabled||field.hidden)return {fieldId:field.id,valid:true,value:raw,issues};
 const value=normalizeFieldValue(raw,field.rules.trim!==false);
 if(policy.rejectControlCharacters&&!isControlFree(raw)&&field.rules.allowControlCharacters!==true)add("invalid-character");
 if(field.required||field.rules.required){
  if(isEmptyValue(raw))add("required");
 }
 if(isEmptyValue(raw))return {fieldId:field.id,valid:issues.length===0,value,issues};
 if(field.rules.trim===false&&raw!==raw.trim())add("empty-after-trim");
 if(field.rules.minLength!==undefined&&value.length<field.rules.minLength)add("too-short");
 if(field.rules.maxLength!==undefined&&value.length>field.rules.maxLength)add("too-long");
 if(field.rules.pattern!==undefined){
  const pattern=safePattern(field.rules.pattern,policy.maximumPatternLength);
  if(pattern===null)add("unknown-rule");
  else if(!pattern.test(value))add("pattern-mismatch");
 }
 if(field.kind==="email"&&!EMAIL.test(value))add("invalid-email");
 if(field.kind==="number"||field.rules.min!==undefined||field.rules.max!==undefined){
  if(value.length>0){
   const number=Number(value);
   if(!Number.isFinite(number))add("invalid-number");
   else{
    if(field.rules.min!==undefined&&number<field.rules.min)add("below-minimum");
    if(field.rules.max!==undefined&&number>field.rules.max)add("above-maximum");
   }
  }
 }
 if(field.kind==="date"&&!isRealDate(value))add("invalid-date");
 if(field.rules.choices&&!field.rules.choices.includes(value))add("invalid-choice");
 if(field.rules.dependsOn){
  const dependency=fieldById(form,field.rules.dependsOn);
  if(!dependency||isEmptyValue(dependency.value)||(
   field.rules.dependsValue!==undefined&&dependency.value!==field.rules.dependsValue))add("dependency-unmet","cross-field");
 }
 if(field.rules.confirmationOf){
  const original=fieldById(form,field.rules.confirmationOf);
  if(!original||original.value!==raw)add("confirmation-mismatch","cross-field");
 }
 if(field.rules.uniqueWithin){
  const group=form.fields.filter((candidate)=>candidate.id!==field.id&&candidate.rules.uniqueWithin===field.rules.uniqueWithin);
  if(group.some((candidate)=>normalizeFieldValue(candidate.value)===value))add("duplicate-value","cross-field");
 }
 return {fieldId:field.id,valid:issues.length===0,value,issues};
}
export function validateGroup(form:FormDefinition,group:FormGroup):FieldIssue[]{
 const members=group.fieldIds.map((id)=>fieldById(form,id)).filter((field):field is FormField=>!!field&&!field.disabled&&!field.hidden);
 const selected=members.filter((field)=>field.value==="true"||field.value==="1"||field.value==="on"||field.value===field.id);
 const issues:FieldIssue[]=[];
 const anchor=members[0]??form.fields[0];
 if(!anchor)return issues;
 if(group.required&&selected.length===0)issues.push(issue(anchor,"group-required","group"));
 if(selected.length<group.minimumSelected||(
  group.maximumSelected!==null&&selected.length>group.maximumSelected)){
  issues.push(issue(anchor,"group-selection-count","group"));
 }
 return issues;
}
export function validateForm(form:FormDefinition,policy:ValidationPolicy=DEFAULT_POLICY):FormResult{
 const fields=orderedFields(form);
 const issues:FieldIssue[]=[];
 if(!ID.test(form.id))issues.push({fieldId:form.id,code:"form-id-invalid",severity:"error",message:MESSAGES["form-id-invalid"],order:-1,source:"contract"});
 if(fields.length>Math.min(form.maximumFields,policy.maximumFields)){
  issues.push({fieldId:form.id,code:"limit-exceeded",severity:"error",message:MESSAGES["limit-exceeded"],order:-1,source:"contract"});
 }
 const ids=new Set<string>();
 for(const field of fields){
  if(!ID.test(field.id))issues.push(issue(field,"field-id-invalid","contract"));
  if(ids.has(field.id))issues.push(issue(field,"duplicate-id","contract"));
  ids.add(field.id);
 }
 const results=fields.map((field)=>validateField(form,field,policy));
 for(const result of results)issues.push(...result.issues);
 for(const group of form.groups)issues.push(...validateGroup(form,group));
 const capped=issues.slice(0,policy.maximumIssues);
 const first=capped.find((item)=>item.severity==="error"&&item.fieldId!==form.id)?.fieldId??null;
 return {formId:form.id,valid:capped.every((item)=>item.severity!=="error"),fields:results,issues:capped,
  firstInvalidFieldId:first,errorCount:capped.filter((item)=>item.severity==="error").length,
  reviewCount:capped.filter((item)=>item.severity==="review").length};
}
export function issuesForField(result:FormResult,fieldId:string):FieldIssue[]{return result.issues.filter((item)=>item.fieldId===fieldId);}
export function fieldResult(result:FormResult,fieldId:string):FieldResult|undefined{return result.fields.find((field)=>field.fieldId===fieldId);}
export function hasFieldError(result:FormResult,fieldId:string):boolean{return issuesForField(result,fieldId).some((item)=>item.severity==="error");}
export function issueCodes(result:FormResult,fieldId?:string):IssueCode[]{return result.issues.filter((item)=>fieldId===undefined||item.fieldId===fieldId).map((item)=>item.code);}
export function messageForIssue(code:IssueCode,locale:Locale):string{return MESSAGES[code][locale];}
export function copyForIssues(issues:readonly FieldIssue[],locale:Locale):string[]{
 return issues.map((item)=>`${item.fieldId}: ${item.message[locale]}`);
}
export function mergeFormValues(form:FormDefinition,values:Readonly<Record<string,string>>):FormDefinition{
 return {...form,fields:form.fields.map((field)=>Object.hasOwn(values,field.id)?{...field,value:values[field.id]??field.value}:field)};
}
export function clearFieldValue(form:FormDefinition,fieldId:string):FormDefinition{
 return {...form,fields:form.fields.map((field)=>field.id===fieldId?{...field,value:""}:field)};
}
export function replaceField(form:FormDefinition,updated:FormField):FormDefinition{
 return {...form,fields:form.fields.map((field)=>field.id===updated.id?updated:field)};
}
export function formValueDigest(form:FormDefinition):string{
 return form.fields.slice().sort((a,b)=>a.id.localeCompare(b.id)).map((field)=>`${field.id.length}:${field.id}${field.value.length}:${field.value}`).join("|");
}
export function validateFormCopy(form:FormDefinition,locale:Locale):{
 title:string;valid:string;invalid:string;errorCount:string;firstField:string;
}{
 const result=validateForm(form);
 return {
  title:locale==="fr"?"Examen des champs":"Field review",
  valid:locale==="fr"?"Aucune erreur de champ.":"No field errors.",
  invalid:locale==="fr"?"Certains champs nécessitent une correction.":"Some fields need attention.",
  errorCount:locale==="fr"?`${result.errorCount} erreurs`:`${result.errorCount} errors`,
  firstField:result.firstInvalidFieldId??"UNKNOWN",
 };
}
export function validateFormBatch(forms:readonly FormDefinition[],policy:ValidationPolicy=DEFAULT_POLICY):FormResult[]{
 return forms.map((form)=>validateForm(form,policy));
}
export function formResultSummary(result:FormResult):string{
 return [`Form: ${result.formId}`,`Valid: ${result.valid?"yes":"no"}`,`Fields: ${result.fields.length}`,
  `Errors: ${result.errorCount}`,`Reviews: ${result.reviewCount}`,`First: ${result.firstInvalidFieldId??"UNKNOWN"}`].join("\n");
}
