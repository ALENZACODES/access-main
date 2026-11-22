import { expect, test } from "@playwright/test";
import { fixture } from "./harness";

async function nameFixture(page: import("@playwright/test").Page, markup: string): Promise<void> {
  await fixture(page, markup);
}
test.describe("P16 round 15 accessible-name and description contracts",()=>{
  test("button text supplies its accessible name",async({page})=>{
    await nameFixture(page,`<button id="action">Continue</button>`);
    await expect(page.getByRole("button",{name:"Continue"})).toHaveCount(1);
  });
  test("aria-label supplies name for icon-only button",async({page})=>{
    await nameFixture(page,`<button aria-label="Close"><span aria-hidden="true">x</span></button>`);
    await expect(page.getByRole("button",{name:"Close"})).toHaveCount(1);
  });
  test("aria-labelledby supplies button name",async({page})=>{
    await nameFixture(page,`<span id="label">Open settings</span><button aria-labelledby="label"></button>`);
    await expect(page.getByRole("button",{name:"Open settings"})).toHaveCount(1);
  });
  test("associated label supplies input name",async({page})=>{
    await nameFixture(page,`<label for="name">Your name</label><input id="name">`);
    await expect(page.getByRole("textbox",{name:"Your name"})).toHaveCount(1);
  });
  test("wrapped label supplies checkbox name",async({page})=>{
    await nameFixture(page,`<label><input type="checkbox">Include archived</label>`);
    await expect(page.getByRole("checkbox",{name:"Include archived"})).toHaveCount(1);
  });
  test("title does not replace a missing native label",async({page})=>{
    await nameFixture(page,`<input id="field" title="Helpful title">`);
    await expect(page.getByRole("textbox",{name:"Helpful title"})).toHaveCount(1);
  });
  test("aria-describedby supplies description separately from name",async({page})=>{
    await nameFixture(page,`<label for="email">Email</label><input id="email" aria-describedby="hint"><p id="hint">We use this to send updates.</p>`);
    await expect(page.getByRole("textbox", { name: "Email" })).toHaveAccessibleDescription("We use this to send updates.");
  });
  test("multiple described-by nodes are combined",async({page})=>{
    await nameFixture(page,`<label for="email">Email</label><input id="email" aria-describedby="hint format"><p id="hint">Required</p><p id="format">Use an email address</p>`);
    await expect(page.getByRole("textbox", { name: "Email" })).toHaveAccessibleDescription("Required Use an email address");
  });
  test("missing aria-labelledby target does not create an accessible name",async({page})=>{
    await nameFixture(page,`<button aria-labelledby="missing"></button>`);
    await expect(page.getByRole("button",{name:""})).toHaveCount(1);
  });
  test("hidden text referenced by aria-labelledby remains available to name",async({page})=>{
    await nameFixture(page,`<span id="label" hidden>Continue</span><button aria-labelledby="label"></button>`);
    await expect(page.getByRole("button",{name:"Continue"})).toHaveCount(1);
  });
  test("placeholder is not used as the only label",async({page})=>{
    await nameFixture(page,`<input id="query" placeholder="Search">`);
    await expect(page.locator("#query")).toHaveAttribute("placeholder","Search");
  });
  test("submit input has value-based name",async({page})=>{
    await nameFixture(page,`<input type="submit" value="Send">`);
    await expect(page.getByRole("button",{name:"Send"})).toHaveCount(1);
  });
  test("image link exposes alternative text",async({page})=>{
    await nameFixture(page,`<a href="#target"><img alt="Open map" src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="></a><p id="target">Map</p>`);
    await expect(page.getByRole("link",{name:"Open map"})).toHaveCount(1);
  });
  test("image with empty alternative is decorative inside named link",async({page})=>{
    await nameFixture(page,`<a href="#target" aria-label="Open map"><img alt="" src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="></a><p id="target">Map</p>`);
    await expect(page.getByRole("link",{name:"Open map"})).toHaveCount(1);
  });
  test("navigation landmark receives explicit name",async({page})=>{
    await nameFixture(page,`<nav aria-label="Primary"><a href="#home">Home</a></nav><section id="home">Home</section>`);
    await expect(page.getByRole("navigation",{name:"Primary"})).toHaveCount(1);
  });
  test("region landmark receives explicit name",async({page})=>{
    await nameFixture(page,`<section aria-label="Search results">Results</section>`);
    await expect(page.getByRole("region",{name:"Search results"})).toHaveCount(1);
  });
  test("tab panel references its tab label",async({page})=>{
    await nameFixture(page,`<div role="tablist" aria-label="Sections"><button role="tab" id="tab" aria-selected="true" aria-controls="panel">Summary</button></div><section role="tabpanel" id="panel" aria-labelledby="tab">Body</section>`);
    await expect(page.getByRole("tabpanel",{name:"Summary"})).toHaveCount(1);
  });
  test("dialog heading supplies its name",async({page})=>{
    await nameFixture(page,`<dialog open aria-labelledby="title"><h2 id="title">Preferences</h2></dialog>`);
    await expect(page.getByRole("dialog",{name:"Preferences"})).toHaveCount(1);
  });
  test("status role is discoverable by role",async({page})=>{
    await nameFixture(page,`<p role="status">Saved</p>`);
    await expect(page.getByRole("status")).toHaveText("Saved");
  });
  test("alert role is discoverable by role",async({page})=>{
    await nameFixture(page,`<p role="alert">Unable to save</p>`);
    await expect(page.getByRole("alert")).toHaveText("Unable to save");
  });
  test("progressbar requires a label",async({page})=>{
    await nameFixture(page,`<div role="progressbar" aria-label="Loading" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50"></div>`);
    await expect(page.getByRole("progressbar",{name:"Loading"})).toHaveCount(1);
  });
  test("meter exposes a value and accessible name",async({page})=>{
    await nameFixture(page,`<label for="meter">Completion</label><meter id="meter" min="0" max="100" value="50"></meter>`);
    await expect(page.getByRole("meter", { name: "Completion" })).toHaveJSProperty("value", 50);
  });
  test("output can be associated with its source input",async({page})=>{
    await nameFixture(page,`<label for="amount">Amount</label><input id="amount" type="number" value="3"><output id="result" for="amount">3</output>`);
    await expect(page.locator("#result")).toHaveAttribute("for","amount");
  });
  test("fieldset legend provides group context",async({page})=>{
    await nameFixture(page,`<fieldset><legend>Contact method</legend><label><input type="radio" name="contact">Email</label></fieldset>`);
    await expect(page.getByRole("group",{name:"Contact method"})).toHaveCount(1);
  });
  test("table caption provides table name",async({page})=>{
    await nameFixture(page,`<table><caption>Locations</caption><tr><th scope="col">Name</th></tr><tr><td>One</td></tr></table>`);
    await expect(page.getByRole("table",{name:"Locations"})).toHaveCount(1);
  });
});
