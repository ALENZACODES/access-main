import type { Page } from "@playwright/test";
import type { Locale } from "./p20ah-form-validation.ts";
export interface ObservedField {
 readonly id:string; readonly kind:string; readonly labelText:string; readonly labelFor:string|null;
 readonly accessibleName:string; readonly valueLength:number; readonly required:boolean; readonly disabled:boolean;
 readonly hidden:boolean; readonly invalid:string|null; readonly describedBy:readonly string[];
 readonly errorId:string|null; readonly errorText:string|null; readonly errorRole:string|null; readonly errorLive:string|null;
 readonly width:number; readonly height:number; readonly visible:boolean; readonly focused:boolean;
}
export interface ObservedGroup {
 readonly id:string; readonly legend:string; readonly kind:string;
 readonly memberIds:readonly string[]; readonly selectedCount:number;
}
export interface FormObservation {
 readonly formId:string; readonly locale:Locale|"UNKNOWN"; readonly fields:readonly ObservedField[];
 readonly groups:readonly ObservedGroup[]; readonly summaryId:string|null;
 readonly summaryText:string|null; readonly summaryRole:string|null; readonly summaryLive:string|null;
 readonly summaryLinks:readonly string[]; readonly activeId:string|null; readonly observedAt:number;
}
export async function observeForm(page:Page,formId:string):Promise<FormObservation>{
 if(!/^[A-Za-z][A-Za-z0-9_-]{0,127}$/.test(formId))throw new Error("Form id is invalid");
 return page.evaluate((id)=>{
  const form=document.getElementById(id);
  if(!(form instanceof HTMLFormElement))throw new Error("Form element was not found");
  const visible=(element:HTMLElement)=>{
   const style=getComputedStyle(element);
   return style.display!=="none"&&style.visibility!=="hidden"&&!element.closest("[hidden],[inert],[aria-hidden=true]");
  };
  const labelsOf=(element:HTMLElement):NodeListOf<HTMLLabelElement>|null=>{
   if(element instanceof HTMLInputElement||element instanceof HTMLSelectElement
     ||element instanceof HTMLTextAreaElement||element instanceof HTMLButtonElement)return element.labels;
   return null;
  };
  const name=(element:HTMLElement)=>{
   const ids=(element.getAttribute("aria-labelledby")??"").split(/\s+/).filter(Boolean);
   const labelled=ids.map((key)=>document.getElementById(key)?.textContent??"").join(" ");
   return (element.getAttribute("aria-label")||labelled||labelsOf(element)?.[0]?.textContent||element.textContent||"").trim().replace(/\s+/g," ");
  };
  const fields=Array.from(form.querySelectorAll<HTMLElement>("input,select,textarea,button,[contenteditable=true]")).map((element)=>{
   const rect=element.getBoundingClientRect();
   const describedBy=(element.getAttribute("aria-describedby")??"").split(/\s+/).filter(Boolean);
   const errorId=describedBy.find((key)=>key.endsWith("-error"))??null;
   const error=errorId?document.getElementById(errorId):null;
   const errorStyle=error instanceof HTMLElement?error.getAttribute("role"):null;
   const errorLive=error instanceof HTMLElement?error.getAttribute("aria-live"):null;
   return {
    id:element.id,kind:element.getAttribute("type")||element.localName,labelText:labelsOf(element)?.[0]?.textContent?.trim()??"",
    labelFor:labelsOf(element)?.[0]?.htmlFor??null,accessibleName:name(element),valueLength:"value" in element?String((element as HTMLInputElement).value).length:0,
    required:"required" in element?Boolean((element as HTMLInputElement).required):element.getAttribute("aria-required")==="true",
    disabled:"disabled" in element?Boolean((element as HTMLInputElement).disabled):element.getAttribute("aria-disabled")==="true",
    hidden:!visible(element),invalid:element.getAttribute("aria-invalid"),describedBy,errorId,
    errorText:error?.textContent?.trim()??null,errorRole:errorStyle,errorLive,
    width:rect.width,height:rect.height,visible:visible(element),focused:document.activeElement===element,
   };
  });
  const groups=Array.from(form.querySelectorAll<HTMLElement>("fieldset")).map((element)=>{
   const legend=element.querySelector("legend")?.textContent?.trim()??"";
   const members=Array.from(element.querySelectorAll<HTMLInputElement>("input[type=checkbox],input[type=radio]"));
   return {id:element.id,legend,kind:members[0]?.type??"other",memberIds:members.map((member)=>member.id),
    selectedCount:members.filter((member)=>member.checked).length};
  });
  const summary=form.querySelector<HTMLElement>("[data-error-summary],#error-summary,[role=alert]");
  const active=document.activeElement instanceof HTMLElement?document.activeElement.id||null:null;
  const locale=document.documentElement.lang.toLowerCase();
  return {
   formId:id,locale:locale.startsWith("fr")?"fr":locale.startsWith("en")?"en":"UNKNOWN",
   fields,groups,summaryId:summary?.id??null,summaryText:summary?.textContent?.trim()??null,
   summaryRole:summary?.getAttribute("role")??null,summaryLive:summary?.getAttribute("aria-live")??null,
   summaryLinks:Array.from(summary?.querySelectorAll<HTMLAnchorElement>("a[href]")??[]).map((link)=>link.getAttribute("href")??""),
   activeId:active,observedAt:Date.now(),
  };
 },formId);
}
export async function focusFirstInvalid(page:Page,formId:string):Promise<{before:string|null;after:string|null;target:string|null}>{
 const before=await page.evaluate(()=>document.activeElement instanceof HTMLElement?document.activeElement.id||null:null);
 const target=await page.locator(`#${formId} [aria-invalid="true"]`).first().getAttribute("id");
 if(target)await page.locator(`#${target}`).focus();
 const after=await page.evaluate(()=>document.activeElement instanceof HTMLElement?document.activeElement.id||null:null);
 return {before,after,target};
}
export async function submitAndObserve(page:Page,formId:string):Promise<FormObservation>{
 await page.locator(`#${formId} button[type=submit],#${formId} input[type=submit]`).first().click();
 return observeForm(page,formId);
}
