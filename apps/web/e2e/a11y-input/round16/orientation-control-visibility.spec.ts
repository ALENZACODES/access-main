import { expect, test } from "@playwright/test";
import { fixture, expectNoHorizontalOverflow, visibleState, box } from "./visual-harness";

test.describe("P16 round 16 control visibility across orientation",()=>{
  test("primary button visible in portrait",async({page})=>{
    await fixture(page,`<button id="action">Continue</button>`);await page.setViewportSize({width:320,height:720});await expect(page.locator("#action")).toBeVisible();
  });
  test("primary button visible in landscape",async({page})=>{
    await fixture(page,`<button id="action">Continue</button>`);await page.setViewportSize({width:720,height:320});await expect(page.locator("#action")).toBeVisible();
  });
  test("primary button visible after focus in portrait",async({page})=>{
    await fixture(page,`<button id="action">Continue</button>`);await page.setViewportSize({width:320,height:720});await page.locator("#action").focus();expect((await visibleState(page,"#action")).visible).toBe(true);
  });
  test("primary button visible after focus in landscape",async({page})=>{
    await fixture(page,`<button id="action">Continue</button>`);await page.setViewportSize({width:720,height:320});await page.locator("#action").focus();expect((await visibleState(page,"#action")).visible).toBe(true);
  });
  test("input visible in portrait",async({page})=>{
    await fixture(page,`<label for="name">Name</label><input id="name">`);await page.setViewportSize({width:320,height:720});await expect(page.getByLabel("Name")).toBeVisible();
  });
  test("input visible in landscape",async({page})=>{
    await fixture(page,`<label for="name">Name</label><input id="name">`);await page.setViewportSize({width:720,height:320});await expect(page.getByLabel("Name")).toBeVisible();
  });
  test("select visible in portrait",async({page})=>{
    await fixture(page,`<label for="choice">Choice</label><select id="choice"><option>One</option></select>`);await page.setViewportSize({width:320,height:720});await expect(page.getByLabel("Choice")).toBeVisible();
  });
  test("select visible in landscape",async({page})=>{
    await fixture(page,`<label for="choice">Choice</label><select id="choice"><option>One</option></select>`);await page.setViewportSize({width:720,height:320});await expect(page.getByLabel("Choice")).toBeVisible();
  });
  test("target does not extend beyond portrait viewport",async({page})=>{
    await fixture(page,`<button id="action">Continue</button>`);await page.setViewportSize({width:320,height:720});const b=await box(page,"#action");expect(b.left).toBeGreaterThanOrEqual(0);expect(b.right).toBeLessThanOrEqual(320);
  });
  test("target does not extend beyond landscape viewport",async({page})=>{
    await fixture(page,`<button id="action">Continue</button>`);await page.setViewportSize({width:720,height:320});const b=await box(page,"#action");expect(b.left).toBeGreaterThanOrEqual(0);expect(b.right).toBeLessThanOrEqual(720);
  });
  test("all controls fit after rotation",async({page})=>{
    await fixture(page,`<label for="name">Name</label><input id="name"><button>Continue</button>`);await page.setViewportSize({width:320,height:720});await expectNoHorizontalOverflow(page);await page.setViewportSize({width:720,height:320});await expectNoHorizontalOverflow(page);
  });
  test("all controls fit after reverse rotation",async({page})=>{
    await fixture(page,`<label for="name">Name</label><input id="name"><button>Continue</button>`);await page.setViewportSize({width:720,height:320});await expectNoHorizontalOverflow(page);await page.setViewportSize({width:320,height:720});await expectNoHorizontalOverflow(page);
  });
  test("orientation changes do not lose typed value",async({page})=>{
    await fixture(page,`<label for="name">Name</label><input id="name">`);await page.locator("#name").fill("Alex");await page.setViewportSize({width:720,height:320});await expect(page.locator("#name")).toHaveValue("Alex");
  });
  test("orientation changes do not change focused control",async({page})=>{
    await fixture(page,`<button id="action">Continue</button>`);await page.locator("#action").focus();await page.setViewportSize({width:720,height:320});await expect(page.locator("#action")).toBeFocused();
  });
  test("orientation changes do not change accessible name",async({page})=>{
    await fixture(page,`<button>Continue</button>`);await page.setViewportSize({width:320,height:720});await expect(page.getByRole("button",{name:"Continue"})).toHaveCount(1);
  });
  test("orientation changes do not change control role",async({page})=>{
    await fixture(page,`<button>Continue</button>`);await page.setViewportSize({width:720,height:320});await expect(page.getByRole("button")).toHaveCount(1);
  });
});
