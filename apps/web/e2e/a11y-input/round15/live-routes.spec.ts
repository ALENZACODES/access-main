import { expect, test, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const sourceRoot = resolve(import.meta.dirname, "../../../src");
function source(path: string): string {
  const full = resolve(sourceRoot, path);
  return existsSync(full) ? readFileSync(full, "utf8") : "";
}
function routePaths(): string[] {
  const found = new Set<string>(["/"]);
  const router = source("router.tsx");
  for (const match of router.matchAll(/path:\s*"([^"]+)"/g)) {
    const value = match[1];
    if (!value || value === "/" || value === "*" || value.includes(":")) continue;
    found.add(`/${value.replace(/^\//,"").replace(/\/\*$/,"")}`);
  }
  return [...found];
}
async function visit(page: Page, path: string): Promise<void> {
  const response = await page.goto(path,{waitUntil:"domcontentloaded"});
  expect(response,`Route ${path} must return a response`).not.toBeNull();
  expect(response?.ok(),`Route ${path} must load successfully`).toBe(true);
  await expect(page.locator("html")).toHaveAttribute("lang",/^(en|fr)(-|$)/);
  await expect(page.locator("main,[role=main]")).toHaveCount(1);
  await expect(page.getByRole("heading",{level:1})).toHaveCount(1);
}
async function routeFocusSnapshot(page: Page): Promise<{id:string;role:string;name:string;hidden:boolean;disabled:boolean}> {
  return page.evaluate(()=>{
    const node=document.activeElement;
    if(!(node instanceof HTMLElement))return {id:"",role:"none",name:"",hidden:true,disabled:true};
    const style=getComputedStyle(node),rect=node.getBoundingClientRect();
    return {
      id:node.id,
      role:node.getAttribute("role")??node.localName,
      name:node.getAttribute("aria-label")?.trim()||node.textContent?.trim()||"",
      hidden:rect.width===0||rect.height===0||style.display==="none"||style.visibility==="hidden"||!!node.closest("[inert],[aria-hidden=true]"),
      disabled:node.matches(":disabled,[aria-disabled=true]"),
    };
  });
}
for(const path of routePaths()){
  test.describe(`P16 round 15 live keyboard route ${path}`,()=>{
    test.beforeEach(async({page})=>visit(page,path));
    test("route has one primary landmark and one page heading",async({page})=>{
      await expect(page.locator("main,[role=main]")).toHaveCount(1);
      await expect(page.getByRole("heading",{level:1})).toHaveCount(1);
    });
    test("first Tab reaches a rendered enabled target",async({page})=>{
      await page.evaluate(()=>{
        const body=document.body;const old=body.getAttribute("tabindex");body.setAttribute("tabindex","-1");body.focus();
        if(old===null)body.removeAttribute("tabindex");else body.setAttribute("tabindex",old);
      });
      await page.keyboard.press("Tab");
      const snapshot=await routeFocusSnapshot(page);
      expect(snapshot.role).not.toBe("none");
      expect(snapshot.hidden).toBe(false);
      expect(snapshot.disabled).toBe(false);
      expect(snapshot.name.length).toBeGreaterThan(0);
    });
    test("Shift Tab from a known control moves to a different control or document boundary",async({page})=>{
      const first=page.locator("a[href],button,input:not([type=hidden]),select,textarea").first();
      if(await first.count()===0)test.skip(true,"Route has no native sequential controls");
      await first.focus();
      const before=await routeFocusSnapshot(page);
      await page.keyboard.press("Shift+Tab");
      const after=await routeFocusSnapshot(page);
      expect(after.id!==before.id||after.hidden).toBe(true);
    });
    test("focus does not activate navigation by itself",async({page})=>{
      const before=page.url();
      const link=page.locator("nav a[href]").filter({hasNot:page.locator("[aria-disabled=true]")}).first();
      if(await link.count()===0)test.skip(true,"Route has no enabled navigation link");
      await link.focus();
      expect(page.url()).toBe(before);
    });
    test("visible controls expose stable labels",async({page})=>{
      const controls=page.locator("button,a[href],input:not([type=hidden]),select,textarea");
      const count=await controls.count();
      for(let index=0;index<count;index++){
        const control=controls.nth(index);
        if(!(await control.isVisible()))continue;
        const label=await control.getAttribute("aria-label");
        const text=await control.innerText().catch(()=> "");
        const value=await control.getAttribute("value");
        const title=await control.getAttribute("title");
        const labelledBy=await control.getAttribute("aria-labelledby");
        const hasNativeLabel=await control.evaluate(node=>
          node instanceof HTMLInputElement||node instanceof HTMLSelectElement||node instanceof HTMLTextAreaElement
            ? Array.from(node.labels??[]).some(item=>Boolean(item.textContent?.trim())) : false);
        expect(Boolean(label?.trim()||text.trim()||value?.trim()||title?.trim()||labelledBy||hasNativeLabel),
          `Visible control ${index} on ${path} needs a name`).toBe(true);
      }
    });
    test("no visible sequential control uses a positive tabindex",async({page})=>{
      const values=await page.locator("a[href],button,input:not([type=hidden]),select,textarea,[tabindex]").evaluateAll(nodes=>
        nodes.filter(node=>node instanceof HTMLElement&&node.getClientRects().length>0&&node.tabIndex>0)
          .map(node=>({id:node.id,tabIndex:(node as HTMLElement).tabIndex})));
      expect(values).toEqual([]);
    });
    test("Escape does not cause an unrelated route change",async({page})=>{
      const before=page.url();
      await page.keyboard.press("Escape");
      expect(page.url()).toBe(before);
    });
    test("language remains declared after keyboard navigation",async({page})=>{
      await page.keyboard.press("Tab");
      await expect(page.locator("html")).toHaveAttribute("lang",/^(en|fr)(-|$)/);
    });
  });
}
