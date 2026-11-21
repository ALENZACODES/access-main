import type { Page } from "@playwright/test";
import type { DialogObservation, FocusNode, FocusRole, Rect } from "./p20ag-focus-contracts.ts";

export interface ObserveFocusOptions {
  readonly dialogId?: string;
  readonly includeHidden?: boolean;
  readonly maximumNodes?: number;
}
export async function observeDialog(page:Page,options:ObserveFocusOptions={}):Promise<DialogObservation>{
  return page.evaluate(({dialogId,includeHidden,maximumNodes})=>{
    const selector = [
      "a[href]","button","input:not([type=hidden])","select","textarea","summary",
      "[tabindex]","[role=button]","[role=link]","[role=checkbox]","[role=radio]",
      "[role=tab]","[role=textbox]","[role=dialog]","dialog","[id]",
    ].join(",");
    const candidates=Array.from(document.querySelectorAll<HTMLElement>(selector));
    const visible=(element:HTMLElement)=>{
      const style=getComputedStyle(element);
      return style.display!=="none"&&style.visibility!=="hidden"&&!element.closest("[hidden],[inert],[aria-hidden=true]");
    };
    const roleOf=(element:HTMLElement):FocusRole=>{
      const role=element.getAttribute("role");
      if(role==="button"||role==="link"||role==="textbox"||role==="checkbox"||role==="radio"||role==="tab"||role==="summary"||role==="dialog")return role;
      if(element.localName==="button")return "button";
      if(element.localName==="a")return "link";
      if(element.localName==="input"||element.localName==="textarea")return "textbox";
      if(element.localName==="summary")return "summary";
      if(element.localName==="dialog")return "dialog";
      return "other";
    };
    const nameOf=(element:HTMLElement)=>{
      const refs=(element.getAttribute("aria-labelledby")??"").split(/\s+/).filter(Boolean);
      const referenced=refs.map((id)=>document.getElementById(id)?.textContent??"").join(" ");
      return (element.getAttribute("aria-label")||referenced||element.textContent||element.getAttribute("placeholder")||"")
        .trim().replace(/\s+/g," ").slice(0,160);
    };
    const target=dialogId?document.getElementById(dialogId):document.querySelector("dialog[open],[role=dialog]");
    if(!(target instanceof HTMLElement))throw new Error("Dialog target was not found");
    const dialog=target as HTMLDialogElement;
    const id=dialog.id||dialog.getAttribute("data-testid")||"dialog";
    const all=candidates.slice(0,maximumNodes).filter((element)=>includeHidden||visible(element));
    const nodes:FocusNode[]=all.map((element,index)=>{
      const rect=element.getBoundingClientRect();
      const style=getComputedStyle(element);
      const tabIndex=element.tabIndex;
      const disabled=("disabled" in element&&Boolean((element as HTMLButtonElement).disabled))
        ||element.getAttribute("aria-disabled")==="true";
      const hiddenByAria=element.getAttribute("aria-hidden")==="true"||!!element.closest("[aria-hidden=true]");
      const inert=element.inert||!!element.closest("[inert]");
      const focusable=element.matches("a[href],button,input:not([type=hidden]),select,textarea,summary,[tabindex],[role=button],[role=link],[role=checkbox],[role=radio],[role=tab],[role=textbox]");
      const scope=element===target?id:element.closest("dialog[open],[role=dialog]")?.id||null;
      const outlineWidth=Number.parseFloat(style.outlineWidth)||0;
      const box:Rect={left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom,width:rect.width,height:rect.height};
      return {
        id:element.id||`observed-${index}`,role:roleOf(element),name:nameOf(element),domOrder:index,
        tabIndex,visible:visible(element),enabled:!disabled,inert,ariaHidden:hiddenByAria,focusable,
        rect:box,scopeId:scope,outlineStyle:style.outlineStyle,outlineWidth,
        outlineOffset:Number.parseFloat(style.outlineOffset)||0,boxShadow:style.boxShadow,
      };
    });
    const active=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const activeId=active?.id??null;
    const triggerId=dialog.getAttribute("data-trigger-id")||null;
    const label=dialog.getAttribute("aria-labelledby")||null;
    const description=dialog.getAttribute("aria-describedby")||null;
    const open=dialog.localName==="dialog"?(dialog as HTMLDialogElement).open:dialog.getAttribute("aria-hidden")!=="true";
    const modal=dialog.localName==="dialog"?(dialog as HTMLDialogElement).matches(":modal"):dialog.getAttribute("aria-modal")==="true";
    const dismissible=dialog.getAttribute("data-dismissible")!=="false"&&dialog.getAttribute("data-esc-dismiss")!=="false";
    const background=Array.from(document.body.children).filter((child)=>child!==dialog&&!child.contains(dialog));
    const backgroundInert=(dialog.localName==="dialog"&&modal)||(
      background.length>0&&background.every((child)=>
        (child instanceof HTMLElement&&child.inert)||child.getAttribute("aria-hidden")==="true"));
    return {id,open,modal,dismissible,labelledBy:label,describedBy:description,activeId,triggerId,
      parentDialogId:dialog.parentElement?.closest("dialog[open],[role=dialog]")?.id||null,nodes,backgroundInert};
  },{dialogId:options.dialogId??"",includeHidden:options.includeHidden??true,maximumNodes:options.maximumNodes??500});
}
export async function activeFocusSnapshot(page:Page):Promise<{id:string|null;name:string;visible:boolean;tabIndex:number}>{
  return page.evaluate(()=>{
    const element=document.activeElement instanceof HTMLElement?document.activeElement:null;
    if(!element)return {id:null,name:"",visible:false,tabIndex:-1};
    const style=getComputedStyle(element);
    const name=(element.getAttribute("aria-label")||element.textContent||element.localName).trim().replace(/\s+/g," ").slice(0,120);
    return {id:element.id||null,name,visible:style.display!=="none"&&style.visibility!=="hidden",tabIndex:element.tabIndex};
  });
}
export async function pressTabAndObserve(page:Page,backwards=false):Promise<{before:string|null;after:string|null;key:string}>{
  const before=await page.evaluate(()=>document.activeElement instanceof HTMLElement?document.activeElement.id||null:null);
  await page.keyboard.press(backwards?"Shift+Tab":"Tab");
  const after=await page.evaluate(()=>document.activeElement instanceof HTMLElement?document.activeElement.id||null:null);
  return {before,after,key:backwards?"Shift+Tab":"Tab"};
}
export async function dialogIsOpen(page:Page,id:string):Promise<boolean>{
  if(!/^[A-Za-z][A-Za-z0-9_-]{0,127}$/.test(id))throw new Error("Dialog id is invalid");
  return page.locator(`#${id}`).evaluate((element)=>
    element.localName==="dialog"?(element as HTMLDialogElement).open:element.getAttribute("aria-hidden")!=="true");
}
