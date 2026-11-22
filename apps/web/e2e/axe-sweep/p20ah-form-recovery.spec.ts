import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { observeForm, focusFirstInvalid } from "./p20ah-browser-form.ts";

const enForm = `<!doctype html><html lang="en"><head><title>Contact form</title>
<style>*{box-sizing:border-box}body{font:16px/1.5 sans-serif;padding:24px;max-width:760px}
label{display:block;margin-block:8px 4px}input,button{min-width:44px;min-height:44px;padding:8px}
:focus-visible{outline:3px solid #174ea6;outline-offset:2px}
[role=alert]{border:2px solid #8b1e1e;padding:12px;margin-block:16px}
.error{display:block;color:#8b1e1e}</style></head><body><main><h1>Contact details</h1>
<form id="contact" novalidate>
<div id="error-summary" data-error-summary role="alert" aria-live="assertive" tabindex="-1" hidden>
<h2>There are items to correct</h2><p id="error-intro"></p><ul id="error-list"></ul></div>
<label for="email">Email address</label><input id="email" name="email" type="email" required aria-describedby="email-description">
<p id="email-description">Use an address where a reply can be received.</p><p id="email-error" class="error" hidden></p>
<label for="name">Name</label><input id="name" name="name" required aria-describedby="name-description">
<p id="name-description">Enter the name to use in this form.</p><p id="name-error" class="error" hidden></p>
<fieldset><legend>Preferred contact method</legend>
<label><input id="contact-email" type="checkbox" name="contact" value="email"> Email</label>
<label><input id="contact-phone" type="checkbox" name="contact" value="phone"> Phone</label></fieldset>
<button id="submit" type="submit">Review details</button>
</form></main>
<script>
const form=document.querySelector("#contact"),summary=document.querySelector("#error-summary");
const fields=[{id:"email",message:"Enter an email address in the expected format."},{id:"name",message:"Enter a value."}];
function validate(){
 const errors=[];
 for(const item of fields){
  const input=document.getElementById(item.id),error=document.getElementById(item.id+"-error");
  const invalid=input.required&&!input.value.trim()||(item.id==="email"&&input.value&&!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/.test(input.value));
  input.setAttribute("aria-invalid",String(Boolean(invalid)));
  if(invalid){error.textContent=item.message;error.hidden=false;input.setAttribute("aria-describedby",item.id+"-description "+item.id+"-error");errors.push(item);}
  else{error.textContent="";error.hidden=true;input.setAttribute("aria-describedby",item.id+"-description");}
 }
 const list=document.querySelector("#error-list");list.replaceChildren();
 for(const item of errors){const li=document.createElement("li"),link=document.createElement("a");
  link.href="#"+item.id;link.textContent=document.querySelector('label[for="'+item.id+'"]').textContent+": "+item.message;
  li.append(link);list.append(li);}
 document.querySelector("#error-intro").textContent=errors.length+" errors in this form.";
 summary.hidden=errors.length===0;
 return errors;
}
form.addEventListener("submit",event=>{
 event.preventDefault();const errors=validate();
 if(errors.length){summary.focus();return;}
 summary.hidden=true;document.querySelector("#submit").textContent="Details reviewed";
});
document.querySelector("#error-list").addEventListener("click",event=>{
 const link=event.target.closest("a[href]");if(link){event.preventDefault();document.querySelector(link.getAttribute("href")).focus();}
});
</script></body></html>`;

const frForm = `<!doctype html><html lang="fr"><head><title>Coordonnées</title>
<style>*{box-sizing:border-box}body{font:16px/1.5 sans-serif;padding:24px;max-width:760px}
label{display:block;margin-block:8px 4px}input,button{min-width:44px;min-height:44px;padding:8px}
:focus-visible{outline:3px solid #174ea6;outline-offset:2px}
[role=alert]{border:2px solid #8b1e1e;padding:12px;margin-block:16px}
.error{display:block;color:#8b1e1e}</style></head><body><main><h1>Coordonnées</h1>
<form id="contact" novalidate>
<div id="error-summary" data-error-summary role="alert" aria-live="assertive" tabindex="-1" hidden>
<h2>Il y a des éléments à corriger</h2><p id="error-intro"></p><ul id="error-list"></ul></div>
<label for="email">Adresse courriel</label><input id="email" name="email" type="email" required aria-describedby="email-description">
<p id="email-description">Utilisez une adresse où une réponse peut être reçue.</p><p id="email-error" class="error" hidden></p>
<label for="name">Nom</label><input id="name" name="name" required aria-describedby="name-description">
<p id="name-description">Saisissez le nom à utiliser dans ce formulaire.</p><p id="name-error" class="error" hidden></p>
<button id="submit" type="submit">Examiner les coordonnées</button></form></main>
<script>
const form=document.querySelector("#contact"),summary=document.querySelector("#error-summary");
const fields=[{id:"email",message:"Saisissez une adresse courriel au format attendu."},{id:"name",message:"Saisissez une valeur."}];
function validate(){
 const errors=[];
 for(const item of fields){
  const input=document.getElementById(item.id),error=document.getElementById(item.id+"-error");
  const invalid=input.required&&!input.value.trim()||(item.id==="email"&&input.value&&!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/.test(input.value));
  input.setAttribute("aria-invalid",String(Boolean(invalid)));
  if(invalid){error.textContent=item.message;error.hidden=false;input.setAttribute("aria-describedby",item.id+"-description "+item.id+"-error");errors.push(item);}
  else{error.textContent="";error.hidden=true;input.setAttribute("aria-describedby",item.id+"-description");}
 }
 const list=document.querySelector("#error-list");list.replaceChildren();
 for(const item of errors){const li=document.createElement("li"),link=document.createElement("a");
  link.href="#"+item.id;link.textContent=document.querySelector('label[for="'+item.id+'"]').textContent+" : "+item.message;
  li.append(link);list.append(li);}
 document.querySelector("#error-intro").textContent=errors.length+" erreurs dans ce formulaire.";
 summary.hidden=errors.length===0;
 return errors;
}
form.addEventListener("submit",event=>{
 event.preventDefault();const errors=validate();
 if(errors.length){summary.focus();return;}
 summary.hidden=true;document.querySelector("#submit").textContent="Coordonnées examinées";
});
document.querySelector("#error-list").addEventListener("click",event=>{
 const link=event.target.closest("a[href]");if(link){event.preventDefault();document.querySelector(link.getAttribute("href")).focus();}
});
</script></body></html>`;

