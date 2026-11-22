import { expect, test } from "@playwright/test";
import { fixture } from "./harness";

async function semantics(page: import("@playwright/test").Page, markup: string): Promise<void> {
  await fixture(page, markup);
}
test.describe("P16 round 15 assistive-technology semantics",()=>{
  test("document exposes English language",async({page})=>{
    await semantics(page,`<p>Content</p>`);
    await expect(page.locator("html")).toHaveAttribute("lang","en");
  });
  test("document exposes French language when selected",async({page})=>{
    await semantics(page,`<p>Contenu</p>`);
    await page.locator("html").evaluate(node=>node.setAttribute("lang","fr"));
    await expect(page.locator("html")).toHaveAttribute("lang","fr");
  });
  test("main landmark is exposed",async({page})=>{
    await semantics(page,`<section><h2>Content</h2></section>`);
    await expect(page.getByRole("main")).toHaveCount(1);
  });
  test("navigation landmark is exposed",async({page})=>{
    await semantics(page,`<nav aria-label="Primary"><a href="#home">Home</a></nav>`);
    await expect(page.getByRole("navigation",{name:"Primary"})).toHaveCount(1);
  });
  test("complementary landmark is exposed",async({page})=>{
    await semantics(page,`<aside aria-label="Related links">Links</aside>`);
    await expect(page.getByRole("complementary",{name:"Related links"})).toHaveCount(1);
  });
  test("banner landmark is exposed",async({page})=>{
    await page.setContent(`<html lang="en"><body><header><p>Header</p></header><main><h1>Page</h1></main></body></html>`);
    await expect(page.getByRole("banner")).toHaveCount(1);
  });
  test("contentinfo landmark is exposed",async({page})=>{
    await page.setContent(`<html lang="en"><body><main><h1>Page</h1></main><footer><p>Footer</p></footer></body></html>`);
    await expect(page.getByRole("contentinfo")).toHaveCount(1);
  });
  test("heading levels remain queryable",async({page})=>{
    await semantics(page,`<h2>Section</h2><h3>Subsection</h3>`);
    await expect(page.getByRole("heading",{level:2,name:"Section"})).toHaveCount(1);
    await expect(page.getByRole("heading",{level:3,name:"Subsection"})).toHaveCount(1);
  });
  test("list is exposed as a list",async({page})=>{
    await semantics(page,`<ul><li>One</li><li>Two</li></ul>`);
    await expect(page.getByRole("list")).toHaveCount(1);
  });
  test("list item count is preserved",async({page})=>{
    await semantics(page,`<ul><li>One</li><li>Two</li><li>Three</li></ul>`);
    await expect(page.getByRole("listitem")).toHaveCount(3);
  });
  test("ordered list remains ordered",async({page})=>{
    await semantics(page,`<ol><li>First</li><li>Second</li></ol>`);
    await expect(page.locator("ol")).toHaveCount(1);
  });
  test("table row and header relationships remain queryable",async({page})=>{
    await semantics(page,`<table><caption>Places</caption><thead><tr><th scope="col">Name</th></tr></thead><tbody><tr><td>One</td></tr></tbody></table>`);
    await expect(page.getByRole("table",{name:"Places"})).toHaveCount(1);
    await expect(page.getByRole("columnheader",{name:"Name"})).toHaveCount(1);
  });
  test("table cell remains associated with header",async({page})=>{
    await semantics(page,`<table><caption>Places</caption><tr><th id="name" scope="col">Name</th></tr><tr><td headers="name">One</td></tr></table>`);
    await expect(page.getByRole("cell",{name:"One"})).toHaveCount(1);
  });
  test("definition list exposes terms and definitions",async({page})=>{
    await semantics(page,`<dl><dt>Unknown</dt><dd>Not supplied</dd></dl>`);
    await expect(page.getByText("Unknown")).toBeVisible();
    await expect(page.getByText("Not supplied")).toBeVisible();
  });
  test("blockquote remains text content",async({page})=>{
    await semantics(page,`<blockquote>Quoted information</blockquote>`);
    await expect(page.locator("blockquote")).toHaveText("Quoted information");
  });
  test("code remains distinct from prose",async({page})=>{
    await semantics(page,`<p>Use <code>Tab</code> to move.</p>`);
    await expect(page.locator("code")).toHaveText("Tab");
  });
  test("hidden decorative content is excluded from role query",async({page})=>{
    await semantics(page,`<button><span aria-hidden="true">+</span><span>Expand</span></button>`);
    await expect(page.getByRole("button",{name:"Expand"})).toHaveCount(1);
  });
  test("expanded state is exposed on disclosure button",async({page})=>{
    await semantics(page,`<button aria-expanded="false" aria-controls="panel">Show</button><div id="panel" hidden>Details</div>`);
    await expect(page.getByRole("button",{name:"Show"})).toHaveAttribute("aria-expanded","false");
  });
  test("checked state is exposed on checkbox",async({page})=>{
    await semantics(page,`<label><input type="checkbox" checked>Agree</label>`);
    await expect(page.getByRole("checkbox",{name:"Agree"})).toBeChecked();
  });
  test("selected state is exposed on option",async({page})=>{
    await semantics(page,`<div role="listbox" aria-label="Choice"><div role="option" aria-selected="true">One</div></div>`);
    await expect(page.getByRole("option",{name:"One"})).toHaveAttribute("aria-selected","true");
  });
  test("disabled state is exposed on button",async({page})=>{
    await semantics(page,`<button disabled>Unavailable</button>`);
    await expect(page.getByRole("button",{name:"Unavailable"})).toBeDisabled();
  });
  test("required state is exposed on input",async({page})=>{
    await semantics(page,`<label for="name">Name</label><input id="name" required>`);
    await expect(page.getByLabel("Name")).toHaveAttribute("required","");
  });
  test("invalid state is exposed on input",async({page})=>{
    await semantics(page,`<label for="name">Name</label><input id="name" aria-invalid="true">`);
    await expect(page.getByLabel("Name")).toHaveAttribute("aria-invalid","true");
  });
  test("error message is connected to invalid field",async({page})=>{
    await semantics(page,`<label for="name">Name</label><input id="name" aria-invalid="true" aria-describedby="error"><p id="error">Required</p>`);
    await expect(page.getByLabel("Name")).toHaveAttribute("aria-describedby","error");
  });
  test("current page is exposed on navigation link",async({page})=>{
    await semantics(page,`<nav aria-label="Primary"><a href="#home" aria-current="page">Home</a></nav>`);
    await expect(page.getByRole("link",{name:"Home"})).toHaveAttribute("aria-current","page");
  });
  test("progress indicator exposes value",async({page})=>{
    await semantics(page,`<div role="progressbar" aria-label="Progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="30"></div>`);
    await expect(page.getByRole("progressbar",{name:"Progress"})).toHaveAttribute("aria-valuenow","30");
  });
  test("meter exposes numeric range",async({page})=>{
    await semantics(page,`<label for="meter">Completion</label><meter id="meter" min="0" max="10" value="5"></meter>`);
    await expect(page.getByLabel("Completion")).toHaveAttribute("value","5");
  });
  test("status role is queryable without moving focus",async({page})=>{
    await semantics(page,`<button id="action">Action</button><p role="status">Ready</p>`);
    await page.locator("#action").focus();
    await expect(page.getByRole("status")).toHaveText("Ready");
    await expect(page.locator("#action")).toBeFocused();
  });
  test("alert role is queryable",async({page})=>{
    await semantics(page,`<p role="alert">Unable to continue</p>`);
    await expect(page.getByRole("alert")).toHaveText("Unable to continue");
  });
  test("time element exposes machine-readable date",async({page})=>{
    await semantics(page,`<time datetime="2026-11-21">November 21</time>`);
    await expect(page.locator("time")).toHaveAttribute("datetime","2026-11-21");
  });
  test("abbr exposes its expansion",async({page})=>{
    await semantics(page,`<abbr title="Accessible Rich Internet Applications">ARIA</abbr>`);
    await expect(page.locator("abbr")).toHaveAttribute("title","Accessible Rich Internet Applications");
  });
});
