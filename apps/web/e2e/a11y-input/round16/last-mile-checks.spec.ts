import { expect, test } from "@playwright/test";
import { fixture, expectNoHorizontalOverflow } from "./visual-harness";

test.describe("P16 round 16 last-mile resilience checks",()=>{
  test("language and viewport changes preserve accessible name",async({page})=>{
    await fixture(page,`<button>Continue</button>`);await page.locator("html").evaluate(node=>node.setAttribute("lang","fr"));await page.setViewportSize({width:320,height:720});await expect(page.getByRole("button",{name:"Continue"})).toHaveCount(1);
  });
  test("text scaling and orientation preserve accessible name",async({page})=>{
    await fixture(page,`<button>Continue</button>`);await page.addStyleTag({content:"html{font-size:300%!important}"});await page.setViewportSize({width:720,height:320});await expect(page.getByRole("button",{name:"Continue"})).toHaveCount(1);
  });
  test("display preferences and viewport preserve route",async({page})=>{
    await fixture(page,`<p>Content</p>`);const url=page.url();await page.emulateMedia({forcedColors:"active",reducedMotion:"reduce"});await page.setViewportSize({width:320,height:720});expect(page.url()).toBe(url);
  });
  test("combined settings preserve one primary heading",async({page})=>{
    await fixture(page,`<p>Content</p>`);await page.emulateMedia({forcedColors:"active",reducedMotion:"reduce",contrast:"more"});await page.addStyleTag({content:"html{font-size:400%!important}"});await page.setViewportSize({width:320,height:720});await expect(page.getByRole("heading",{level:1})).toHaveCount(1);
  });
  test("combined settings do not create horizontal page overflow",async({page})=>{
    await fixture(page,`<div class="row"><button>One</button><button>Two</button></div>`);await page.emulateMedia({forcedColors:"active",reducedMotion:"reduce",contrast:"more"});await page.addStyleTag({content:"html{font-size:400%!important}"});await page.setViewportSize({width:320,height:720});await expectNoHorizontalOverflow(page);
  });
});

test("resize preserves existing form value",async({page})=>{
  await fixture(page,`<label for="name">Name</label><input id="name" value="Alex">`);
  await page.setViewportSize({width:320,height:720});
  await expect(page.locator("#name")).toHaveValue("Alex");
});
test("reduced motion does not disable keyboard focus",async({page})=>{
  await fixture(page,`<button id="action">Continue</button>`);
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.locator("#action").focus();
  await expect(page.locator("#action")).toBeFocused();
});

test("forced colors do not remove the focusable target",async({page})=>{
  await fixture(page,`<button id="action">Continue</button>`);
  await page.emulateMedia({forcedColors:"active"});
  await page.locator("#action").focus();
  await expect(page.locator("#action")).toBeFocused();
});
test("text scaling does not remove the main landmark",async({page})=>{
  await fixture(page,`<p>Content</p>`);
  await page.addStyleTag({content:"html{font-size:400%!important}"});
  await expect(page.getByRole("main")).toHaveCount(1);
});

test("viewport resizing does not remove the page title",async({page})=>{
  await fixture(page,`<p>Content</p>`);
  const title=await page.title();
  await page.setViewportSize({width:320,height:720});
  await expect(page).toHaveTitle(title);
});
test("contrast preference does not remove the primary action",async({page})=>{
  await fixture(page,`<button>Continue</button>`);
  await page.emulateMedia({contrast:"more"});
  await expect(page.getByRole("button",{name:"Continue"})).toBeVisible();
});

test("orientation change preserves the heading text",async({page})=>{
  await fixture(page,`<h2>Details</h2>`);
  await page.setViewportSize({width:720,height:320});
  await expect(page.getByRole("heading",{name:"Details"})).toBeVisible();
});
test("text spacing override preserves the page title",async({page})=>{
  await fixture(page,`<p>Content</p>`);
  const title=await page.title();
  await page.addStyleTag({content:"body{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}"});
  await expect(page).toHaveTitle(title);
});

test("font scaling preserves page title",async({page})=>{
  await fixture(page,`<p>Content</p>`);
  const title=await page.title();
  await page.addStyleTag({content:"html{font-size:400%!important}"});
  await expect(page).toHaveTitle(title);
});

test("forced colors preserves document title",async({page})=>{
  await fixture(page,`<p>Content</p>`);
  const title=await page.title();
  await page.emulateMedia({forcedColors:"active"});
  await expect(page).toHaveTitle(title);
});