test.describe("P20AH English form error recovery", () => {
  test.beforeEach(async ({ page }) => { await page.setContent(enForm); });

  test("P20AH invalid submit presents an error summary and moves focus", async ({ page }) => {
    await page.locator("#submit").click();
    await expect(page.locator("#error-summary")).toBeVisible();
    await expect(page.locator("#error-summary")).toBeFocused();
    await expect(page.locator("#email")).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#name")).toHaveAttribute("aria-invalid", "true");
    const observation = await observeForm(page, "contact");
    expect(observation.locale).toBe("en");
    expect(observation.summaryLinks).toEqual(["#email", "#name"]);
  });

  test("P20AH summary link moves focus to the matching invalid field", async ({ page }) => {
    await page.locator("#submit").click();
    await page.locator("#error-list a").first().click();
    await expect(page.locator("#email")).toBeFocused();
  });

  test("P20AH correcting one field clears only its field error", async ({ page }) => {
    await page.locator("#submit").click();
    await page.locator("#email").fill("person@example.ca");
    await page.locator("#submit").click();
    await expect(page.locator("#email")).toHaveAttribute("aria-invalid", "false");
    await expect(page.locator("#name")).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#error-summary")).toBeVisible();
  });

  test("P20AH completing all required fields clears the summary", async ({ page }) => {
    await page.locator("#submit").click();
    await page.locator("#email").fill("person@example.ca");
    await page.locator("#name").fill("Ada");
    await page.locator("#submit").click();
    await expect(page.locator("#error-summary")).toBeHidden();
    await expect(page.locator("#submit")).toHaveText("Details reviewed");
  });

  test("P20AH field descriptions and errors are associated through described-by", async ({ page }) => {
    await page.locator("#submit").click();
    await expect(page.locator("#email")).toHaveAttribute("aria-describedby", "email-description email-error");
    await expect(page.locator("#email-error")).toContainText("expected format");
  });

  test("P20AH form observation reports visible labels and groups", async ({ page }) => {
    const observation = await observeForm(page, "contact");
    expect(observation.fields.find((field) => field.id === "email")?.labelText).toBe("Email address");
    expect(observation.groups[0]?.legend).toBe("Preferred contact method");
    expect(observation.groups[0]?.memberIds).toEqual(["contact-email", "contact-phone"]);
  });

  test("P20AH focused first invalid helper reports observed target", async ({ page }) => {
    await page.locator("#submit").click();
    const result = await focusFirstInvalid(page, "contact");
    expect(result.target).toBe("email");
    expect(result.after).toBe("email");
  });

  test("P20AH form with valid values has no axe violations", async ({ page }) => {
    await page.locator("#email").fill("person@example.ca");
    await page.locator("#name").fill("Ada");
    const result = await new AxeBuilder({ page }).analyze();
    expect(result.violations).toEqual([]);
  });

  test("P20AH invalid form summary has no axe violations", async ({ page }) => {
    await page.locator("#submit").click();
    const result = await new AxeBuilder({ page }).analyze();
    expect(result.violations).toEqual([]);
  });
});

test("P20AH French error summary uses French labels and moves focus", async ({ page }) => {
  await page.setContent(frForm);
  await page.locator("#submit").click();
  await expect(page.locator("#error-summary")).toBeVisible();
  await expect(page.locator("#error-summary")).toBeFocused();
  await expect(page.locator("#email")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#error-list")).toContainText("Adresse courriel :");
  const observation = await observeForm(page, "contact");
  expect(observation.locale).toBe("fr");
  expect(observation.summaryLinks).toEqual(["#email", "#name"]);
});

test("P20AH French field errors clear when corrected", async ({ page }) => {
  await page.setContent(frForm);
  await page.locator("#submit").click();
  await page.locator("#email").fill("person@example.ca");
  await page.locator("#name").fill("Ada");
  await page.locator("#submit").click();
  await expect(page.locator("#error-summary")).toBeHidden();
});
