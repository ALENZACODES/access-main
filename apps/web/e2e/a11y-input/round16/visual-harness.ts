import { expect, type Page } from "@playwright/test";

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}
export interface OverflowRecord {
  readonly selector: string;
  readonly scrollWidth: number;
  readonly clientWidth: number;
  readonly scrollHeight: number;
  readonly clientHeight: number;
  readonly horizontal: boolean;
  readonly vertical: boolean;
}
export interface VisibilityRecord {
  readonly selector: string;
  readonly visible: boolean;
  readonly clipped: boolean;
  readonly obscured: boolean;
  readonly box: Box;
}
export interface PreferenceSnapshot {
  readonly forcedColors: boolean;
  readonly reducedMotion: boolean;
  readonly contrast: string;
  readonly colorScheme: string;
  readonly viewport: { width: number; height: number };
}
export interface SpacingSnapshot {
  readonly lineHeight: number;
  readonly fontSize: number;
  readonly letterSpacing: number;
  readonly wordSpacing: number;
  readonly paragraphGap: number;
}
export interface ContrastResult {
  readonly foreground: string;
  readonly background: string;
  readonly ratio: number;
}
export async function fixture(page: Page, body: string, style = ""): Promise<void> {
  await page.setContent(`<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Visual resilience fixture</title>
<style>
  :root { color-scheme: light; font-family: Arial,sans-serif; font-size:16px; }
  * { box-sizing:border-box; }
  body { margin:0; padding:16px; color:#18232d; background:#fff; line-height:1.5; }
  main { max-width:72rem; margin-inline:auto; }
  button,a,input,select,textarea,summary { min-width:44px; min-height:44px; }
  button,a { padding:8px 12px; }
  a { color:#064b83; }
  :focus-visible { outline:3px solid #064b83; outline-offset:3px; }
  .row { display:flex; flex-wrap:wrap; gap:12px; }
  .card { min-width:0; padding:12px; border:1px solid #687783; }
  .wide { width:100%; max-width:100%; }
  img,svg,video,canvas { max-width:100%; }
  table { max-width:100%; border-collapse:collapse; }
  td,th { padding:8px; border:1px solid #687783; }
  [hidden] { display:none!important; }
  ${style}
</style>
</head>
<body><main><h1>Visual resilience fixture</h1>${body}</main></body></html>`);
}
export async function box(page: Page, selector: string): Promise<Box> {
  return page.locator(selector).evaluate(node => {
    const r=node.getBoundingClientRect();
    return {x:r.x,y:r.y,width:r.width,height:r.height,top:r.top,right:r.right,bottom:r.bottom,left:r.left};
  });
}
export async function overflow(page: Page, selector = "body"): Promise<OverflowRecord> {
  return page.locator(selector).evaluate((node, target) => {
    const el=node as HTMLElement;
    return {
      selector:target,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,
      scrollHeight:el.scrollHeight,clientHeight:el.clientHeight,
      horizontal:el.scrollWidth>el.clientWidth+1,
      vertical:el.scrollHeight>el.clientHeight+1,
    };
  },selector);
}
export async function expectNoHorizontalOverflow(page: Page, selector = "body"): Promise<void> {
  const result=await overflow(page,selector);
  expect(result.horizontal,`${selector} horizontal overflow ${result.scrollWidth}/${result.clientWidth}`).toBe(false);
}
export async function visibleState(page: Page, selector: string): Promise<VisibilityRecord> {
  return page.locator(selector).evaluate((node, target) => {
    const el=node as HTMLElement,r=el.getBoundingClientRect(),style=getComputedStyle(el);
    const visible=r.width>0&&r.height>0&&style.display!=="none"&&style.visibility!=="hidden";
    const clipped=r.right>innerWidth||r.left<0||r.bottom>innerHeight||r.top<0;
    const cx=Math.min(innerWidth-1,Math.max(0,r.left+r.width/2));
    const cy=Math.min(innerHeight-1,Math.max(0,r.top+r.height/2));
    const hit=document.elementFromPoint(cx,cy);
    const obscured=!!hit&&!el.contains(hit)&&!hit.contains(el);
    return {selector:target,visible,clipped,obscured,box:{x:r.x,y:r.y,width:r.width,height:r.height,top:r.top,right:r.right,bottom:r.bottom,left:r.left}};
  },selector);
}
export async function preferenceSnapshot(page: Page): Promise<PreferenceSnapshot> {
  return page.evaluate(()=>({
    forcedColors:matchMedia("(forced-colors: active)").matches,
    reducedMotion:matchMedia("(prefers-reduced-motion: reduce)").matches,
    contrast:matchMedia("(prefers-contrast: more)").matches?"more":matchMedia("(prefers-contrast: less)").matches?"less":"no-preference",
    colorScheme:matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light",
    viewport:{width:innerWidth,height:innerHeight},
  }));
}
export async function spacing(page: Page, selector: string): Promise<SpacingSnapshot> {
  return page.locator(selector).evaluate(node=>{
    const style=getComputedStyle(node),font=parseFloat(style.fontSize)||16;
    const line=parseFloat(style.lineHeight)||font*1.5;
    const paragraph=node.parentElement?parseFloat(getComputedStyle(node.parentElement).rowGap)||0:0;
    return {lineHeight:line,fontSize:font,letterSpacing:style.letterSpacing==="normal"?0:parseFloat(style.letterSpacing)||0,wordSpacing:style.wordSpacing==="normal"?0:parseFloat(style.wordSpacing)||0,paragraphGap:paragraph};
  });
}
function channel(value: number): number {
  const normalized=value/255;
  return normalized<=0.04045?normalized/12.92:((normalized+0.055)/1.055)**2.4;
}
function luminance(color: string): number {
  const values=color.match(/[\\d.]+/g)?.map(Number)??[];
  if(values.length<3)return 0;
  return 0.2126*channel(values[0]??0)+0.7152*channel(values[1]??0)+0.0722*channel(values[2]??0);
}
export function contrastRatio(foreground: string, background: string): number {
  const a=luminance(foreground),b=luminance(background);
  const light=Math.max(a,b),dark=Math.min(a,b);
  return (light+0.05)/(dark+0.05);
}
export async function contrast(page: Page, selector: string): Promise<ContrastResult> {
  return page.locator(selector).evaluate(node=>{
    const style=getComputedStyle(node);
    const fg=style.color,bg=style.backgroundColor;
    const parse=(value:string):number=>{
      const values=value.match(/[\\d.]+/g)?.map(Number)??[];
      if(values.length<3)return 0;
      const convert=(n:number)=>{const v=n/255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;};
      return 0.2126*convert(values[0]??0)+0.7152*convert(values[1]??0)+0.0722*convert(values[2]??0);
    };
    const l1=parse(fg),l2=parse(bg),hi=Math.max(l1,l2),lo=Math.min(l1,l2);
    return {foreground:fg,background:bg,ratio:(hi+0.05)/(lo+0.05)};
  });
}
export async function focusAndInspect(page: Page, selector: string): Promise<{focused:boolean;outline:string;outlineWidth:number;shadow:string}> {
  const locator=page.locator(selector);
  await expect(locator).toBeVisible();
  await locator.focus();
  return locator.evaluate(node=>{
    const style=getComputedStyle(node);
    return {focused:document.activeElement===node,outline:style.outlineStyle,outlineWidth:parseFloat(style.outlineWidth)||0,shadow:style.boxShadow};
  });
}
export async function applyTextSpacing(page: Page, selector = "body"): Promise<void> {
  await page.addStyleTag({content:`${selector}{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important} ${selector} p{margin-block-end:2em!important}`});
}
export async function scrollTo(page: Page, selector: string): Promise<void> {
  await page.locator(selector).evaluate(node=>node.scrollIntoView({block:"start",inline:"nearest"}));
}
export async function setViewport(page: Page, width: number, height: number): Promise<void> {
  await page.setViewportSize({width,height});
}
export async function assertTarget(page: Page, selector: string, minimum = 44): Promise<void> {
  const size=await page.locator(selector).evaluate(node=>{const r=node.getBoundingClientRect();return {width:r.width,height:r.height};});
  expect(size.width,`${selector} width`).toBeGreaterThanOrEqual(minimum);
  expect(size.height,`${selector} height`).toBeGreaterThanOrEqual(minimum);
}
export async function focusVisible(page: Page, selector: string): Promise<void> {
  const result=await focusAndInspect(page,selector);
  expect(result.focused).toBe(true);
  expect(result.outline==="none"||result.outlineWidth<2?result.shadow==="none":false).toBe(false);
}
export async function setFontScale(page: Page, percent: number): Promise<void> {
  await page.addStyleTag({content:`html{font-size:${percent}%!important}`});
}
export async function noClippedText(page: Page, selector: string): Promise<void> {
  const clipped=await page.locator(selector).evaluateAll(nodes=>nodes.filter(node=>{
    const el=node as HTMLElement;
    return el.scrollWidth>el.clientWidth+1||el.scrollHeight>el.clientHeight+1;
  }).map(node=>(node as HTMLElement).id||node.tagName.toLowerCase()));
  expect(clipped,`${selector} clipped content`).toEqual([]);
}
